import type { NextAuthConfig } from "next-auth";

// In-memory cache: userId → { sessionToken, isBanned, expires }
const sessionCache = new Map<string, { token: string; isBanned: boolean; expires: number }>();
const CACHE_TTL = 30000; // 30 seconds

export function invalidateSessionCache(userId: string) {
  sessionCache.delete(userId);
}

// Why a session is no longer valid:
//   - "valid"          → token matches, not banned
//   - "token_mismatch" → another login rotated the token (single-session "顶号")
//   - "banned"         → account banned by an admin
//   - "unavailable"    → DB error; fail-closed, treat as invalid without a specific notice
export type SessionStatus = "valid" | "token_mismatch" | "banned" | "unavailable";

/** Look up the IP of the account's most recent login — shown to the kicked user. */
async function getLatestLoginIp(userId: string): Promise<string | undefined> {
  try {
    const { db } = await import("./db");
    const { loginHistory } = await import("./db/schema");
    const { eq, desc } = await import("drizzle-orm");
    const [row] = await db
      .select({ ip: loginHistory.ipAddress })
      .from(loginHistory)
      .where(eq(loginHistory.userId, parseInt(userId)))
      .orderBy(desc(loginHistory.loginAt))
      .limit(1);
    return row?.ip || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve why (if at all) a session is invalid. Token/ban lookup is cached (30s);
 * the latest-login IP is fetched fresh only on the rare token-mismatch path.
 */
export async function getSessionStatus(
  userId: string,
  tokenSession: string,
): Promise<{ status: SessionStatus; kickedFromIp?: string }> {
  // Read the token/ban state from the DB and refresh the cache. Throws on DB error.
  async function loadFresh(): Promise<{ token: string; isBanned: boolean }> {
    const { db } = await import("./db");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select({ sessionToken: users.sessionToken, isBanned: users.isBanned }).from(users).where(eq(users.id, parseInt(userId)));
    const token = user?.sessionToken || "";
    const isBanned = !!user?.isBanned;
    sessionCache.set(userId, { token, isBanned, expires: Date.now() + CACHE_TTL });
    return { token, isBanned };
  }

  const now = Date.now();
  let dbToken: string;
  let isBanned: boolean;
  let fromCache: boolean;

  const cached = sessionCache.get(userId);
  if (cached && cached.expires > now) {
    dbToken = cached.token;
    isBanned = cached.isBanned;
    fromCache = true;
  } else {
    try {
      ({ token: dbToken, isBanned } = await loadFresh());
      fromCache = false;
    } catch {
      return { status: "unavailable" }; // DB error: block user (fail-closed)
    }
  }

  if (isBanned) return { status: "banned" };
  if (dbToken !== tokenSession) {
    // A mismatch kicks the user — never do that on a possibly-stale cache entry.
    // The cache is per-runtime/per-worker (Edge middleware vs Node, and per prod
    // worker) and isn't reached by login's invalidateSessionCache(), so a freshly
    // rotated token can mismatch a warm stale entry. Re-read the DB once to confirm.
    if (fromCache) {
      try {
        ({ token: dbToken, isBanned } = await loadFresh());
      } catch {
        return { status: "unavailable" };
      }
      if (isBanned) return { status: "banned" };
      if (dbToken === tokenSession) return { status: "valid" };
    }
    return { status: "token_mismatch", kickedFromIp: await getLatestLoginIp(userId) };
  }
  return { status: "valid" };
}

export const authConfig = {
  trustHost: process.env.NODE_ENV === "development" || process.env.AUTH_TRUST_HOST === "true",
  useSecureCookies: process.env.NODE_ENV === "production",
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const invalid = auth as
        | { invalidated?: boolean; invalidatedReason?: SessionStatus; invalidatedIp?: string }
        | null;
      if (invalid?.invalidated) {
        // Kicked by a newer login → send back to /login with a "logged in elsewhere" notice.
        // Other invalid reasons (banned / DB error) fall through to the default login redirect.
        if (invalid.invalidatedReason === "token_mismatch") {
          const url = new URL("/login", nextUrl);
          url.searchParams.set("reason", "elsewhere");
          if (invalid.invalidatedIp) url.searchParams.set("ip", invalid.invalidatedIp);
          return Response.redirect(url);
        }
        return false;
      }

      const isLoggedIn = !!auth?.user;
      const isOnAdmin = nextUrl.pathname.startsWith("/admin");
      const isOnLogin = nextUrl.pathname.startsWith("/login");

      const isAdmin = auth?.user?.role === "admin";

      if (isOnAdmin) {
        if (isLoggedIn && isAdmin) return true;
        return false;
      }

      if (isOnLogin && isLoggedIn) {
        if (isAdmin) return Response.redirect(new URL("/admin", nextUrl));
        return Response.redirect(new URL("/", nextUrl));
      }

      if (isLoggedIn && isAdmin && nextUrl.pathname === "/") {
        return Response.redirect(new URL("/admin", nextUrl));
      }

      // Redirect unauthenticated users to login for all protected routes
      if (!isLoggedIn) return Response.redirect(new URL("/login", nextUrl));

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.username = user.username;
        token.sessionToken = (user as { sessionToken?: string }).sessionToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // NextAuth v5 beta callback types don't surface augmented Session fields; cast required
        (session.user as { role: string; username: string; id: string }).role = (token.role as string) ?? "";
        (session.user as { role: string; username: string; id: string }).username = (token.username as string) ?? "";
        (session.user as { role: string; username: string; id: string }).id = token.sub ?? "";
        // Validate single-session token against DB (cached), carrying the reason
        // so the kicked user can be told they were logged in elsewhere.
        if (token.sessionToken && token.sub) {
          const inv = session as { invalidated?: boolean; invalidatedReason?: SessionStatus; invalidatedIp?: string };
          try {
            const { status, kickedFromIp } = await getSessionStatus(token.sub, token.sessionToken as string);
            if (status !== "valid") {
              inv.invalidated = true;
              inv.invalidatedReason = status;
              if (kickedFromIp) inv.invalidatedIp = kickedFromIp;
            }
          } catch {
            inv.invalidated = true; // validation failure is blocking (fail-closed)
            inv.invalidatedReason = "unavailable";
          }
        }
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
