import type { NextAuthConfig } from "next-auth";

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
        // Admin users go directly to admin panel
        if (isAdmin) return Response.redirect(new URL("/admin", nextUrl));
        return Response.redirect(new URL("/", nextUrl));
      }

      // Admin users should not access the lobby — redirect to admin
      if (isLoggedIn && isAdmin && nextUrl.pathname === "/") {
        return Response.redirect(new URL("/admin", nextUrl));
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.username = (user as any).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).username = token.username;
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
  providers: [], // Logic added in auth.ts
} satisfies NextAuthConfig;
