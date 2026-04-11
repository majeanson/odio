// GET /api/bands/[bandId]/catalog
//
// Returns all clips in the band across all sessions, split by frozen status.
// Includes per-clip: session name, vote counts (on frozen version), comment count,
// version count, and frozen version number.
//
// Designed for the Catalog tab — a cross-session discovery view.
// Future: will also support album groupings.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";
import type { ClipStage, TranscodeStatus } from "@/types";

export interface CatalogClip {
  id: string;
  name: string;
  sessionId: string;
  sessionName: string;
  sessionCreatedAt: string;
  stage: ClipStage;
  frozen: boolean;
  frozenVersionId: string | null;
  frozenVersionNumber: number | null;
  finalDriveFileId: string | null;
  driveFileId: string | null;
  sourceDurationMs: number | null;
  publicToken: string | null;
  transcodeStatus: TranscodeStatus;
  createdAt: string;
  versionCount: number;
  commentCount: number;
  votes: { KEEP: number; REVISE: number; PASS: number };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { bandId } = await params;

  const membership = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: session.user.email } },
  });
  if (!membership) return apiError("Forbidden", 403);

  const rawClips = await prisma.clip.findMany({
    where: { session: { bandId } },
    include: {
      session: { select: { id: true, name: true, createdAt: true } },
      _count: { select: { versions: true, comments: true } },
      votes: { select: { versionId: true, value: true } },
      versions: { select: { id: true, versionNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const clips: CatalogClip[] = rawClips.map((c) => {
    const frozenVer = c.frozenVersionId
      ? c.versions.find((v) => v.id === c.frozenVersionId) ?? null
      : null;

    const relevantVotes = c.frozenVersionId
      ? c.votes.filter((v) => v.versionId === c.frozenVersionId)
      : [];

    return {
      id: c.id,
      name: c.name,
      sessionId: c.sessionId,
      sessionName: c.session.name,
      sessionCreatedAt: c.session.createdAt.toISOString(),
      stage: c.stage as ClipStage,
      frozen: c.frozen,
      frozenVersionId: c.frozenVersionId,
      frozenVersionNumber: frozenVer?.versionNumber ?? null,
      finalDriveFileId: c.finalDriveFileId,
      driveFileId: c.driveFileId,
      sourceDurationMs: c.sourceDurationMs,
      publicToken: c.publicToken,
      transcodeStatus: c.transcodeStatus as TranscodeStatus,
      createdAt: c.createdAt.toISOString(),
      versionCount: c._count.versions,
      commentCount: c._count.comments,
      votes: {
        KEEP:   relevantVotes.filter((v) => v.value === "KEEP").length,
        REVISE: relevantVotes.filter((v) => v.value === "REVISE").length,
        PASS:   relevantVotes.filter((v) => v.value === "PASS").length,
      },
    };
  });

  return apiOk(clips);
}
