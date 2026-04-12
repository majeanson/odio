// Google Drive API helpers
// All audio files live in the band creator's Drive.
// We use the creator's stored refresh_token (in NextAuth accounts table)
// for every Drive operation — upload, proxy, render, cleanup.

import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);

// ─── Token Management ─────────────────────────────────────────────────────────

/**
 * Fetch the band creator's Google OAuth tokens from the NextAuth accounts table.
 * Automatically refreshes the access_token if it has expired.
 * Throws if no account is found or refresh fails.
 */
export async function getCreatorTokens(creatorEmail: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const account = await prisma.account.findFirst({
    where: {
      user: { email: creatorEmail },
      provider: "google",
    },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account?.refresh_token) {
    throw new Error("CREATOR_TOKEN_MISSING");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const isExpired = account.expires_at ? account.expires_at < nowSec + 60 : true;

  if (!isExpired && account.access_token) {
    return {
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
    };
  }

  // Token is expired — refresh it using the stored refresh_token
  oauth2Client.setCredentials({ refresh_token: account.refresh_token });

  let newTokens: { access_token?: string | null; expiry_date?: number | null };
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    newTokens = credentials;
  } catch {
    throw new Error("CREATOR_TOKEN_INVALID");
  }

  if (!newTokens.access_token) {
    throw new Error("CREATOR_TOKEN_INVALID");
  }

  // Persist refreshed token back to Postgres so next call doesn't re-refresh
  await prisma.account.updateMany({
    where: {
      user: { email: creatorEmail },
      provider: "google",
    },
    data: {
      access_token: newTokens.access_token,
      expires_at: newTokens.expiry_date
        ? Math.floor(newTokens.expiry_date / 1000)
        : undefined,
    },
  });

  return {
    accessToken: newTokens.access_token,
    refreshToken: account.refresh_token,
  };
}

/**
 * Build a configured Drive client using the given access token.
 */
export function getDriveClient(accessToken: string) {
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

// ─── Drive Folder ─────────────────────────────────────────────────────────────

/**
 * Create a Google Drive folder named "Odio — {bandName}".
 * Returns the folder ID. Called once when a band is created.
 */
export async function createBandDriveFolder(
  accessToken: string,
  bandName: string,
): Promise<string> {
  const drive = getDriveClient(accessToken);

  const folder = await drive.files.create({
    requestBody: {
      name: `Odio — ${bandName}`,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  if (!folder.data.id) throw new Error("Failed to create Drive folder");
  return folder.data.id;
}

// ─── Resumable Upload ─────────────────────────────────────────────────────────

/**
 * Generate a Google Drive resumable upload session URL.
 * The client browser uploads the audio blob directly to this URL —
 * the file never passes through our Vercel function.
 *
 * Pre-allocates a Drive file ID server-side so the client never needs to
 * read the Drive upload response body (which fails due to CORS — the session
 * URL is created without the browser's Origin header).
 *
 * Returns both the upload session URL and the pre-allocated Drive file ID.
 */
export async function generateResumableUploadUrl(params: {
  accessToken: string;
  folderId: string;
  fileName: string; // e.g. "{clipId}-source"
  mimeType: string; // "audio/aac" or "audio/webm"
  fileSize: number; // bytes
  appOrigin: string; // e.g. "https://retrodio.vercel.app" — Drive echoes this in CORS headers on the browser PUT
}): Promise<{ uploadSessionUrl: string; driveFileId: string }> {
  const { accessToken, folderId, fileName, mimeType, fileSize, appOrigin } = params;

  // Pre-allocate a Drive file ID so the client has it before the upload,
  // as a fallback in case CORS still prevents reading the PUT response body.
  const drive = getDriveClient(accessToken);
  const idsRes = await drive.files.generateIds({ count: 1, space: "drive" });
  const driveFileId = idsRes.data.ids?.[0];
  if (!driveFileId) throw new Error("Drive did not return a pre-allocated file ID");

  // Include the app Origin in the session initiation request.
  // Drive echoes it back as Access-Control-Allow-Origin on the browser's
  // subsequent PUT, making the cross-origin fetch succeed without CORS errors.
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(fileSize),
        Origin: appOrigin,
      },
      body: JSON.stringify({
        id: driveFileId,
        name: fileName,
        parents: [folderId],
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive resumable upload init failed: ${res.status} ${body}`);
  }

  const location = res.headers.get("Location");
  if (!location) throw new Error("Drive did not return a Location header");

  return { uploadSessionUrl: location, driveFileId };
}

// ─── File Access ──────────────────────────────────────────────────────────────

/**
 * Copy a Drive file into the same folder under a new name.
 * Used by the split route — each child clip gets its own source file in Drive.
 * Returns the new file's Drive ID.
 */
export async function copyDriveFile(
  accessToken: string,
  fileId: string,
  folderId: string,
  name: string,
): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    },
  );
  if (!res.ok) throw new Error(`Drive copy failed: ${res.status}`);
  const data = await res.json() as { id: string };
  return data.id;
}

/**
 * Fetch only size + mimeType metadata for a Drive file.
 * Used by the audio proxy HEAD handler — no audio bytes transferred.
 */
export async function getDriveFileMeta(
  accessToken: string,
  fileId: string,
): Promise<{ size: number; mimeType: string }> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=size%2CmimeType`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Drive metadata failed: ${res.status}`);
  const data = await res.json() as { size: string; mimeType: string };
  return { size: parseInt(data.size, 10), mimeType: data.mimeType };
}

/**
 * Get a readable stream for a Drive file. Used by the audio proxy route.
 * Returns the response so the caller can pipe it to the client with
 * Range support.
 */
export async function getDriveFileStream(
  accessToken: string,
  fileId: string,
  rangeHeader?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (rangeHeader) headers["Range"] = rangeHeader;

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers },
  );

  if (!res.ok && res.status !== 206) {
    throw new Error(`Drive file fetch failed: ${res.status}`);
  }

  return res;
}

/**
 * Upload a file buffer to Drive using a raw multipart/related upload.
 * Uses fetch directly (not the googleapis SDK) so Content-Length is set
 * precisely — the SDK passes a Readable stream to axios which can't compute
 * Content-Length, causing Drive to receive a malformed body and discard content
 * while still returning a file ID.
 * Used for the FFmpeg-rendered frozen clip.
 * Returns the Drive file ID.
 */
export async function uploadDriveFile(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const boundary = `odio_boundary_${Date.now()}`;

  const metadataJson = JSON.stringify({ name: fileName, parents: [folderId] });

  // Build the multipart/related body as a single Buffer so Content-Length is exact
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(metadataJson),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { id?: string };
  if (!data.id) throw new Error("Drive upload did not return a file ID");
  return data.id;
}

/**
 * Delete a file from Drive. Used for cleanup after freeze or clip deletion.
 */
export async function deleteDriveFile(
  accessToken: string,
  fileId: string,
): Promise<void> {
  const drive = getDriveClient(accessToken);
  await drive.files.delete({ fileId });
}

/**
 * Get Drive storage quota for the creator's account.
 * Returns used and limit in bytes.
 */
export async function getDriveQuota(
  accessToken: string,
): Promise<{ used: number; limit: number }> {
  const drive = getDriveClient(accessToken);
  const res = await drive.about.get({ fields: "storageQuota" });
  const quota = res.data.storageQuota;
  return {
    used: parseInt(quota?.usage ?? "0"),
    limit: parseInt(quota?.limit ?? "0"),
  };
}
