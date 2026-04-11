// Shared TypeScript types for the Odio app.
// These mirror the Prisma schema but are safe to import on both server and client.

// ─── Enums ────────────────────────────────────────────────────────────────────

export type BandRole = "RECORDER" | "EDITOR" | "MEMBER";
export type ClipStage = "IDEA" | "SKETCH" | "DEVELOPING" | "DEMO_READY";
export type TranscodeStatus = "PENDING" | "DONE" | "FAILED";
export type StampType = "FIRE" | "KEEP" | "UNCERTAIN" | "IDEA";
export type VoteValue = "KEEP" | "REVISE" | "PASS";

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Band {
  id: string;
  name: string;
  createdBy: string;
  inviteCode: string;
  driveFolderId: string;
  autoFreeze: boolean;
  createdAt: string;
}

export interface BandMember {
  bandId: string;
  userEmail: string;
  displayName: string | null;
  role: BandRole;
  joinedAt: string;
}

export interface JamSession {
  id: string;
  bandId: string;
  name: string;
  notes: string | null;
  recordedBy: string;
  createdAt: string;
  _count?: { clips: number };
}

export interface Clip {
  id: string;
  sessionId: string;
  name: string;
  stage: ClipStage;
  driveFileId: string | null;
  finalDriveFileId: string | null;
  sourceDurationMs: number | null;
  frozen: boolean;
  frozenVersionId: string | null;
  publicToken: string | null;
  transcodeStatus: TranscodeStatus;
  createdBy: string;
  recordedByEmail: string | null;
  createdAt: string;
  _count?: { versions: number };
}

export interface ClipVersion {
  id: string;
  clipId: string;
  versionNumber: number;
  createdBy: string;
  fromVersionId: string | null;
  description: string | null;
  cutMarks: CutMark[];
  resultDurationMs: number | null;
  createdAt: string;
  votes?: Vote[];
}

export interface CutMark {
  startMs: number;
  endMs: number;
}

export interface Stamp {
  id: string;
  clipId: string;
  timestampMs: number;
  type: StampType;
  createdBy: string;
  createdAt: string;
}

export interface Annotation {
  id: string;
  clipId: string;
  versionId: string | null;
  timestampMs: number;
  text: string;
  authorEmail: string;
  private: boolean;
  createdAt: string;
}

export interface Vote {
  clipId: string;
  versionId: string;
  userEmail: string;
  value: VoteValue;
  updatedAt: string;
}

export interface Comment {
  id: string;
  clipId: string;
  versionId: string | null;
  userEmail: string;
  text: string;
  timestampMs: number | null;
  editedAt: string | null;
  createdAt: string;
}

// ─── API Response Helpers ─────────────────────────────────────────────────────

export interface ApiError {
  error: string;
}

// ─── Upload / Resilience ──────────────────────────────────────────────────────

/** Shape stored in IndexedDB pending-uploads store */
export interface PendingUpload {
  tempId: string;
  blob: Blob;
  mimeType: string;
  recordedAt: number; // unix ms
  durationMs: number;
  bandId: string;
  sessionId: string;
  clipName: string;
  stamps?: Array<{ timestampMs: number; type: string }>; // buffered during recording
  uploadSessionUrl?: string; // Drive resumable upload URL (once init'd)
  driveFileId?: string;      // Drive file ID returned after upload completes
  byteOffset?: number;       // last committed byte for resume
  retryCount: number;
  lastAttemptAt?: number;
  status: "pending" | "uploading" | "paused" | "token-error" | "session-error";
}

// ─── Waveform / Editor ────────────────────────────────────────────────────────

/** Stamp color mapping for waveform overlay */
export const STAMP_COLORS: Record<StampType, string> = {
  FIRE:      "#ef4444",
  KEEP:      "#eab308",
  UNCERTAIN: "#f97316",
  IDEA:      "#3b82f6",
};

/** Stamp emoji mapping */
export const STAMP_EMOJI: Record<StampType, string> = {
  FIRE:      "🔥",
  KEEP:      "⭐",
  UNCERTAIN: "❓",
  IDEA:      "💡",
};

/** Human-readable clip stage labels */
export const STAGE_LABELS: Record<ClipStage, string> = {
  IDEA:       "idea",
  SKETCH:     "sketch",
  DEVELOPING: "developing",
  DEMO_READY: "demo-ready",
};
