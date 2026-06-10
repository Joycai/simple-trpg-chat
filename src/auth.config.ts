import type { NextAuthConfig } from "next-auth";

// In-memory cache: userId → { sessionToken, expires }
const sessionCache = new Map<string, { token: string; expires: number }>();
const CACHE_TTL = 30000; // 30 seconds

async function isSessionValid(userId: string, tokenSession: string): Promise<boolean> {
  const cached = sessionCache.get(userId);
  const now = Date.now();
  if (cached && cached.expires > now) {
    return cached.token === tokenSession;
  }
  // Cache miss — query DB
  try {
    const { db } = await import("./db");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select({ sessionToken: users.sessionToken }).from(users).where(eq(users.id, parseInt(userId)));
    const dbToken = user?.sessionToken || null;
    sessionCache.set(userId, { token: dbToken || "", expires: now + CACHE_TTL });
    return dbToken === tokenSession;
  } catch {
    return true; // DB error: don't block user
  }
}

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
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
        // Validate single-session token against DB (cached)
        if (token.sessionToken && token.sub) {
          const valid = await isSessionValid(token.sub, token.sessionToken as string);
          if (!valid) {
            // Session was invalidated by a newer login
            (session as any).invalidated = true;
            return session;
          }
        }
        (session.user as any).role = token.role;
        (session.user as any).username = token.username;
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
