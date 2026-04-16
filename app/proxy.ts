// Route protection proxy.
// Checks for the session cookie without hitting the database — the DB-backed
// session validation happens inside each page/route via auth(). A full Prisma
// lookup in the proxy context causes Neon WebSocket connection failures that
// silently return null, creating an infinite redirect loop.
//
// Unauthenticated: redirect to /login with callbackUrl.
// Authenticated (cookie present): pass through; page validates fully.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { cookies, nextUrl } = request;

  // NextAuth v5 uses __Secure- prefix on HTTPS, plain on HTTP (dev).
  const hasSession =
    cookies.has("__Secure-authjs.session-token") ||
    cookies.has("authjs.session-token");

  if (!hasSession) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    // Protect everything except:
    // - /login, /auth-error (auth pages)
    // - /share/* (public frozen clip pages)
    // - /_next/* (Next.js internals)
    // - /api/auth/* (NextAuth routes)
    // - Static files (favicon, icons, etc.)
    "/((?!login|auth-error|share|lac|_next/static|_next/image|api/auth|api/debug|favicon.ico).*)",
  ],
};
