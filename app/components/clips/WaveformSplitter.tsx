"use client";
// WaveformSplitter — split-point selector.
// Single responsibility: let the user choose where to split a clip.
//
// Receives the parent's UseWaveSurferReturn so it shares the WaveSurfer instance
// (no second audio decode). All playback controls work normally; the only
// additional interaction is dragging the waveform to set the split position.
//
// Interaction model:
//   tap/drag on waveform → moves the cyan split line to that position
//   Mark here button     → sets split to current playback time
//   Split here button    → opens the confirm sheet (caller handles submit)
//   Cancel button        → exits split mode

import { useRef, useState } from "react";
import { WaveformCanvas } from "./WaveformCanvas";
import { formatPosition } from "@/lib/utils";
import type { UseWaveSurferReturn } from "./useWaveSurfer";

export interface WaveformSplitterProps {
  /** Shared WaveSurfer instance from the parent (WaveformEditor). */
  ws: UseWaveSurferReturn;
  splitMs: number;
  onChangeSplitMs: (ms: number) => void;
  onCancel: () => void;
  /** Called when the user confirms the split point — show confirm sheet, call API, etc. */
  onConfirm: () => void;
}

export function WaveformSplitter({
  ws, splitMs, onChangeSplitMs, onCancel, onConfirm,
}: WaveformSplitterProps) {
  const { wsState, isPlaying, currentTimeMs, effectiveDurationMs } = ws;
  const isDraggingRef = useRef(false);
  const [, forceUpdate] = useState(0);

  const containerWidthPx = ws.containerRef.current?.clientWidth ?? 300;
  const splitLinePercent = effectiveDurationMs > 0
    ? Math.min(99, Math.max(1, (splitMs / effectiveDurationMs) * 100))
    : 50;

  // ── Position helper ──────────────────────────────────────────────────────────
  // Converts a pointer clientX to milliseconds, accounting for scroll and zoom
  // (the WaveSurfer instance may still be zoomed from the trim view).

  function clientXToMs(clientX: number): number {
    const rect = ws.containerRef.current?.getBoundingClientRect();
    if (!rect || effectiveDurationMs === 0) return 0;
    const scrollLeft = ws.scrollContainerRef.current?.scrollLeft ?? 0;
    const clipDurSec = effectiveDurationMs / 1000;
    const totalWidth = ws.basePxPerSecRef.current > 0
      ? ws.basePxPerSecRef.current * clipDurSec // zoom=1 (split mode resets zoom)
      : rect.width;
    const relX = (clientX - rect.left) + scrollLeft;
    const sec = Math.max(0, Math.min(clipDurSec, (relX / totalWidth) * clipDurSec));
    return Math.round(sec * 1000);
  }

  // ── Pointer handlers ─────────────────────────────────────────────────────────
  // Tap or drag to position the split line. No cut editing in this mode.

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    onChangeSplitMs(clientXToMs(e.clientX));
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    onChangeSplitMs(clientXToMs(e.clientX));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = false;
    onChangeSplitMs(clientXToMs(e.clientX));
    void forceUpdate; // prevent lint warning
  }

  function onPointerCancel(_e: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = false;
  }

  const pointerHandlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };

  const partAMs = splitMs;
  const partBMs = effectiveDurationMs - splitMs;

  return (
    <div className="rounded-2xl bg-surface overflow-hidden">

      {/* Clock */}
      <div className="px-5 pt-5 flex items-baseline justify-between">
        <span className="font-mono text-3xl font-semibold text-primary tabular-nums leading-none tracking-tight">
          {formatPosition(currentTimeMs)}
        </span>
        <span className="font-mono text-sm text-cyan-400 tabular-nums">
          ✂ {formatPosition(splitMs)}
        </span>
      </div>

      {/* Waveform — split line rendered via WaveformCanvas splitMode=true */}
      <WaveformCanvas
        containerRef={ws.containerRef}
        wsState={wsState}
        audioErrorStatus={ws.audioErrorStatus}
        onRetry={ws.retry}
        cutMarks={[]}
        previewCut={null}
        effectiveDurationMs={effectiveDurationMs}
        waveScrollLeft={ws.waveScrollLeft}
        waveTotalWidth={ws.waveTotalWidth}
        containerWidthPx={containerWidthPx}
        splitMode={true}
        splitLinePercent={splitLinePercent}
        pointerHandlers={pointerHandlers}
        cursorStyle="col-resize"
      />

      {/* Split position summary */}
      <div className="px-5 py-3 flex gap-4 text-sm font-mono">
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-0.5">Part A</p>
          <p className="text-primary">0:00:00 – {formatPosition(partAMs)}</p>
          <p className="text-xs text-muted">{formatPosition(partAMs)}</p>
        </div>
        <div className="w-px bg-white/10 self-stretch" />
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-0.5">Part B</p>
          <p className="text-primary">{formatPosition(splitMs)} →</p>
          <p className="text-xs text-muted">{formatPosition(partBMs)}</p>
        </div>
      </div>

      {/* Play + Mark here */}
      <div className="pb-5 pt-1 flex items-center justify-center gap-5">
        <button
          onClick={ws.togglePlay}
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

        {/* Mark here — set split to current playback position */}
        <button
          onClick={() => onChangeSplitMs(Math.round(currentTimeMs))}
          disabled={wsState !== "ready"}
          className="rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-40 transition-colors"
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
    </div>
  );
}
