// POST /api/upload/init
// Generate a Google Drive resumable upload session URL.
// The browser uploads the audio blob directly to Drive using this URL —
// audio never passes through our Vercel function (avoids 4.5MB body limit).
//
// Role requirement: EDITOR or RECORDER (not MEMBER).
// Uses the band creator's stored token — not the current user's token.
// This is what makes multi-recorder work: any editor uploads to the creator's Drive.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, generateResumableUploadUrl } from "@/lib/google";
import { apiError, apiOk } from "@/lib/utils";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  const { bandId, sessionId, mimeType, fileSize, clipName, tempId } =
    body ?? {};

  if (!bandId || !mimeType || !fileSize || !clipName) {
    return apiError("Missing required fields");
  }

  // Verify the current user is EDITOR or RECORDER in this band
  const membership = await prisma.bandMember.findUnique({
    where: {
      bandId_userEmail: { bandId, userEmail: session.user.email },
    },
    include: { band: { select: { createdBy: true, driveFolderId: true } } },
  });

  if (!membership) return apiError("Forbidden", 403);
  if (membership.role === "MEMBER") return apiError("Forbidden — recording requires Editor role", 403);

  const { createdBy, driveFolderId } = membership.band;

  // Fetch the band creator's Drive tokens
  let accessToken: string;
  try {
    const tokens = await getCreatorTokens(createdBy);
    accessToken = tokens.accessToken;
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "CREATOR_TOKEN_MISSING" || code === "CREATOR_TOKEN_INVALID") {
      return apiError("CREATOR_TOKEN_INVALID", 503);
    }
    throw err;
  }

  // Generate a human-readable source filename in Drive
  // Sanitize to strip characters Drive disallows, keep base name consistent with the final render
  const sanitize = (s: string) => s.replace(/[/\\?:*"<>|]/g, "-").trim();
  const fileName = `${sanitize(clipName)} - source`;

  // Pass the app origin so Drive includes CORS headers on the browser's PUT.
  const appOrigin = new URL(req.url).origin;

  const { uploadSessionUrl, driveFileId } = await generateResumableUploadUrl({
    accessToken,
    folderId: driveFolderId,
    fileName,
    mimeType,
    fileSize,
    appOrigin,
  });

  return apiOk({ uploadSessionUrl, driveFileId });
}
