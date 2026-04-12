// POST /api/clips/[clipId]/split
//
// Splits a clip at a given time position into two new INDEPENDENT clips.
// The original clip is left completely unchanged.
//
// Each new clip gets its own trimmed Drive source file (produced via FFmpeg):
//   Part A — covers 0 → splitMs, uploaded as "${nameA} - source.aac"
//   Part B — covers splitMs → end, uploaded as "${nameB} - source.aac"
//
// v1 of each new clip has empty cutMarks — the trimmed file IS their raw.
// sourceDurationMs is set to the actual split duration, not the original full length.
//
// Body: { splitMs: number }
// Response: { clipA: { id, name }, clipB: { id, name } }

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, uploadDriveFile, getDriveFileMeta } from "@/lib/google";
import { renderAudioWithCuts, downloadToTmp, getTmpOutputPath } from "@/lib/render";
import { apiError, apiOk } from "@/lib/utils";
import { promises as fs } from "fs";

export const runtime = "nodejs"; // FFmpeg requires Node.js runtime
export const maxDuration = 300;  // Vercel Pro: up to 5 min for long clips

const sanitize = (s: string) => s.replace(/[/\\?:*"<>|]/g, "-").trim();

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
  if (!clip.driveFileId) return apiError("Clip audio not ready", 400);
  if (splitMs >= clip.sourceDurationMs) {
    return apiError("Split point must be before the end of the clip", 400);
  }

  const nameA = `${clip.name} - A`;
  const nameB = `${clip.name} - B`;

  const driveFolderId = clip.session.band.driveFolderId as string | undefined;
  if (!driveFolderId) return apiError("Band Drive folder not configured", 500);

  let accessToken: string;
  try {
    const tokens = await getCreatorTokens(clip.session.band.createdBy);
    accessToken = tokens.accessToken;
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "CREATOR_TOKEN_MISSING" || code === "CREATOR_TOKEN_INVALID") {
      return apiError("CREATOR_TOKEN_INVALID", 503);
    }
    throw err;
  }

  const outputPathA = getTmpOutputPath("aac");
  const outputPathB = getTmpOutputPath("aac");
  let inputPath: string | null = null;

  try {
    // Download source once — both trims read from the same file
    inputPath = await downloadToTmp(accessToken, clip.driveFileId, "aac");

    // Trim both halves in parallel
    await Promise.all([
      renderAudioWithCuts(
        inputPath,
        outputPathA,
        [{ startMs: splitMs, endMs: clip.sourceDurationMs }], // removes tail → keeps 0→split
        clip.sourceDurationMs,
      ),
      renderAudioWithCuts(
        inputPath,
        outputPathB,
        [{ startMs: 0, endMs: splitMs }], // removes head → keeps split→end
        clip.sourceDurationMs,
      ),
    ]);

    // Read rendered buffers and sanity-check before uploading.
    // An empty output means FFmpeg silently produced nothing — fail fast
    // rather than storing a corrupt/empty Drive file.
    const [bufA, bufB] = await Promise.all([
      fs.readFile(outputPathA),
      fs.readFile(outputPathB),
    ]);

    if (bufA.length < 512) {
      throw new Error(`FFmpeg produced empty Part A (${bufA.length} bytes) — split aborted`);
    }
    if (bufB.length < 512) {
      throw new Error(`FFmpeg produced empty Part B (${bufB.length} bytes) — split aborted`);
    }

    const [driveFileIdA, driveFileIdB] = await Promise.all([
      uploadDriveFile(accessToken, driveFolderId, `${sanitize(nameA)} - source.aac`, "audio/aac", bufA),
      uploadDriveFile(accessToken, driveFolderId, `${sanitize(nameB)} - source.aac`, "audio/aac", bufB),
    ]);

    // Verify Drive actually stored the bytes — a size of 0 means the upload silently failed.
    const [metaA, metaB] = await Promise.all([
      getDriveFileMeta(accessToken, driveFileIdA),
      getDriveFileMeta(accessToken, driveFileIdB),
    ]);

    if (metaA.size === 0) {
      throw new Error("Drive upload for Part A produced an empty file — re-try");
    }
    if (metaB.size === 0) {
      throw new Error("Drive upload for Part B produced an empty file — re-try");
    }

    // Create both Postgres clip records (v1 has no cut marks — the trimmed file IS the raw)
    const [clipA, clipB] = await prisma.$transaction([
      prisma.clip.create({
        data: {
          sessionId: clip.sessionId,
          name: nameA,
          stage: "IDEA",
          driveFileId: driveFileIdA,
          sourceDurationMs: splitMs,
          transcodeStatus: "DONE",
          createdBy: clip.createdBy,
          recordedByEmail: clip.recordedByEmail,
          sourceClipId: clipId,
          versions: {
            create: {
              versionNumber: 1,
              createdBy: session.user.email,
              cutMarks: [],
              resultDurationMs: splitMs,
            },
          },
        },
      }),
      prisma.clip.create({
        data: {
          sessionId: clip.sessionId,
          name: nameB,
          stage: "IDEA",
          driveFileId: driveFileIdB,
          sourceDurationMs: clip.sourceDurationMs - splitMs,
          transcodeStatus: "DONE",
          createdBy: clip.createdBy,
          recordedByEmail: clip.recordedByEmail,
          sourceClipId: clipId,
          versions: {
            create: {
              versionNumber: 1,
              createdBy: session.user.email,
              cutMarks: [],
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
  } finally {
    await Promise.allSettled([
      inputPath ? fs.unlink(inputPath) : Promise.resolve(),
      fs.unlink(outputPathA),
      fs.unlink(outputPathB),
    ]);
  }
}
