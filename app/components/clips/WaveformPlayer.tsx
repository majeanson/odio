"use client";
// WaveformPlayer — read-only audio player with cut masking.
// Single responsibility: play a clip version, showing masked cut regions.
//
// Cuts are rendered as near-opaque black bands (hiding the cut waveform).
// Click-to-seek snaps around cuts so the cursor never lands in a dead zone.
// No editing, no version management, no cut creation.
// Used on: clip detail page.

import { useRef, useEffect } from "react";
import { useWaveSurfer } from "./useWaveSurfer";
import { WaveformCanvas } from "./WaveformCanvas";
import { formatPosition, formatDuration, calcResultDuration } from "@/lib/utils";
import { AudioBars } from "@/components/ui/AudioBars";
import { STAMP_COLORS, STAMP_EMOJI } from "@/types";
import type { Stamp } from "@/types";

export interface WaveformPlayerProps {
  clipId: string;
  sourceDurationMs: number;
  activeCuts?: Array<{ startMs: number; endMs: number }>;
  stamps?: Stamp[];
}

export function WaveformPlayer({
  clipId,
  sourceDurationMs,
  activeCuts = [],
  stamps = [],
}: WaveformPlayerProps) {
  // Keep a ref to activeCuts so the timeupdate handler (cut-skipping) and the
  // pointer handler (seek-snap) always see the latest value without re-subscribing.
  const cutsRef = useRef(activeCuts);
  useEffect(() => { cutsRef.current = activeCuts; }, [activeCuts]);

  const ws = useWaveSurfer({
    url: `/api/audio/${clipId}`,
    sourceDurationMs,
    cutMarksRef: cutsRef,
    patchDurationUrl: `/api/clips/${clipId}`,
  });

  const containerWidthPx = ws.containerRef.current?.clientWidth ?? 300;

  // ── Click-to-seek with cut snapping ────────────────────────────────────────
  // Converts a pointer-up position to seconds, then snaps to the nearest valid
  // boundary if the tap lands inside a masked cut region.

  function seekAtPointer(e: React.PointerEvent<HTMLDivElement>) {
    const rect = ws.containerRef.current?.getBoundingClientRect();
    if (!rect || ws.effectiveDurationMs === 0) return;
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ms = frac * ws.effectiveDurationMs;

    const hit = cutsRef.current.find((cm) => ms >= cm.startMs && ms < cm.endMs);
    if (hit) {
      // Snap to whichever boundary is closer
      const nearStart = Math.abs(ms - hit.startMs) < Math.abs(ms - hit.endMs);
      ws.seek(nearStart ? hit.startMs / 1000 : hit.endMs / 1000);
    } else {
      ws.seek(ms / 1000);
    }
  }

  const pointerHandlers = {
    onPointerDown: (_e: React.PointerEvent<HTMLDivElement>) => {},
    onPointerMove: (_e: React.PointerEvent<HTMLDivElement>) => {},
    onPointerUp: seekAtPointer,
    onPointerCancel: (_e: React.PointerEvent<HTMLDivElement>) => {},
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const { wsState, isPlaying, currentTimeMs, effectiveDurationMs } = ws;
  const virtualDurationMs = activeCuts.length > 0
    ? calcResultDuration(effectiveDurationMs, activeCuts)
    : effectiveDurationMs;
  // Stable cut mark ids for WaveformCanvas keys
  const canvasCuts = activeCuts.map((c, i) => ({ id: `cut-${i}`, ...c }));

  return (
    <div className="rounded-2xl bg-surface overflow-hidden">

      {/* Audio duration mismatch warning */}
      {ws.audioDurationMismatch && (
        <div className="px-5 pt-4 pb-0">
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
            <p className="text-xs font-semibold text-danger">Audio file has wrong duration</p>
            <p className="mt-0.5 text-xs text-muted leading-snug">
              Re-split the original clip to create a clean file.
            </p>
          </div>
        </div>
      )}

      {/* Clock */}
      <div className="px-5 pt-5 flex items-baseline justify-between gap-4">
        <span className="font-mono text-3xl font-semibold text-primary tabular-nums leading-none tracking-tight">
          {formatPosition(currentTimeMs)}
        </span>
        <span className="font-mono text-sm text-muted tabular-nums shrink-0">
          {formatPosition(virtualDurationMs)}
        </span>
      </div>

      {/* Waveform + overlays */}
      <WaveformCanvas
        containerRef={ws.containerRef}
        wsState={wsState}
        audioErrorStatus={ws.audioErrorStatus}
        onRetry={ws.retry}
        variant="player"
        cutMarks={canvasCuts}
        previewCut={null}
        effectiveDurationMs={effectiveDurationMs}
        waveScrollLeft={0}
        waveTotalWidth={containerWidthPx}
        containerWidthPx={containerWidthPx}
        splitMode={false}
        splitLinePercent={0}
        pointerHandlers={pointerHandlers}
        cursorStyle="pointer"
      />

      {/* Stamps */}
      {stamps.length > 0 && wsState === "ready" && (
        <div className="px-5 pb-2 flex gap-2 overflow-x-auto">
          {stamps.map((stamp) => (
            <button
              key={stamp.id}
              onClick={() => ws.seek(stamp.timestampMs / 1000)}
              aria-label={`Jump to ${formatDuration(stamp.timestampMs)}`}
              className="icon-sm flex-shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs active:scale-95 transition-transform"
              style={{
                backgroundColor: `${STAMP_COLORS[stamp.type]}20`,
                color: STAMP_COLORS[stamp.type],
              }}
            >
              <span>{STAMP_EMOJI[stamp.type]}</span>
              <span className="font-mono">{formatDuration(stamp.timestampMs)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Loading overlay (shown while waveform is rendering) */}
      {wsState === "loading" && (
        <div className="mx-5 mb-1 h-[100px] flex items-center justify-center -mt-[100px] pointer-events-none">
          <AudioBars className="size-5 text-accent" />
        </div>
      )}

      {/* Play button */}
      <div className="pb-6 pt-2 flex justify-center">
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
      </div>
    </div>
  );
}
