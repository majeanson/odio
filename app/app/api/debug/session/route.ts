// Temporary diagnostic route — remove after auth is fixed.
// Shows cookies + auth() result so we can see what's failing.
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll().map((c) => ({
    name: c.name,
    length: c.value.length,
  }));

  let session = null;
  let sessionError = null;
  try {
    session = await auth();
  } catch (e) {
    sessionError = e instanceof Error ? e.message : String(e);
  }

  let dbUsers = null;
  let dbSessions = null;
  let dbError = null;
  try {
    dbUsers = await prisma.user.count();
    dbSessions = await prisma.session.count();
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return Response.json({
    cookies: allCookies,
    session: session ? { user: session.user } : null,
    sessionError,
    db: { users: dbUsers, sessions: dbSessions, error: dbError },
  });
}
