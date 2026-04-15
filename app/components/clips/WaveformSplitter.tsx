"use client";
// WaveformSplitter — split-mode controls rendered below the waveform.
//
// The waveform itself (WaveformCanvas + containerRef) is owned by WaveformEditor,
// which keeps it mounted at all times so WaveSurfer's canvas never detaches.
// This component only renders the Part A/B summary and the action buttons.
//
// All interaction (tap-to-seek, drag-to-place-marker) is handled by
// splitPointerHandlers in WaveformEditor, which follow the same state-machine
// pattern as useCutInteraction.

import { formatPosition } from "@/lib/utils";

export interface WaveformSplitterProps {
  splitMs: number;
  effectiveDurationMs: number;
  isPlaying: boolean;
  wsState: "loading" | "ready" | "error";
  onTogglePlay: () => void;
  /** Called when the user taps "Mark here" — sets split to current playback time. */
  onMarkHere: () => void;
  /** Called when the user confirms the split — shows the confirm sheet. */
  onConfirm: () => void;
  onCancel: () => void;
}

export function WaveformSplitter({
  splitMs, effectiveDurationMs, isPlaying, wsState,
  onTogglePlay, onMarkHere, onConfirm, onCancel,
}: WaveformSplitterProps) {
  const partAMs = splitMs;
  const partBMs = effectiveDurationMs - splitMs;

  return (
    <>
      {/* Split position summary */}
      <div className="px-5 py-3 flex gap-4 text-sm font-mono">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-0.5">Part A</p>
          <p className="text-primary">0:00:00 – {formatPosition(partAMs)}</p>
          <p className="text-xs text-muted">{formatPosition(partAMs)}</p>
        </div>
        <div className="w-px bg-white/10 self-stretch" />
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-0.5">Part B</p>
          <p className="text-primary">{formatPosition(splitMs)} →</p>
          <p className="text-xs text-muted">{formatPosition(partBMs)}</p>
        </div>
      </div>

      {/* Hint */}
      <p className="text-center text-sm text-muted pb-3 px-5">
        Tap the waveform to place the split marker · Play to preview
      </p>

      {/* Play + Mark here */}
      <div className="pb-5 pt-0 flex items-center justify-center gap-5">
        <button
          onClick={onTogglePlay}
          disabled={wsState !== "ready"}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-accent shadow-[0_4px_0_0_#78350f] transition-[transform,box-shadow] duration-75 active:translate-y-[4px] active:shadow-none disabled:opacity-40 disabled:shadow-none"
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-8" aria-hidden>
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-8" aria-hidden>
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        {/* Mark here — snaps the split marker to the current playback position.
            Useful for precise placement: play until you hear the exact spot, then tap. */}
        <button
          onClick={onMarkHere}
          disabled={wsState !== "ready"}
          className="rounded-full px-5 py-3 text-base font-semibold disabled:opacity-40 transition-colors"
          style={{ background: "rgba(34,211,238,0.15)", color: "#22d3ee" }}
        >
          Mark here
        </button>
      </div>

      {/* Action bar */}
      <div className="px-5 pb-5 flex gap-2">
        <button
          onClick={onConfirm}
          disabled={wsState !== "ready" || splitMs <= 0 || splitMs >= effectiveDurationMs}
          className="flex-1 rounded-2xl bg-cyan-500/20 px-4 py-3.5 text-sm font-semibold text-cyan-300 disabled:opacity-30 active:scale-[0.98] transition-all"
        >
          Split here
        </button>
        <button
          onClick={onCancel}
          className="rounded-2xl bg-elevated px-4 py-3.5 text-sm font-medium text-muted hover:text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </>
  );
}
