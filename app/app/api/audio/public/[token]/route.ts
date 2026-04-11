// GET /api/audio/public/[token]
// Public audio proxy — serves the frozen render for a clip with a publicToken.
// No auth required. Only serves clips that have been explicitly made public.
// Supports Range requests for seeking.

import { prisma } from "@/lib/prisma";
import { getCreatorTokens, getDriveFileStream } from "@/lib/google";
import { apiError } from "@/lib/utils";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const clip = await prisma.clip.findUnique({
    where: { publicToken: token },
    include: {
      session: {
        include: {
          band: { select: { createdBy: true } },
        },
      },
    },
  });

  if (!clip) return apiError("Not found", 404);
  if (!clip.frozen) return apiError("Clip is not yet public", 403);

  // Serve the final render (preferred) or source audio
  const fileId = clip.finalDriveFileId ?? clip.driveFileId;
  if (!fileId) return apiError("Audio not available", 404);

  let accessToken: string;
  try {
    const tokens = await getCreatorTokens(clip.session.band.createdBy);
    accessToken = tokens.accessToken;
  } catch {
    return apiError("Audio temporarily unavailable", 503);
  }

  const rangeHeader = req.headers.get("Range") ?? undefined;
  const driveRes = await getDriveFileStream(accessToken, fileId, rangeHeader);

  const headers = new Headers();
  ["content-type", "content-length", "content-range", "accept-ranges"].forEach((h) => {
    const v = driveRes.headers.get(h);
    if (v) headers.set(h, v);
  });
  headers.set("Cache-Control", "public, max-age=86400");

  return new Response(driveRes.body, { status: driveRes.status, headers });
}
