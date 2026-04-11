// POST /api/clips/[clipId]/split
//
// Splits a clip at a given time position into two virtual clips.
// The original clip gets a new version with the end cut off (keeps start → splitMs).
// A new clip is created with a version that cuts the beginning (keeps splitMs → end).
// Both clips reference the same Drive source file — no audio is copied.
// The cut marks are applied on-the-fly during playback (skip-cuts) and only rendered on freeze.
//
// Body: { splitMs: number }
// Response: { newClipId: string, newClipName: string }

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDeathMetalName } from "@/lib/clipNames";
import { apiError, apiOk } from "@/lib/utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON", 400);
  }

  const { splitMs } = body as { splitMs?: unknown };
  if (typeof splitMs !== "number" || splitMs <= 0) {
    return apiError("splitMs must be a positive number", 400);
  }

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
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  if (!clip) return apiError("Clip not found", 404);
  const member = clip.session.band.members[0];
  if (!member || member.role === "MEMBER") return apiError("Forbidden", 403);
  if (clip.frozen) return apiError("Cannot split a frozen clip", 400);
  if (!clip.sourceDurationMs) return apiError("Clip audio not ready", 400);
  if (splitMs >= clip.sourceDurationMs) {
    return apiError("Split point must be before the end of the clip", 400);
  }

  const latestVersion = clip.versions[0];
  const nextVersionNumberOnOriginal = (latestVersion?.versionNumber ?? 0) + 1;

  // Format split point for the auto-generated description
  const splitSec = Math.floor(splitMs / 1000);
  const splitLabel = `${Math.floor(splitSec / 60)}:${String(splitSec % 60).padStart(2, "0")}`;

  const newClipName = generateDeathMetalName();

  const [newClip] = await prisma.$transaction([
    // New clip = Part B (keeps everything after splitMs)
    prisma.clip.create({
      data: {
        sessionId: clip.sessionId,
        name: newClipName,
        stage: "IDEA",
        driveFileId: clip.driveFileId,
        sourceDurationMs: clip.sourceDurationMs,
        // Audio is already in Drive — mark ready so the proxy can serve it immediately
        transcodeStatus: "DONE",
        createdBy: clip.createdBy,
        recordedByEmail: clip.recordedByEmail,
        versions: {
          create: {
            versionNumber: 1,
            createdBy: session.user.email,
            cutMarks: [{ startMs: 0, endMs: splitMs }],
            resultDurationMs: clip.sourceDurationMs - splitMs,
            description: `Split from ${clip.name} at ${splitLabel}`,
          },
        },
      },
    }),
    // Add a version to the original clip (Part A — keeps start up to splitMs)
    prisma.clipVersion.create({
      data: {
        clipId,
        versionNumber: nextVersionNumberOnOriginal,
        createdBy: session.user.email,
        fromVersionId: latestVersion?.id ?? undefined,
        cutMarks: [{ startMs: splitMs, endMs: clip.sourceDurationMs }],
        resultDurationMs: splitMs,
        description: `Split — Part A (0:00–${splitLabel})`,
      },
    }),
  ]);

  return apiOk({ newClipId: newClip.id, newClipName });
}
