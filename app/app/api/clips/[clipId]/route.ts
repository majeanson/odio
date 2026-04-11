// GET    /api/clips/[clipId] — fetch a single clip
// PATCH  /api/clips/[clipId] — rename clip or change stage
// DELETE /api/clips/[clipId] — soft-delete: remove from Postgres + Drive files

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, deleteDriveFile } from "@/lib/google";
import { apiError, apiOk } from "@/lib/utils";
import type { ClipStage } from "@/types";

const VALID_STAGES: ClipStage[] = ["IDEA", "SKETCH", "DEVELOPING", "DEMO_READY"];

async function verifyClipAccess(clipId: string, userEmail: string) {
  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: {
      session: {
        include: {
          band: {
            include: {
              members: {
                where: { userEmail },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!clip) return { clip: null, membership: null };
  const membership = clip.session.band.members[0] ?? null;
  return { clip, membership };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId } = await params;
  const { clip, membership } = await verifyClipAccess(clipId, session.user.email);

  if (!clip) return apiError("Clip not found", 404);
  if (!membership) return apiError("Forbidden", 403);

  return apiOk(clip);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId } = await params;
  const { clip, membership } = await verifyClipAccess(clipId, session.user.email);

  if (!clip) return apiError("Clip not found", 404);
  if (!membership) return apiError("Forbidden", 403);

  const body = await req.json().catch(() => null);
  const { name, stage, generatePublicToken, removePublicToken } = body ?? {};

  if (!name && !stage && generatePublicToken == null && removePublicToken == null) {
    return apiError("Nothing to update");
  }

  // Validate stage if provided
  if (stage && !VALID_STAGES.includes(stage)) {
    return apiError(`Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}`);
  }

  // Public token ops require frozen clip
  if (generatePublicToken && !clip.frozen) {
    return apiError("Clip must be frozen before sharing", 400);
  }

  const updated = await prisma.clip.update({
    where: { id: clipId },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(stage ? { stage } : {}),
      ...(generatePublicToken ? { publicToken: crypto.randomUUID() } : {}),
      ...(removePublicToken ? { publicToken: null } : {}),
    },
  });

  return apiOk(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId } = await params;
  const { clip, membership } = await verifyClipAccess(clipId, session.user.email);

  if (!clip) return apiError("Clip not found", 404);
  if (!membership) return apiError("Forbidden", 403);

  // Only RECORDER or EDITOR can delete
  if (membership.role === "MEMBER") {
    return apiError("Forbidden — only editors can delete clips", 403);
  }

  const bandCreatedBy = clip.session.band.createdBy;

  // Attempt to delete Drive files; non-fatal if files are missing
  try {
    const { accessToken } = await getCreatorTokens(bandCreatedBy);
    const deleteJobs: Promise<void>[] = [];
    if (clip.driveFileId) deleteJobs.push(deleteDriveFile(accessToken, clip.driveFileId));
    if (clip.finalDriveFileId) deleteJobs.push(deleteDriveFile(accessToken, clip.finalDriveFileId));
    await Promise.allSettled(deleteJobs);
  } catch {
    // Drive deletion failed — proceed anyway so Postgres is consistent
  }

  // Delete clip (cascade deletes versions, stamps, annotations via Prisma schema)
  await prisma.clip.delete({ where: { id: clipId } });

  return apiOk({ deleted: true });
}
