// GET  /api/clips/[clipId]/versions — list all versions for a clip
// POST /api/clips/[clipId]/versions — submit a new version (with cut marks)
//
// Version model: each edit is a new row pointing at the same Drive source audio.
// Cut marks are stored as JSON [{startMs, endMs}]. No audio is re-encoded here —
// the actual FFmpeg render only happens on freeze.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";
import type { CutMark } from "@/lib/utils";

async function verifyMembership(clipId: string, userEmail: string) {
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
  const { clip, membership } = await verifyMembership(clipId, session.user.email);

  if (!clip) return apiError("Clip not found", 404);
  if (!membership) return apiError("Forbidden", 403);

  const versions = await prisma.clipVersion.findMany({
    where: { clipId },
    orderBy: { versionNumber: "asc" },
    include: {
      votes: true,
    },
  });

  return apiOk(versions);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId } = await params;
  const { clip, membership } = await verifyMembership(clipId, session.user.email);

  if (!clip) return apiError("Clip not found", 404);
  if (!membership) return apiError("Forbidden", 403);
  if (membership.role === "MEMBER") return apiError("Forbidden — members cannot submit edits", 403);
  if (clip.frozen) return apiError("Cannot edit a frozen clip", 409);

  const body = await req.json().catch(() => null);
  const { cutMarks = [], description, fromVersionId } = body ?? {};

  // Validate cut marks shape
  if (!Array.isArray(cutMarks)) return apiError("cutMarks must be an array");
  for (const cm of cutMarks) {
    if (typeof cm.startMs !== "number" || typeof cm.endMs !== "number") {
      return apiError("Each cut mark must have startMs and endMs (numbers)");
    }
    if (cm.startMs >= cm.endMs) return apiError("Cut mark startMs must be < endMs");
    if (cm.startMs < 0) return apiError("Cut mark startMs must be >= 0");
  }

  // Determine the next version number
  const latest = await prisma.clipVersion.findFirst({
    where: { clipId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true, id: true },
  });

  const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;
  const parentId = fromVersionId ?? latest?.id ?? null;

  // Calculate result duration from cut marks
  const sourceDuration = clip.sourceDurationMs ?? 0;
  const totalCut = (cutMarks as CutMark[]).reduce(
    (sum, cm) => sum + (cm.endMs - cm.startMs),
    0,
  );
  const resultDurationMs = Math.max(0, sourceDuration - totalCut);

  const version = await prisma.clipVersion.create({
    data: {
      clipId,
      versionNumber: nextVersionNumber,
      createdBy: session.user.email,
      fromVersionId: parentId,
      description: description?.trim() || null,
      cutMarks,
      resultDurationMs,
    },
  });

  return apiOk(version, 201);
}
