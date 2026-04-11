// POST /api/clips/[clipId]/unfreeze
// Recorder-only: resets frozen flag and frozenVersionId.
// The rendered final file (finalDriveFileId) is NOT deleted — keeps the render artifact.
// Band members can re-edit and re-freeze after this.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId } = await params;

  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: {
      session: {
        include: {
          band: {
            include: {
              members: {
                where: { userEmail: session.user.email },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!clip) return apiError("Clip not found", 404);

  const membership = clip.session.band.members[0] ?? null;
  if (!membership) return apiError("Forbidden", 403);

  // Only RECORDER can unfreeze
  if (membership.role !== "RECORDER") {
    return apiError("Only the recorder can unfreeze a clip", 403);
  }

  if (!clip.frozen) return apiError("Clip is not frozen", 400);

  const updated = await prisma.clip.update({
    where: { id: clipId },
    data: {
      frozen: false,
      frozenVersionId: null,
      // Keep finalDriveFileId and transcodeStatus — render artifact stays
    },
  });

  return apiOk(updated);
}
