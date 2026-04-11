// GET /api/drive/check-file?fileId=XXX
//
// Checks whether a Drive file still exists by fetching its metadata.
// Used by the Drive sync page to detect broken references.
//
// Returns 200 if the file exists and is not trashed.
// Returns 404 if the file is missing or trashed.
// The caller must be a member of a band that references this file.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens } from "@/lib/google";
import { apiError } from "@/lib/utils";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");
  if (!fileId) return apiError("fileId required", 400);

  // Verify the caller is a member of a band that owns this file
  const clip = await prisma.clip.findFirst({
    where: {
      OR: [{ driveFileId: fileId }, { finalDriveFileId: fileId }],
      session: {
        band: {
          members: { some: { userEmail: session.user.email } },
        },
      },
    },
    include: {
      session: {
        include: {
          band: { select: { createdBy: true } },
        },
      },
    },
  });

  if (!clip) return apiError("File not found or no access", 404);

  try {
    const { accessToken } = await getCreatorTokens(clip.session.band.createdBy);

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id%2Ctrashed`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) return new Response(null, { status: 404 });

    const data = await res.json() as { id: string; trashed: boolean };
    if (data.trashed) return new Response(null, { status: 404 });

    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 404 });
  }
}
