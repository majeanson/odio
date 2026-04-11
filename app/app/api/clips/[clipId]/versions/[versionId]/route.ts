// DELETE /api/clips/[clipId]/versions/[versionId] — prune (delete) a version
//
// Restrictions:
// - v1 cannot be pruned (it's the original recording)
// - A frozen clip's frozenVersionId cannot be pruned
// - Only EDITOR or RECORDER can prune

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clipId: string; versionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId, versionId } = await params;

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
      versions: { select: { id: true, versionNumber: true } },
    },
  });

  if (!clip) return apiError("Clip not found", 404);

  const membership = clip.session.band.members[0];
  if (!membership) return apiError("Forbidden", 403);
  if (membership.role === "MEMBER") return apiError("Forbidden — members cannot prune versions", 403);

  const version = clip.versions.find((v) => v.id === versionId);
  if (!version) return apiError("Version not found", 404);

  // Cannot prune v1 (original recording)
  if (version.versionNumber === 1) {
    return apiError("Cannot prune v1 — it is the original recording");
  }

  // Cannot prune the frozen version
  if (clip.frozenVersionId === versionId) {
    return apiError("Cannot prune the frozen version — unfreeze the clip first");
  }

  await prisma.clipVersion.delete({ where: { id: versionId } });

  return apiOk({ deleted: true });
}
