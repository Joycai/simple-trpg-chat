import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|twitter-image|manifest.webmanifest|sitemap.xml|robots.txt|icon-192.png|icon-512.png|favicon-16.png|favicon-48.png|favicon-64.png|logo.svg|login|register).*)",
  ],
};
