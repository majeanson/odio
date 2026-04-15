"use client";
// VersionStartPicker — "Start from vN" shortcut buttons below the editor.
// Pure presenter: renders nothing when versions list is empty.
// Lets the user reload a previous version's cut marks without starting from scratch.

import { formatDuration, formatPosition } from "@/lib/utils";
import type { ClipVersion } from "@/types";

interface VersionStartPickerProps {
  versions: ClipVersion[];
  effectiveDurationMs: number;
  onSelect: (version: ClipVersion) => void;
}

export function VersionStartPicker({ versions, effectiveDurationMs, onSelect }: VersionStartPickerProps) {
  if (versions.length === 0) return null;

  return (
    <div>
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted">
        Start from
      </p>
      <div className="flex gap-2 flex-wrap">
        {versions.map((v) => {
          const cuts = Array.isArray(v.cutMarks)
            ? (v.cutMarks as Array<{ startMs: number; endMs: number }>)
            : [];
          const dur = v.resultDurationMs ?? (cuts.length === 0 ? effectiveDurationMs : null);
          return (
            <button
              key={v.id}
              onClick={() => onSelect(v)}
              className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-sm text-muted hover:bg-elevated hover:text-primary transition-colors"
            >
              <span className="font-semibold text-secondary">v{v.versionNumber}</span>
              {dur != null && <span className="font-mono text-xs">{formatDuration(dur)}</span>}
              {v.description && <span className="text-xs text-muted/70">{v.description}</span>}
              {cuts.length > 0 && <span className="text-xs">{cuts.length}✂</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
