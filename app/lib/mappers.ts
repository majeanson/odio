// Serialization mappers for Prisma → plain objects.
// Dates become ISO strings; opaque JSON columns are cast to their typed shape.

import type { ClipVersion, Stamp, Vote, Comment } from "@/types";

export function mapClipVersion(
  v: {
    id: string;
    clipId: string;
    versionNumber: number;
    createdBy: string;
    fromVersionId: string | null;
    description: string | null;
    cutMarks: unknown;
    resultDurationMs: number | null;
    createdAt: Date;
    votes?: Array<{
      clipId: string;
      versionId: string;
      userEmail: string;
      value: string;
      updatedAt: Date;
    }>;
  }
): ClipVersion {
  return {
    id: v.id,
    clipId: v.clipId,
    versionNumber: v.versionNumber,
    createdBy: v.createdBy,
    fromVersionId: v.fromVersionId,
    description: v.description,
    cutMarks: v.cutMarks as ClipVersion["cutMarks"],
    resultDurationMs: v.resultDurationMs,
    createdAt: v.createdAt.toISOString(),
    votes: (v.votes ?? []).map((vote) => ({
      clipId: vote.clipId,
      versionId: vote.versionId,
      userEmail: vote.userEmail,
      value: vote.value as Vote["value"],
      updatedAt: vote.updatedAt.toISOString(),
    })),
  };
}

export function mapStamp(s: {
  id: string;
  clipId: string;
  timestampMs: number;
  type: string;
  createdBy: string;
  createdAt: Date;
}): Stamp {
  return {
    id: s.id,
    clipId: s.clipId,
    timestampMs: s.timestampMs,
    type: s.type as Stamp["type"],
    createdBy: s.createdBy,
    createdAt: s.createdAt.toISOString(),
  };
}

export function mapVote(v: {
  clipId: string;
  versionId: string;
  userEmail: string;
  value: string;
  updatedAt: Date;
}): Vote {
  return {
    clipId: v.clipId,
    versionId: v.versionId,
    userEmail: v.userEmail,
    value: v.value as Vote["value"],
    updatedAt: v.updatedAt.toISOString(),
  };
}

export function mapComment(c: {
  id: string;
  clipId: string;
  versionId: string | null;
  userEmail: string;
  text: string;
  timestampMs: number | null;
  editedAt: Date | null;
  createdAt: Date;
}): Comment {
  return {
    id: c.id,
    clipId: c.clipId,
    versionId: c.versionId,
    userEmail: c.userEmail,
    text: c.text,
    timestampMs: c.timestampMs,
    editedAt: c.editedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}
