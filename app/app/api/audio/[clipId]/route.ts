// GET /api/audio/[clipId]
// Audio proxy route — streams Drive audio to band members using the band
// creator's stored refresh_token. Supports HTTP Range requests for seeking.
//
// All band members hit this route regardless of their own Drive access.
// The creator's token is what allows the server to read the Drive file.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, getDriveFileStream } from "@/lib/google";
import { apiError } from "@/lib/utils";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId } = await params;

  // Load clip + verify caller is a band member
  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: {
      session: {
        include: {
          band: {
            include: {
              members: {
                where: { userEmail: session.user.email },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!clip) return apiError("Clip not found", 404);
  if (clip.session.band.members.length === 0) {
    return apiError("Forbidden", 403);
  }

  // Decide which Drive file to serve:
  // - If clip is frozen and has a render, serve the frozen render
  // - Otherwise serve the source .aac
  const fileId = clip.frozen && clip.finalDriveFileId
    ? clip.finalDriveFileId
    : clip.driveFileId;

  if (!fileId) return apiError("Audio not yet available", 404);

  // Get creator's token to proxy the file
  let accessToken: string;
  try {
    const tokens = await getCreatorTokens(clip.session.band.createdBy);
    accessToken = tokens.accessToken;
  } catch {
    return apiError("Drive connection unavailable — ask band creator to re-authorize", 503);
  }

  // Forward Range header for seeking support
  const rangeHeader = req.headers.get("Range") ?? undefined;
  const driveRes = await getDriveFileStream(accessToken, fileId, rangeHeader);

  // Pass through content-type, content-length, content-range from Drive
  const headers = new Headers();
  const passthroughHeaders = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
  ];
  passthroughHeaders.forEach((h) => {
    const v = driveRes.headers.get(h);
    if (v) headers.set(h, v);
  });

  // Cache for 5 minutes (audio files don't change)
  headers.set("Cache-Control", "private, max-age=300");

  return new Response(driveRes.body, {
    status: driveRes.status,
    headers,
  });
}
