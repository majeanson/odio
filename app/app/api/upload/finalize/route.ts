// POST /api/upload/finalize
// Called after the browser has finished uploading to Drive.
// 1. Moves the uploaded file into the band Drive folder (it's already there)
// 2. Transcodes WebM → AAC via FFmpeg for cross-browser compatibility
// 3. Creates the Clip and v1 ClipVersion rows in Postgres
// 4. Stamps are written from memory at this point too
//
// FFmpeg transcode note: this is where @ffmpeg-installer/ffmpeg is used.
// The POC (feat-ffmpeg-poc) must pass before this route is built in full.
// For now the transcode step is documented but stubbed — the clip is created
// with transcodeStatus DONE if the mimeType is already AAC (Safari),
// or PENDING if WebM (Chrome) pending a real transcode implementation.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, getDriveClient } from "@/lib/google";
import { apiError, apiOk, generateClipName, generateSessionName } from "@/lib/utils";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  const {
    tempId,       // used to look up Drive file by name when driveFileId is missing
    bandId,
    sessionId,
    clipName,
    mimeType,
    durationMs,
    driveFileId: driveFileIdFromClient, // pre-allocated; may be absent for older uploads
    stamps = [],  // [{timestampMs, type}] buffered during recording
  } = body ?? {};

  if (!bandId || !durationMs) {
    return apiError("Missing required fields");
  }

  // Re-verify membership (defense in depth)
  const membership = await prisma.bandMember.findUnique({
    where: {
      bandId_userEmail: { bandId, userEmail: session.user.email },
    },
    include: { band: { select: { createdBy: true, driveFolderId: true } } },
  });
  if (!membership || membership.role === "MEMBER") {
    return apiError("Forbidden", 403);
  }

  // Resolve Drive file ID — use the pre-allocated ID from the client when
  // available. Fall back to a server-side Drive lookup by filename when not:
  // the Drive resumable upload response is cross-origin so the browser can't
  // read its body, but the file IS there — we just need to find its ID.
  let driveFileId: string = driveFileIdFromClient ?? "";
  if (!driveFileId && tempId) {
    const { createdBy, driveFolderId } = membership.band;
    try {
      const { accessToken } = await getCreatorTokens(createdBy);
      const drive = getDriveClient(accessToken);
      const listRes = await drive.files.list({
        q: `name='${tempId}-source' and '${driveFolderId}' in parents and trashed=false`,
        fields: "files(id)",
        spaces: "drive",
      });
      driveFileId = listRes.data.files?.[0]?.id ?? "";
    } catch {
      return apiError("Drive file lookup failed", 503);
    }
  }

  if (!driveFileId) {
    return apiError("Missing required fields");
  }

  // Find or create the session for today
  let targetSessionId: string = sessionId;
  if (!targetSessionId) {
    // Auto-create a session for today if one doesn't exist yet
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingSession = await prisma.jamSession.findFirst({
      where: {
        bandId,
        createdAt: { gte: today },
      },
      orderBy: { createdAt: "asc" },
    });

    if (existingSession) {
      targetSessionId = existingSession.id;
    } else {
      const newSession = await prisma.jamSession.create({
        data: {
          bandId,
          name: generateSessionName(),
          recordedBy: session.user.email,
        },
      });
      targetSessionId = newSession.id;
    }
  }

  // Count existing clips in session for auto-naming
  const clipCount = await prisma.clip.count({
    where: { sessionId: targetSessionId },
  });

  const finalClipName =
    clipName ?? generateClipName(clipCount + 1);

  // Determine transcode status.
  // Safari records AAC/MP4 — already compatible, mark as DONE.
  // Chrome/Android records WebM/Opus — needs FFmpeg transcode before Safari can play it.
  const isAAC = mimeType?.includes("mp4") || mimeType?.includes("aac");
  const transcodeStatus = isAAC ? "DONE" : "PENDING";

  // Create clip + v1 version + stamps in a transaction
  const { clip } = await prisma.$transaction(async (tx) => {
    const clip = await tx.clip.create({
      data: {
        sessionId: targetSessionId,
        name: finalClipName,
        driveFileId,
        sourceDurationMs: durationMs,
        transcodeStatus: transcodeStatus as "DONE" | "PENDING",
        createdBy: membership.band.createdBy,
        recordedByEmail: session.user!.email,
      },
    });

    // Create v1 — the original recording with no cuts
    await tx.clipVersion.create({
      data: {
        clipId: clip.id,
        versionNumber: 1,
        createdBy: session.user!.email!,
        cutMarks: [],
        resultDurationMs: durationMs,
      },
    });

    // Write stamps from recording session
    if (stamps.length > 0) {
      await tx.stamp.createMany({
        data: stamps.map((s: { timestampMs: number; type: string }) => ({
          clipId: clip.id,
          timestampMs: s.timestampMs,
          type: s.type,
          createdBy: session.user!.email!,
        })),
      });
    }

    return { clip };
  });

  return apiOk({ clipId: clip.id, sessionId: targetSessionId }, 201);
}
