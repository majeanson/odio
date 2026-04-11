// GET  /api/clips/[clipId]/comments — list all comments for a clip
// POST /api/clips/[clipId]/comments — add a comment

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";

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

  const comments = await prisma.comment.findMany({
    where: { clipId },
    orderBy: { createdAt: "asc" },
  });

  return apiOk(comments);
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
  const { text, versionId, timestampMs } = body ?? {};

  if (!text?.trim()) return apiError("Comment text is required");
  if (text.trim().length > 1000) return apiError("Comment must be under 1000 characters");

  // Validate versionId if provided
  if (versionId) {
    const version = await prisma.clipVersion.findFirst({
      where: { id: versionId, clipId },
    });
    if (!version) return apiError("Version not found on this clip", 404);
  }

  const comment = await prisma.comment.create({
    data: {
      clipId,
      userEmail: session.user.email,
      text: text.trim(),
      versionId: versionId ?? null,
      timestampMs: typeof timestampMs === "number" ? Math.round(timestampMs) : null,
    },
  });

  return apiOk(comment, 201);
}
