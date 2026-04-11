// GET   /api/bands/[bandId]/sessions/[sessionId] — fetch one session
// PATCH /api/bands/[bandId]/sessions/[sessionId] — rename session or update notes
// DELETE /api/bands/[bandId]/sessions/[sessionId] — delete session (recorder only)

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";

async function verifyMembership(bandId: string, sessionId: string, userEmail: string) {
  const membership = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail } },
  });
  if (!membership) return { membership: null, session: null };

  const session = await prisma.jamSession.findFirst({
    where: { id: sessionId, bandId },
    include: { _count: { select: { clips: true } } },
  });

  return { membership, session };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; sessionId: string }> },
) {
  const authSession = await auth();
  if (!authSession?.user?.email) return apiError("Unauthorized", 401);

  const { bandId, sessionId } = await params;
  const { membership, session } = await verifyMembership(bandId, sessionId, authSession.user.email);

  if (!membership) return apiError("Forbidden", 403);
  if (!session) return apiError("Session not found", 404);

  return apiOk(session);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string; sessionId: string }> },
) {
  const authSession = await auth();
  if (!authSession?.user?.email) return apiError("Unauthorized", 401);

  const { bandId, sessionId } = await params;
  const { membership, session } = await verifyMembership(bandId, sessionId, authSession.user.email);

  if (!membership) return apiError("Forbidden", 403);
  if (!session) return apiError("Session not found", 404);

  const body = await req.json().catch(() => null);
  const { name, notes } = body ?? {};

  if (!name && notes === undefined) return apiError("Nothing to update");

  const updated = await prisma.jamSession.update({
    where: { id: sessionId },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
    },
  });

  return apiOk(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; sessionId: string }> },
) {
  const authSession = await auth();
  if (!authSession?.user?.email) return apiError("Unauthorized", 401);

  const { bandId, sessionId } = await params;
  const { membership, session } = await verifyMembership(bandId, sessionId, authSession.user.email);

  if (!membership) return apiError("Forbidden", 403);
  if (!session) return apiError("Session not found", 404);

  // Only RECORDER can delete sessions
  if (membership.role !== "RECORDER") {
    return apiError("Forbidden — only the band recorder can delete sessions", 403);
  }

  // Delete session (cascades to clips, versions, stamps via Prisma schema)
  await prisma.jamSession.delete({ where: { id: sessionId } });

  return apiOk({ deleted: true });
}
