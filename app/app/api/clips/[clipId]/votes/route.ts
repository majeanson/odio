// GET  /api/clips/[clipId]/votes — get all votes for a clip (aggregated per version)
// POST /api/clips/[clipId]/votes — submit or update current user's vote on a version

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";
import type { VoteValue } from "@/types";

const VALID_VOTES: VoteValue[] = ["KEEP", "REVISE", "PASS"];

async function verifyMembership(clipId: string, userEmail: string) {
  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: {
      session: {
        include: {
          band: {
            include: {
              members: { where: { userEmail }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!clip) return { clip: null, membership: null };
  return { clip, membership: clip.session.band.members[0] ?? null };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId } = await params;
  const { clip, membership } = await verifyMembership(clipId, session.user.email);

  if (!clip) return apiError("Clip not found", 404);
  if (!membership) return apiError("Forbidden", 403);

  const votes = await prisma.vote.findMany({
    where: { clipId },
  });

  return apiOk(votes);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId } = await params;
  const { clip, membership } = await verifyMembership(clipId, session.user.email);

  if (!clip) return apiError("Clip not found", 404);
  if (!membership) return apiError("Forbidden", 403);

  const body = await req.json().catch(() => null);
  const { versionId, value } = body ?? {};

  if (!versionId || !value) return apiError("versionId and value are required");
  if (!VALID_VOTES.includes(value)) {
    return apiError(`Invalid vote value. Must be one of: ${VALID_VOTES.join(", ")}`);
  }

  // Verify the version belongs to this clip
  const version = await prisma.clipVersion.findFirst({
    where: { id: versionId, clipId },
  });
  if (!version) return apiError("Version not found on this clip", 404);

  // Upsert — one active vote per person per clip (can change which version they vote on)
  const vote = await prisma.vote.upsert({
    where: { clipId_userEmail: { clipId, userEmail: session.user.email } },
    create: {
      clipId,
      versionId,
      userEmail: session.user.email,
      value,
    },
    update: {
      versionId,
      value,
    },
  });

  return apiOk(vote);
}
