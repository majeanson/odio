// GET /api/render/poc
//
// feat-ffmpeg-poc validation route.
// Tests that @ffmpeg-installer/ffmpeg + fluent-ffmpeg works in this deployment.
// Returns FFmpeg version string and confirms the binary is executable.
//
// NOT a user-facing route — development/deployment validation only.

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const runtime = "nodejs"; // FFmpeg requires Node.js runtime, not Edge

export async function GET() {
  return new Promise<Response>((resolve) => {
    ffmpeg.getAvailableCodecs((_err, codecs) => {
      const hasAac = codecs && ("aac" in codecs || "libfdk_aac" in codecs);
      resolve(
        Response.json({
          ok: true,
          ffmpegPath: ffmpegInstaller.path,
          ffmpegVersion: ffmpegInstaller.version,
          aacCodecAvailable: !!hasAac,
        }),
      );
    });
  });
}
