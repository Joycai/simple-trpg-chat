/**
 * proxy.ts — Next.js 16 proxy (replaces middleware.ts)
 *
 * Lightweight auth guard for Edge Runtime.
 * Only checks session cookie presence — actual token validation
 * happens server-side via auth() in each page/layout.
 * Zero Node.js 'fs' dependency, fully edge-compatible.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths — no auth needed
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/apple-touch-icon")
  ) {
    return NextResponse.next();
  }

  // Check session cookie (edge-compatible, no fs dependency)
  const sessionToken =
    req.cookies.get("next-auth.session-token")?.value ||
    req.cookies.get("__Secure-next-auth.session-token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", encodeURI(pathname));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|apple-touch-icon|login).*)",
  ],
};
