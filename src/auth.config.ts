import type { NextAuthConfig } from "next-auth";

// In-memory cache: userId → { sessionToken, isBanned, expires }
const sessionCache = new Map<string, { token: string; isBanned: boolean; expires: number }>();
const CACHE_TTL = 30000; // 30 seconds

export function invalidateSessionCache(userId: string) {
  sessionCache.delete(userId);
}

export async function isSessionValid(userId: string, tokenSession: string): Promise<boolean> {
  const cached = sessionCache.get(userId);
  const now = Date.now();
  if (cached && cached.expires > now) {
    return cached.token === tokenSession && !cached.isBanned;
  }
  // Cache miss — query DB
  try {
    const { db } = await import("./db");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select({ sessionToken: users.sessionToken, isBanned: users.isBanned }).from(users).where(eq(users.id, parseInt(userId)));
    const dbToken = user?.sessionToken || null;
    const isBanned = !!user?.isBanned;
    sessionCache.set(userId, { token: dbToken || "", isBanned, expires: now + CACHE_TTL });
    return dbToken === tokenSession && !isBanned;
  } catch {
    return false; // DB error: block user (fail-closed)
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
      if (auth && (auth as { invalidated?: boolean } | null)?.invalidated) return false;

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
        // Validate single-session token against DB (cached)
        if (token.sessionToken && token.sub) {
          try {
            const valid = await isSessionValid(token.sub, token.sessionToken as string);
            if (!valid) (session as { invalidated?: boolean }).invalidated = true;
          } catch {
            (session as { invalidated?: boolean }).invalidated = true; // validation failure is blocking (fail-closed)
          }
        }
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
