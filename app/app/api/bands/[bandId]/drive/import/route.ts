// POST /api/bands/[bandId]/drive/import
// Registers existing Drive audio files as new Clips (v1, no cuts, no stamps).
// Mirrors the finalize route but skips the upload step — file is already in Drive.
// Called from the Drive management page after a scan surfaces unimported files.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk, generateClipName, generateSessionName } from "@/lib/utils";

interface ImportFile {
  fileId: string;
  name: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  const {
    files,
    sessionId,
  }: { files: ImportFile[]; sessionId?: string } = body ?? {};

  if (!Array.isArray(files) || files.length === 0) {
    return apiError("No files provided");
  }

  const membership = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: session.user.email } },
    include: { band: { select: { createdBy: true } } },
  });

  if (!membership || membership.role === "MEMBER") {
    return apiError("Forbidden", 403);
  }

  // Resolve or create today's session
  let targetSessionId = sessionId ?? null;
  if (!targetSessionId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.jamSession.findFirst({
      where: { bandId, createdAt: { gte: today } },
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      targetSessionId = existing.id;
    } else {
      const created = await prisma.jamSession.create({
        data: {
          bandId,
          name: generateSessionName(),
          recordedBy: session.user.email,
        },
      });
      targetSessionId = created.id;
    }
  }

  // Base clip count for auto-naming
  let clipCount = await prisma.clip.count({
    where: { sessionId: targetSessionId },
  });

  const imported: { clipId: string; name: string }[] = [];

  for (const file of files) {
    clipCount++;

    // Strip file extension from name for display; fall back to auto-generated name
    const rawName = file.name.replace(/\.[^.]+$/, "").trim();
    const clipName = rawName || generateClipName(clipCount);

    const clip = await prisma.$transaction(async (tx) => {
      const clip = await tx.clip.create({
        data: {
          sessionId: targetSessionId!,
          name: clipName,
          driveFileId: file.fileId,
          sourceDurationMs: null, // unknown — player detects on first load
          transcodeStatus: "DONE",
          createdBy: membership.band.createdBy,
          recordedByEmail: session.user!.email!,
        },
      });

      await tx.clipVersion.create({
        data: {
          clipId: clip.id,
          versionNumber: 1,
          createdBy: session.user!.email!,
          cutMarks: [],
          resultDurationMs: null,
        },
      });

      return clip;
    });

    imported.push({ clipId: clip.id, name: clip.name });
  }

  return apiOk({ imported, sessionId: targetSessionId }, 201);
}
