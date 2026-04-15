"use client";
// PublicPlayer — audio player for /share/[token] pages.
// Single responsibility: play a frozen public clip with no auth required.
//
// Uses the shared useWaveSurfer hook (same as WaveformPlayer and WaveformEditor)
// for consistent behaviour and mobile seek reliability.
// No cuts, no editing, no version interaction. Stamps are display-only links.

import { useWaveSurfer } from "@/components/clips/useWaveSurfer";
import { WaveformPlayButton } from "@/components/clips/WaveformPlayButton";
import { StampJumpRow } from "@/components/clips/StampJumpRow";
import { formatPosition } from "@/lib/utils";
import type { StampType } from "@/types";

interface PublicPlayerProps {
  token: string;
  sourceDurationMs: number;
  stamps: Array<{ id: string; timestampMs: number; type: StampType }>;
}

export function PublicPlayer({ token, sourceDurationMs, stamps }: PublicPlayerProps) {
  const ws = useWaveSurfer({
    url: `/api/audio/public/${token}`,
    sourceDurationMs,
    // No cutMarksRef — public frozen clips play straight through
    // No patchDurationUrl — read-only public endpoint
  });

  const { wsState, isPlaying, currentTimeMs, effectiveDurationMs } = ws;

  return (
    <div className="space-y-4">

      {/* Waveform card */}
      <div className="rounded-2xl bg-surface px-4 py-4">

        {/* Time display */}
        <div className="flex items-baseline justify-between mb-3">
          <span className="font-mono text-sm text-secondary">
            {formatPosition(currentTimeMs)}
          </span>
          <span className="font-mono text-xs text-muted">
            {formatPosition(effectiveDurationMs || sourceDurationMs)}
          </span>
        </div>

        {/* WaveSurfer mount point — interact:false, no overlay needed (no seeking in public player) */}
        <div ref={ws.containerRef} className="w-full" />

        {wsState === "loading" && (
          <div className="flex items-center justify-center h-[100px] -mt-[100px]">
            <div className="flex gap-1 items-end h-5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-accent animate-pulse"
                  style={{ height: `${50 + i * 20}%`, animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        {wsState === "error" && (
          <div className="flex items-center justify-center h-[100px] -mt-[100px]">
            <p className="text-sm text-danger">Audio unavailable</p>
          </div>
        )}

        <StampJumpRow
          stamps={stamps}
          wsState={wsState}
          onSeek={ws.seek}
          className="mt-2 flex gap-2 overflow-x-auto pb-1"
        />
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-6">
        <WaveformPlayButton
          isPlaying={isPlaying}
          disabled={wsState !== "ready"}
          onClick={ws.togglePlay}
        />

        {/* Download link */}
        <a
          href={`/api/audio/public/${token}`}
          download="clip.aac"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-secondary hover:text-primary transition-colors"
          aria-label="Download audio"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </a>
      </div>
    </div>
  );
}
