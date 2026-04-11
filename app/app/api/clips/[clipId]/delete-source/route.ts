// DELETE /api/clips/[clipId]/delete-source
//
// Removes the source audio file from Google Drive and clears clip.driveFileId.
// The clip record, versions, and frozen render (if any) are kept intact.
//
// Use cases:
//   - After splitting X into A and B, delete X's raw source (A and B have their own)
//   - After freezing, remove the raw source to free Drive space (final render is kept)
//
// Any Editor+ can delete the source. The clip must have a driveFileId set.
// Drive deletion is best-effort (non-fatal if file already gone from Drive).

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, deleteDriveFile } from "@/lib/google";
import { apiError, apiOk } from "@/lib/utils";

export async function DELETE(
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
  const member = clip.session.band.members[0];
  if (!member) return apiError("Forbidden", 403);
  if (member.role === "MEMBER") return apiError("Forbidden — editors only", 403);
  if (!clip.driveFileId) return apiError("No source file to delete", 400);

  // Best-effort Drive deletion — proceed even if file is already gone
  try {
    const { accessToken } = await getCreatorTokens(clip.session.band.createdBy);
    await deleteDriveFile(accessToken, clip.driveFileId);
  } catch {
    // Drive deletion failed or token unavailable — clear the DB reference regardless
  }

  await prisma.clip.update({
    where: { id: clipId },
    data: { driveFileId: null },
  });

  return apiOk({ deleted: true });
}
