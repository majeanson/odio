// Server-side FFmpeg render utilities.
// Used by the freeze route to apply cut marks and produce a final .aac file.
//
// Bundle size note: @ffmpeg-installer/ffmpeg bundles ~38MB compressed.
// On Vercel Hobby (50MB limit) this is close to the edge — validate with feat-ffmpeg-poc
// before deploying. On Vercel Pro (1GB limit) this is not a concern.
//
// Timeout note: Vercel Hobby has a 10s function timeout. For clips > ~5 min this
// may be exceeded. Vercel Pro raises the limit to 300s (sufficient for any clip).

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

// Point fluent-ffmpeg at the bundled binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface CutMark {
  startMs: number;
  endMs: number;
}

/**
 * Render a new audio file by removing the given cut regions from the source.
 *
 * @param inputPath  - Absolute path to the source audio file in /tmp
 * @param outputPath - Absolute path where the rendered output will be written
 * @param cutMarks   - Regions to remove, in ms. Must be non-overlapping.
 * @param sourceDurationMs - Total duration of the source in ms
 */
export async function renderAudioWithCuts(
  inputPath: string,
  outputPath: string,
  cutMarks: CutMark[],
  sourceDurationMs: number,
): Promise<void> {
  // No cuts — just copy the file
  if (cutMarks.length === 0) {
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  // Sort cuts ascending and build the KEEP segments
  const sorted = [...cutMarks].sort((a, b) => a.startMs - b.startMs);

  const segments: Array<{ startSec: number; endSec: number | null }> = [];
  let cursor = 0;

  for (const cut of sorted) {
    if (cursor < cut.startMs) {
      segments.push({
        startSec: cursor / 1000,
        endSec: cut.startMs / 1000,
      });
    }
    cursor = cut.endMs;
  }

  // Remaining segment after last cut
  if (cursor < sourceDurationMs) {
    segments.push({ startSec: cursor / 1000, endSec: null });
  }

  if (segments.length === 0) {
    throw new Error("No audio remains after applying all cuts");
  }

  // Build fluent-ffmpeg filter_complex.
  // Single segment: [0:a]atrim=...,asetpts=PTS-STARTPTS[out]
  //   (concat=n=1 is invalid in FFmpeg — must be skipped for one segment)
  // Multiple segments: [0:a]atrim=...[seg0]; [0:a]atrim=...[seg1]; [seg0][seg1]concat=n=2:v=0:a=1[out]
  let filterComplex: string;

  if (segments.length === 1) {
    const { startSec, endSec } = segments[0];
    const trim = endSec !== null
      ? `atrim=start=${startSec.toFixed(6)}:end=${endSec.toFixed(6)}`
      : `atrim=start=${startSec.toFixed(6)}`;
    filterComplex = `[0:a]${trim},asetpts=PTS-STARTPTS[out]`;
  } else {
    const filterParts: string[] = [];
    const labels: string[] = [];

    segments.forEach(({ startSec, endSec }, i) => {
      const label = `seg${i}`;
      const trim = endSec !== null
        ? `atrim=start=${startSec.toFixed(6)}:end=${endSec.toFixed(6)}`
        : `atrim=start=${startSec.toFixed(6)}`;
      filterParts.push(`[0:a]${trim},asetpts=PTS-STARTPTS[${label}]`);
      labels.push(`[${label}]`);
    });

    filterParts.push(
      `${labels.join("")}concat=n=${segments.length}:v=0:a=1[out]`,
    );

    filterComplex = filterParts.join("; ");
  }

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(["-filter_complex", filterComplex, "-map", "[out]"])
      .audioCodec("aac")
      .audioChannels(2)
      .audioBitrate("128k")
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * Download a Drive file to a temp path and return the path.
 * Caller must delete the file when done.
 */
export async function downloadToTmp(
  accessToken: string,
  fileId: string,
  extension: string,
): Promise<string> {
  const tmpPath = path.join("/tmp", `${randomUUID()}-input.${extension}`);

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(`Drive download failed: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(tmpPath, buffer);

  return tmpPath;
}

/**
 * Get a temp output path.
 */
export function getTmpOutputPath(extension = "aac"): string {
  return path.join("/tmp", `${randomUUID()}-output.${extension}`);
}
