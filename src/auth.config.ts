import type { NextAuthConfig } from "next-auth";

// Why a session is no longer valid:
//   - "valid"          → token matches, not banned
//   - "token_mismatch" → another login rotated the token (single-session "顶号")
//   - "banned"         → account banned by an admin
//   - "unavailable"    → DB error; fail-closed, treat as invalid without a specific notice
type InvalidSessionStatus = "token_mismatch" | "banned" | "unavailable";
type SessionCheck =
  | { status: "valid"; role: string }
  | { status: InvalidSessionStatus; kickedFromIp?: string };

/** Look up the IP of the account's most recent login — shown to the kicked user. */
async function getLatestLoginIp(userId: string): Promise<string | undefined> {
  try {
    const { db } = await import("./db/index");
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

/** Read session state from PostgreSQL so revocation is visible to every worker. */
export async function getSessionStatus(
  userId: string,
  tokenSession: string,
): Promise<SessionCheck> {
  try {
    const { db } = await import("./db/index");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db
      .select({ sessionToken: users.sessionToken, isBanned: users.isBanned, role: users.role })
      .from(users)
      .where(eq(users.id, parseInt(userId)));
    if (user?.isBanned) return { status: "banned" };
    if (!user?.sessionToken || user.sessionToken !== tokenSession) {
      return { status: "token_mismatch", kickedFromIp: await getLatestLoginIp(userId) };
    }
    return { status: "valid", role: user.role };
  } catch {
    return { status: "unavailable" };
  }
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
        | { invalidated?: boolean; invalidatedReason?: InvalidSessionStatus; invalidatedIp?: string }
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
      // /register behaves exactly like /login: public when logged out,
      // redirected away (by role) when already authenticated.
      const isOnLogin = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/register");

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
        token.username = user.username;
        token.sessionToken = (user as { sessionToken?: string }).sessionToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // NextAuth v5 beta callback types don't surface augmented Session fields; cast required
        (session.user as { role: string; username: string; id: string }).username = (token.username as string) ?? "";
        (session.user as { role: string; username: string; id: string }).id = token.sub ?? "";
        const inv = session as { invalidated?: boolean; invalidatedReason?: InvalidSessionStatus; invalidatedIp?: string };
        if (!token.sub || typeof token.sessionToken !== "string" || !token.sessionToken) {
          inv.invalidated = true;
          inv.invalidatedReason = "unavailable";
        } else {
          const check = await getSessionStatus(token.sub, token.sessionToken);
          if (check.status === "valid") {
            // Legacy JWTs can still contain a role from before a demotion.
            (session.user as { role: string }).role = check.role;
          } else {
            inv.invalidated = true;
            inv.invalidatedReason = check.status;
            if (check.kickedFromIp) inv.invalidatedIp = check.kickedFromIp;
          }
        }
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
