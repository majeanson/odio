import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // LAC views are public — no auth required
  if (pathname.startsWith("/lac")) return NextResponse.next();

  // These routes are always public
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth-error") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Everything else requires a session
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
