// POST /api/clips/[clipId]/freeze
//
// Freeze a clip: lock editing, run FFmpeg render with the chosen version's cut marks,
// upload the render to Drive, store finalDriveFileId.
//
// Body: { versionId: string }
//
// After this route completes:
// - clip.frozen = true
// - clip.frozenVersionId = versionId
// - clip.transcodeStatus = DONE (or FAILED on render error)
// - clip.finalDriveFileId = rendered file ID in Drive (if DONE)
//
// Vercel Hobby timeout (10s) may be exceeded for long clips. Vercel Pro (300s) is safe.
// See feat-ffmpeg-poc for bundle size validation.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, uploadDriveFile, getDriveFileMeta } from "@/lib/google";
import { renderAudioWithCuts, downloadToTmp, getTmpOutputPath } from "@/lib/render";
import { apiError, apiOk } from "@/lib/utils";
import { promises as fs } from "fs";

export const runtime = "nodejs"; // FFmpeg requires Node.js runtime, not Edge
export const maxDuration = 300;  // Vercel Pro: 5 minutes max function duration

const sanitize = (s: string) => s.replace(/[/\\?:*"<>|]/g, "-").trim();

/** Build a human-readable Drive filename for the frozen render.
 *  If the user supplied a finalName, use it directly (e.g. "Death Metal Jam.aac").
 *  Otherwise fall back to "<clipName> - final.aac" so it pairs cleanly with the source file.
 */
function buildFinalFileName(clipName: string, finalName?: string): string {
  const base = finalName?.trim() ? sanitize(finalName.trim()) : `${sanitize(clipName)} - final`;
  return `${base}.aac`;
}

export async function POST(
  req: Request,
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
      versions: true,
    },
  });

  if (!clip) return apiError("Clip not found", 404);

  const membership = clip.session.band.members[0];
  if (!membership) return apiError("Forbidden", 403);
  if (membership.role === "MEMBER") return apiError("Forbidden — members cannot freeze clips", 403);
  if (clip.frozen) return apiError("Clip is already frozen", 409);
  if (!clip.driveFileId) return apiError("Source audio not yet available", 409);
  if (clip.transcodeStatus === "PENDING") return apiError("Audio is still processing", 409);

  const body = await req.json().catch(() => null);
  const { versionId, finalName } = body ?? {};
  if (!versionId) return apiError("versionId is required");

  const version = clip.versions.find((v) => v.id === versionId);
  if (!version) return apiError("Version not found on this clip", 404);

  const cutMarks = Array.isArray(version.cutMarks)
    ? (version.cutMarks as Array<{ startMs: number; endMs: number }>)
    : [];

  const bandCreatedBy = clip.session.band.createdBy;
  const driveFolderId = clip.session.band.driveFolderId as string | undefined;

  if (!driveFolderId) return apiError("Band Drive folder not configured", 500);

  let accessToken: string;
  try {
    const tokens = await getCreatorTokens(bandCreatedBy);
    accessToken = tokens.accessToken;
  } catch {
    return apiError("Drive connection unavailable — ask band creator to re-authorize", 503);
  }

  // Block further edits while rendering, but don't mark frozen until render succeeds.
  // This allows the user to retry if the render fails.
  await prisma.clip.update({
    where: { id: clipId },
    data: { transcodeStatus: "PENDING" },
  });

  const outputPath = getTmpOutputPath("aac");
  let inputPath: string | null = null;

  try {
    inputPath = await downloadToTmp(accessToken, clip.driveFileId, "aac");

    await renderAudioWithCuts(
      inputPath,
      outputPath,
      cutMarks,
      clip.sourceDurationMs ?? 0,
    );

    // Read rendered buffer and sanity-check before uploading
    const outputBuffer = await fs.readFile(outputPath);
    if (outputBuffer.length < 512) {
      throw new Error(`FFmpeg produced empty render (${outputBuffer.length} bytes)`);
    }

    const outputFileName = buildFinalFileName(clip.name, finalName);

    const finalDriveFileId = await uploadDriveFile(
      accessToken,
      driveFolderId,
      outputFileName,
      "audio/aac",
      outputBuffer,
    );

    // Verify Drive actually stored the bytes
    const meta = await getDriveFileMeta(accessToken, finalDriveFileId);
    if (meta.size === 0) {
      throw new Error("Drive upload produced an empty file — re-try freeze");
    }

    // Render succeeded — now freeze
    await prisma.clip.update({
      where: { id: clipId },
      data: {
        frozen: true,
        frozenVersionId: versionId,
        finalDriveFileId,
        transcodeStatus: "DONE",
      },
    });

    return apiOk({
      frozen: true,
      finalDriveFileId,
      versionId,
    });
  } catch (err) {
    // Reset transcodeStatus so the clip is not stuck; frozen stays false so user can retry.
    await prisma.clip.update({
      where: { id: clipId },
      data: { transcodeStatus: "FAILED" },
    });

    const message = err instanceof Error ? err.message : "Render failed";
    return apiError(`Render failed: ${message}`, 500);
  } finally {
    // Clean up /tmp files
    await Promise.allSettled([
      inputPath ? fs.unlink(inputPath) : Promise.resolve(),
      fs.unlink(outputPath),
    ]);
  }
}
