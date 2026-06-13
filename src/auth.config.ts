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
      if (auth && (auth as any).invalidated) return false;

      const isLoggedIn = !!auth?.user;
      const isOnAdmin = nextUrl.pathname.startsWith("/admin");
      const isOnLogin = nextUrl.pathname.startsWith("/login");

      const isAdmin = (auth?.user as any)?.role === "admin";

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
        token.role = (user as any).role;
        token.username = (user as any).username;
        token.sessionToken = (user as any).sessionToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).username = token.username;
        (session.user as any).id = token.sub || "";
        // Validate single-session token against DB (cached)
        if (token.sessionToken && token.sub) {
          try {
            const valid = await isSessionValid(token.sub, token.sessionToken as string);
            if (!valid) (session as any).invalidated = true;
          } catch {
            (session as any).invalidated = true; // validation failure is blocking (fail-closed)
          }
        }
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
