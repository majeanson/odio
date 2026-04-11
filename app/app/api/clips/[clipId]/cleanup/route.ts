// POST /api/clips/[clipId]/cleanup
// Post-freeze cleanup: delete the source .aac from Drive, keep the frozen render.
// Only available after a clip is frozen and has a finalDriveFileId.
// This saves Drive storage (~43MB per 30-min raw clip).

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, deleteDriveFile } from "@/lib/google";
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
              members: { where: { userEmail: session.user.email }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (!clip) return apiError("Clip not found", 404);

  const membership = clip.session.band.members[0];
  if (!membership) return apiError("Forbidden", 403);
  if (membership.role === "MEMBER") return apiError("Forbidden — members cannot clean up clips", 403);

  if (!clip.frozen) return apiError("Clip must be frozen before cleanup");
  if (!clip.finalDriveFileId) return apiError("No frozen render available — render must complete before cleanup");
  if (!clip.driveFileId) return apiOk({ alreadyCleaned: true });

  const { accessToken } = await getCreatorTokens(clip.session.band.createdBy);

  try {
    await deleteDriveFile(accessToken, clip.driveFileId);
  } catch {
    // Drive file may already be deleted — proceed
  }

  await prisma.clip.update({
    where: { id: clipId },
    data: { driveFileId: null },
  });

  return apiOk({ cleaned: true });
}
