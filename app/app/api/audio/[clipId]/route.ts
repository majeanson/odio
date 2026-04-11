// GET /api/audio/[clipId]
// Audio proxy route — streams Drive audio to band members using the band
// creator's stored refresh_token. Supports HTTP Range requests for seeking.
//
// All band members hit this route regardless of their own Drive access.
// The creator's token is what allows the server to read the Drive file.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, getDriveFileStream, getDriveFileMeta } from "@/lib/google";
import { apiError } from "@/lib/utils";

// ─── Shared clip lookup ───────────────────────────────────────────────────────

async function resolveAudioFile(userEmail: string, clipId: string) {
  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: {
      session: {
        include: {
          band: {
            include: {
              members: { where: { userEmail }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!clip) return { error: apiError("Clip not found", 404) };
  if (clip.session.band.members.length === 0) return { error: apiError("Forbidden", 403) };

  const fileId = clip.frozen && clip.finalDriveFileId
    ? clip.finalDriveFileId
    : clip.driveFileId;
  if (!fileId) return { error: apiError("Audio not yet available", 404) };

  let accessToken: string;
  try {
    const tokens = await getCreatorTokens(clip.session.band.createdBy);
    accessToken = tokens.accessToken;
  } catch {
    return { error: apiError("Drive connection unavailable — ask band creator to re-authorize", 503) };
  }

  return { fileId, accessToken };
}

// ─── HEAD — return file metadata without streaming ────────────────────────────

export async function HEAD(
  _req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return new Response(null, { status: 401 });

  const { clipId } = await params;
  const result = await resolveAudioFile(session.user.email, clipId);
  if ("error" in result) return new Response(null, { status: 404 });

  try {
    const meta = await getDriveFileMeta(result.accessToken, result.fileId);
    const headers = new Headers({
      "Content-Type":   meta.mimeType,
      "Content-Length": String(meta.size),
      "Accept-Ranges":  "bytes",
      "Cache-Control":  "private, max-age=300",
    });
    return new Response(null, { status: 200, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}

// ─── GET — proxy stream with Range support ────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId } = await params;
  const result = await resolveAudioFile(session.user.email, clipId);
  if ("error" in result) return result.error;

  // Forward Range header for seeking support
  const rangeHeader = req.headers.get("Range") ?? undefined;
  let driveRes: Response;
  try {
    driveRes = await getDriveFileStream(result.accessToken, result.fileId, rangeHeader);
  } catch {
    return apiError("Drive file unavailable", 502);
  }

  // Pass through content-type, content-length, content-range from Drive
  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = driveRes.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("Cache-Control", "private, max-age=300");

  return new Response(driveRes.body, { status: driveRes.status, headers });
}
