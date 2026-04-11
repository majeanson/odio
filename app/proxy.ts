// Route protection proxy (renamed from middleware in Next.js 16).
// All routes are protected except /login and /share/[token].
// NextAuth v5 handles session validation automatically when `auth` is used
// as proxy.

export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: [
    // Protect everything except:
    // - /login (sign-in page)
    // - /share/* (public frozen clip pages)
    // - /_next/* (Next.js internals)
    // - /api/auth/* (NextAuth routes)
    // - Static files (favicon, icons, etc.)
    "/((?!login|share|_next/static|_next/image|api/auth|favicon.ico).*)",
  ],
};
