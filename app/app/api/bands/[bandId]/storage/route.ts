// GET /api/bands/[bandId]/storage — Drive quota for the band creator's account
// Returns used/limit in bytes and a count of Odio-managed files in this band's folder.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, getDriveQuota } from "@/lib/google";
import { apiError, apiOk } from "@/lib/utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { bandId } = await params;

  const membership = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: session.user.email } },
    include: { band: { select: { createdBy: true, driveFolderId: true } } },
  });

  if (!membership) return apiError("Forbidden", 403);

  const { createdBy } = membership.band;

  // Count Drive file IDs managed by Odio for this band
  const clips = await prisma.clip.findMany({
    where: { session: { bandId } },
    select: { driveFileId: true, finalDriveFileId: true, sourceDurationMs: true },
  });

  const fileCount = clips.filter((c) => c.driveFileId || c.finalDriveFileId).length;
  // Rough size estimate: assume ~1.5MB per minute of audio
  const estimatedBytes = clips.reduce((sum, c) => {
    const durationMin = (c.sourceDurationMs ?? 0) / 60_000;
    return sum + Math.round(durationMin * 1.5 * 1024 * 1024);
  }, 0);

  try {
    const { accessToken } = await getCreatorTokens(createdBy);
    const quota = await getDriveQuota(accessToken);
    return apiOk({
      quotaUsedBytes: quota.used,
      quotaLimitBytes: quota.limit,
      odioFileCount: fileCount,
      estimatedBandBytes: estimatedBytes,
    });
  } catch {
    // Token unavailable — return estimate only
    return apiOk({
      quotaUsedBytes: 0,
      quotaLimitBytes: 0,
      odioFileCount: fileCount,
      estimatedBandBytes: estimatedBytes,
      quotaUnavailable: true,
    });
  }
}
