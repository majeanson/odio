// POST /api/clips/[clipId]/split
//
// Splits a clip at a given time position into two NEW virtual clips.
// The original clip is left completely unchanged — its v1 raw recording
// remains intact as a reference.
//
// Part A (new clip) — covers 0 → splitMs
//   v1 cutMarks: [{ startMs: splitMs, endMs: sourceDurationMs }]
//   (removes the tail, plays the head)
//
// Part B (new clip) — covers splitMs → end
//   v1 cutMarks: [{ startMs: 0, endMs: splitMs }]
//   (removes the head, plays the tail)
//
// Both clips point at the same Drive source file — no audio is copied.
// The cut marks are applied on-the-fly during playback and only rendered on freeze.
//
// Body: { splitMs: number }
// Response: { clipA: { id, name }, clipB: { id, name } }

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  // Name the new clips after the original with an A / B suffix
  const nameA = `${clip.name} - A`;
  const nameB = `${clip.name} - B`;

  const [clipA, clipB] = await prisma.$transaction([
    // Part A — plays 0 → splitMs (tail is cut off)
    prisma.clip.create({
      data: {
        sessionId: clip.sessionId,
        name: nameA,
        stage: "IDEA",
        driveFileId: clip.driveFileId,
        sourceDurationMs: clip.sourceDurationMs,
        transcodeStatus: "DONE",
        createdBy: clip.createdBy,
        recordedByEmail: clip.recordedByEmail,
        sourceClipId: clipId,
        versions: {
          create: {
            versionNumber: 1,
            createdBy: session.user.email,
            cutMarks: [{ startMs: splitMs, endMs: clip.sourceDurationMs }],
            resultDurationMs: splitMs,
          },
        },
      },
    }),
    // Part B — plays splitMs → end (head is cut off)
    prisma.clip.create({
      data: {
        sessionId: clip.sessionId,
        name: nameB,
        stage: "IDEA",
        driveFileId: clip.driveFileId,
        sourceDurationMs: clip.sourceDurationMs,
        transcodeStatus: "DONE",
        createdBy: clip.createdBy,
        recordedByEmail: clip.recordedByEmail,
        sourceClipId: clipId,
        versions: {
          create: {
            versionNumber: 1,
            createdBy: session.user.email,
            cutMarks: [{ startMs: 0, endMs: splitMs }],
            resultDurationMs: clip.sourceDurationMs - splitMs,
          },
        },
      },
    }),
  ]);

  return apiOk({
    clipA: { id: clipA.id, name: nameA },
    clipB: { id: clipB.id, name: nameB },
  });
}
