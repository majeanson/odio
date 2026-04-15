"use client";
// WaveformPlayer — read-only audio player with cut masking.
// Single responsibility: play a clip version, showing masked cut regions.
//
// Cuts are rendered as near-opaque black bands (hiding the cut waveform).
// Click-to-seek snaps around cuts so the cursor never lands in a dead zone.
// No editing, no version management, no cut creation.
// Used on: clip detail page.

import { useRef, useEffect, useMemo } from "react";
import { useWaveSurfer } from "./useWaveSurfer";
import { WaveformCanvas } from "./WaveformCanvas";
import { WaveformPlayButton } from "./WaveformPlayButton";
import { StampJumpRow } from "./StampJumpRow";
import { formatPosition, calcResultDuration } from "@/lib/utils";
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

  // Filter out stamps that fall inside cut regions — they're unreachable during playback.
  // Source timestamps are preserved (player operates in source-time space).
  const visibleStamps = useMemo(
    () => activeCuts.length === 0
      ? stamps
      : stamps.filter((s) => !activeCuts.some((c) => s.timestampMs >= c.startMs && s.timestampMs < c.endMs)),
    [stamps, activeCuts],
  );
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

      <StampJumpRow stamps={visibleStamps} wsState={wsState} onSeek={ws.seek} />

      {/* Play button */}
      <div className="pb-6 pt-2 flex justify-center">
        <WaveformPlayButton
          isPlaying={isPlaying}
          disabled={wsState !== "ready"}
          onClick={ws.togglePlay}
        />
      </div>
    </div>
  );
}
