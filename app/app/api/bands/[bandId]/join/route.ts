// POST /api/bands/[bandId]/join — join a band via invite code
// Invite code is in the request body. Adds the current user as EDITOR.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { bandId } = await params;
  const body = await req.json().catch(() => null);
  const inviteCode = (body?.inviteCode as string)?.trim();

  if (!inviteCode) return apiError("Invite code is required");

  const band = await prisma.band.findFirst({
    where: { id: bandId, inviteCode },
  });

  if (!band) return apiError("Invalid invite link", 404);

  // Idempotent join — if already a member, just return success
  const existing = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: session.user.email } },
  });

  if (existing) {
    return apiOk({ alreadyMember: true, bandId });
  }

  await prisma.bandMember.create({
    data: {
      bandId,
      userEmail: session.user.email,
      displayName: session.user.name ?? null,
      role: "EDITOR", // default role for new members
    },
  });

  return apiOk({ bandId, joined: true }, 201);
}
