// Shared utility functions — used across all features.
// Import from "@/lib/utils" throughout the app.

import { generateDeathMetalName } from "@/lib/clipNames";

// ─── Class Name Helper ────────────────────────────────────────────────────────

/**
 * Merge class names, filtering out falsy values.
 * Lightweight alternative to clsx for our use case.
 *
 * @example cn("base-class", isActive && "active", undefined) → "base-class active"
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ─── Time / Duration Formatting ───────────────────────────────────────────────

/**
 * Format milliseconds as M:SS (e.g. 125000 → "2:05").
 * Used for clip durations, version durations, waveform timestamps.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Format milliseconds as H:MM:SS (e.g. 125000 → "0:02:05").
 * Used for the main waveform position counter where H:MM:SS precision is needed.
 */
export function formatPosition(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format a timestamp as "· 9:41pm" for clip auto-names.
 */
export function formatTimeOfDay(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format a date as relative time (e.g. "3 min ago", "2 hours ago", "Apr 10").
 * Used in activity feeds and version cards.
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format a date as "Apr 10" for session headings.
 */
export function formatSessionDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Cut Region Math ──────────────────────────────────────────────────────────

export interface CutMark {
  startMs: number;
  endMs: number;
}

/**
 * Calculate result duration after applying cut marks to a source.
 * Cuts are non-overlapping (enforced in the editor) so we sum their lengths.
 */
export function calcResultDuration(
  sourceDurationMs: number,
  cutMarks: CutMark[],
): number {
  const totalCut = cutMarks.reduce(
    (sum, cut) => sum + (cut.endMs - cut.startMs),
    0,
  );
  return Math.max(0, sourceDurationMs - totalCut);
}

/**
 * Format the duration diff for the editor top bar.
 * @example "8:12 → 5:34 (-2:38)"
 */
export function formatDurationDiff(
  sourceDurationMs: number,
  cutMarks: CutMark[],
): string {
  const result = calcResultDuration(sourceDurationMs, cutMarks);
  const removed = sourceDurationMs - result;
  if (removed === 0) return formatDuration(sourceDurationMs);
  return `${formatDuration(sourceDurationMs)} → ${formatDuration(result)} (-${formatDuration(removed)})`;
}

/**
 * Filter and remap stamps for a frozen (cut-rendered) audio file.
 * - Stamps that fall inside a cut region are removed.
 * - Remaining stamp timestamps are shifted left by the total cut duration
 *   that precedes them, so positions stay correct in the rendered file.
 * Cuts must be non-overlapping (enforced by the editor).
 */
export function remapStampsForCuts<T extends { timestampMs: number }>(
  stamps: T[],
  cutMarks: CutMark[],
): T[] {
  if (cutMarks.length === 0) return stamps;
  const sorted = [...cutMarks].sort((a, b) => a.startMs - b.startMs);
  return stamps
    .filter((s) => !sorted.some((c) => s.timestampMs >= c.startMs && s.timestampMs < c.endMs))
    .map((s) => {
      const removedMs = sorted
        .filter((c) => c.endMs <= s.timestampMs)
        .reduce((sum, c) => sum + (c.endMs - c.startMs), 0);
      return { ...s, timestampMs: s.timestampMs - removedMs };
    });
}

// ─── Clip Auto-naming ─────────────────────────────────────────────────────────

/**
 * Generate a death-metal clip name like "Putrid Descent" or "Severed Throne".
 * The sequenceNumber parameter is kept for call-site compatibility but unused.
 */
export function generateClipName(_sequenceNumber?: number): string {
  return generateDeathMetalName();
}

// ─── Session Auto-naming ──────────────────────────────────────────────────────

/**
 * Generate a session name like "Apr 10 Jam".
 */
export function generateSessionName(date?: Date): string {
  const d = date ?? new Date();
  return `${formatSessionDate(d)} Jam`;
}

// ─── File Size Formatting ─────────────────────────────────────────────────────

/**
 * Format bytes as human-readable size (e.g. 43_000_000 → "43 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

/**
 * Standard API error response shape. All API routes throw/return this.
 */
export function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/**
 * Standard API success response.
 */
export function apiOk<T>(data: T, status = 200) {
  return Response.json(data, { status });
}
