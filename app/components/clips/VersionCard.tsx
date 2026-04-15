"use client";
// VersionCard — a single selectable version button in the clip detail Versions tab.
// Single responsibility: display version metadata and signal selection.

import { cn, formatDuration } from "@/lib/utils";
import type { ClipVersion } from "@/types";

interface VersionCardProps {
  version: ClipVersion;
  isActive: boolean;
  sourceDurationMs: number;
  onClick: () => void;
}

export function VersionCard({ version, isActive, sourceDurationMs, onClick }: VersionCardProps) {
  const cuts = Array.isArray(version.cutMarks)
    ? (version.cutMarks as Array<{ startMs: number; endMs: number }>)
    : [];
  const dur = version.resultDurationMs ?? (cuts.length === 0 ? sourceDurationMs : null);
  const label = version.description
    || (version.versionNumber === 1 ? "Original recording" : `Version ${version.versionNumber}`);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 rounded-2xl px-5 py-5 text-left transition-colors",
        isActive ? "bg-accent/10 border border-accent/30" : "bg-surface hover:bg-elevated",
      )}
    >
      <span
        className={cn(
          "shrink-0 min-w-[3rem] text-center rounded-xl px-2 py-1.5 text-base font-bold tabular-nums",
          isActive ? "bg-accent/25 text-accent" : "bg-elevated text-secondary",
        )}
      >
        v{version.versionNumber}
      </span>

      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-lg font-semibold truncate",
          isActive ? "text-primary" : version.description ? "text-secondary" : "text-muted",
        )}>
          {label}
        </p>
        <p className="mt-1 flex gap-3 text-base text-muted">
          {dur != null && <span className="font-mono">{formatDuration(dur)}</span>}
          {cuts.length > 0 && (
            <span>{cuts.length} cut{cuts.length !== 1 ? "s" : ""}</span>
          )}
        </p>
      </div>

      {isActive && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-5 text-accent shrink-0" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}
