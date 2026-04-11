// GET  /api/bands/[bandId]/sessions — list sessions with clip counts
// POST /api/bands/[bandId]/sessions — create a new session

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk, generateSessionName } from "@/lib/utils";

async function verifyMembership(bandId: string, userEmail: string) {
  return prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail } },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { bandId } = await params;

  const membership = await verifyMembership(bandId, session.user.email);
  if (!membership) return apiError("Forbidden", 403);

  const sessions = await prisma.jamSession.findMany({
    where: { bandId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { clips: true } } },
  });

  return apiOk(sessions);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { bandId } = await params;

  const membership = await verifyMembership(bandId, session.user.email);
  if (!membership) return apiError("Forbidden", 403);
  if (membership.role === "MEMBER") {
    return apiError("Forbidden — recording requires Editor role", 403);
  }

  const body = await req.json().catch(() => null);
  const name = body?.name ?? generateSessionName();

  const newSession = await prisma.jamSession.create({
    data: {
      bandId,
      name,
      recordedBy: session.user.email,
    },
    include: { _count: { select: { clips: true } } },
  });

  return apiOk(newSession, 201);
}
