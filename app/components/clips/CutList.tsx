"use client";
// CutList — renders the list of cut marks with nudge controls and zoom-to-cut action.
// Pure presenter: no WaveSurfer access, no audio logic, no state owned here.
// The coordinator owns cutMarks state and passes callbacks for all mutations.

import { formatPosition, formatDuration } from "@/lib/utils";

const NUDGE_STEPS: [number, string][] = [
  [-5000, "−5s"],
  [-1000, "−1s"],
  [-100,  "−0.1s"],
  [100,   "+0.1s"],
  [1000,  "+1s"],
  [5000,  "+5s"],
];

export interface CutMark {
  id: string;
  startMs: number;
  endMs: number;
}

export interface CutListProps {
  cutMarks: CutMark[];
  expandedCutId: string | null;
  resultDurationMs: number;
  onToggleExpand: (id: string) => void;
  onRemove: (id: string) => void;
  onNudge: (id: string, edge: "start" | "end", deltaMs: number) => void;
  onJumpToStart: (cm: CutMark) => void;
  onZoomToCut: (cm: CutMark) => void;
}

export function CutList({
  cutMarks, expandedCutId, resultDurationMs,
  onToggleExpand, onRemove, onNudge, onJumpToStart, onZoomToCut,
}: CutListProps) {
  if (cutMarks.length === 0) return null;

  return (
    <div className="rounded-2xl bg-surface px-5 py-4 space-y-1">
      <p className="text-sm font-semibold text-secondary uppercase tracking-wide mb-3">
        Cuts ({cutMarks.length}) · {formatPosition(resultDurationMs)} result
      </p>

      {cutMarks.map((cm) => {
        const isExpanded = expandedCutId === cm.id;
        return (
          <div key={cm.id} className="rounded-xl overflow-hidden">

            {/* Row header — tap to expand/collapse */}
            <button
              className="w-full flex items-center gap-2 py-2 px-1 text-left active:bg-elevated/50 transition-colors rounded-xl"
              onClick={() => onToggleExpand(cm.id)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`size-3.5 text-muted shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span className="font-mono text-sm text-primary flex-1">
                {formatPosition(cm.startMs)} – {formatPosition(cm.endMs)}
              </span>
              <span className="font-mono text-xs text-muted shrink-0">
                −{formatDuration(cm.endMs - cm.startMs)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(cm.id); }}
                aria-label="Remove cut"
                className="p-1.5 text-muted hover:text-danger transition-colors shrink-0"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                  aria-hidden
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </button>

            {/* Expanded nudge controls */}
            {isExpanded && (
              <div className="pb-3 px-1 space-y-3">

                {/* Start boundary nudge */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Start{" "}
                    <span className="font-mono normal-case tracking-normal">
                      · {formatPosition(cm.startMs)}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {NUDGE_STEPS.map(([delta, label]) => (
                      <button
                        key={label}
                        onClick={() => onNudge(cm.id, "start", delta)}
                        className="rounded-lg bg-elevated px-2.5 py-1.5 font-mono text-xs text-muted hover:text-primary active:scale-95 transition-all"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* End boundary nudge */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    End{" "}
                    <span className="font-mono normal-case tracking-normal">
                      · {formatPosition(cm.endMs)}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {NUDGE_STEPS.map(([delta, label]) => (
                      <button
                        key={label}
                        onClick={() => onNudge(cm.id, "end", delta)}
                        className="rounded-lg bg-elevated px-2.5 py-1.5 font-mono text-xs text-muted hover:text-primary active:scale-95 transition-all"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => onJumpToStart(cm)}
                    className="flex-1 rounded-xl bg-elevated px-3 py-2 text-xs text-muted hover:text-primary transition-colors"
                  >
                    Jump to start
                  </button>
                  <button
                    onClick={() => onZoomToCut(cm)}
                    className="flex-1 rounded-xl bg-elevated px-3 py-2 text-xs text-muted hover:text-primary transition-colors"
                  >
                    Zoom to cut
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
