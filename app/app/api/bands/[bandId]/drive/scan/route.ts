// GET /api/bands/[bandId]/drive/scan
// Lists audio files in the band's Drive folder that have no Clip record.
// Requires the band creator to have granted drive.readonly scope (in addition
// to drive.file). Without it, only Odio-created files are visible.
// Used by the Drive management page to import manually-copied recordings.

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

  // Check whether the creator's stored token has the full drive scope.
  // drive.file + drive.readonly is NOT sufficient — Google's files.list API
  // still filters to app-created files only when drive.file is present, even
  // if drive.readonly is also in the token. Full drive scope is required to
  // list files the user copied into the folder manually from outside Odio.
  const creatorAccount = await prisma.account.findFirst({
    where: { user: { email: createdBy }, provider: "google" },
    select: { scope: true },
  });
  const creatorIsCurrentUser = createdBy === session.user.email;
  // Use exact set membership — "drive.file" also contains "drive" as substring
  const grantedScopes = new Set((creatorAccount?.scope ?? "").split(" "));
  const FULL_DRIVE = "https://www.googleapis.com/auth/drive";
  if (!grantedScopes.has(FULL_DRIVE)) {
    return apiOk({
      unimported: [],
      total: 0,
      tracked: 0,
      needsReauth: true,
      creatorIsCurrentUser,
    });
  }

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
    // List all non-trashed files in the folder. Filter mimeType client-side
    // rather than in the Drive query so we also catch M4A files that Drive
    // sometimes labels as video/mp4 or application/octet-stream.
    const res = await drive.files.list({
      q: `'${driveFolderId}' in parents and trashed=false`,
      fields: "files(id,name,size,mimeType,createdTime)",
      spaces: "drive",
      pageSize: 200,
    });
    const AUDIO_EXTENSIONS = /\.(aac|m4a|mp3|ogg|opus|webm|wav|flac|mp4)$/i;
    const AUDIO_MIME = /^audio\//;
    driveFiles = (res.data.files ?? []).filter(
      (f) =>
        (f.mimeType && (AUDIO_MIME.test(f.mimeType) || f.mimeType === "video/mp4"))
        || (f.name && AUDIO_EXTENSIONS.test(f.name)),
    );
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
    needsReauth: false,
    creatorIsCurrentUser,
  });
}
