// GET /api/bands/[bandId]/drive/scan
// Lists audio files in the band's Drive folder that have no Clip record.
// Only files created by Odio are visible (drive.file scope limitation).
// Used by the Drive management page to surface orphaned recordings.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, getDriveClient } from "@/lib/google";
import { apiError, apiOk } from "@/lib/utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const membership = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: session.user.email } },
    include: { band: { select: { createdBy: true, driveFolderId: true } } },
  });

  if (!membership || membership.role === "MEMBER") {
    return apiError("Forbidden", 403);
  }

  const { createdBy, driveFolderId } = membership.band;

  // Collect all Drive file IDs already tracked in the DB for this band
  const existingClips = await prisma.clip.findMany({
    where: { session: { bandId } },
    select: { driveFileId: true, finalDriveFileId: true },
  });
  const trackedIds = new Set<string>(
    existingClips.flatMap((c) =>
      [c.driveFileId, c.finalDriveFileId].filter(Boolean) as string[]
    ),
  );

  let { accessToken } = await getCreatorTokens(createdBy).catch(() => {
    throw new Error("CREATOR_TOKEN_MISSING");
  });

  const drive = getDriveClient(accessToken);

  type DriveFile = {
    id?: string | null;
    name?: string | null;
    size?: string | null;
    mimeType?: string | null;
    createdTime?: string | null;
  };

  let driveFiles: DriveFile[] = [];
  try {
    const res = await drive.files.list({
      q: `'${driveFolderId}' in parents and trashed=false and mimeType contains 'audio/'`,
      fields: "files(id,name,size,mimeType,createdTime)",
      spaces: "drive",
      pageSize: 200,
    });
    driveFiles = res.data.files ?? [];
  } catch {
    return apiError("Drive scan failed", 503);
  }

  const unimported = driveFiles
    .filter((f) => f.id && !trackedIds.has(f.id))
    .map((f) => ({
      fileId: f.id!,
      name: f.name ?? f.id!,
      sizeMb: f.size
        ? parseFloat((parseInt(f.size, 10) / 1024 / 1024).toFixed(1))
        : null,
      mimeType: f.mimeType ?? "audio/aac",
      createdTime: f.createdTime ?? null,
    }));

  return apiOk({
    unimported,
    total: driveFiles.length,
    tracked: trackedIds.size,
  });
}
