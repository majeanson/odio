"use client";

// Public audio player for /share/[token] pages.
// Uses wavesurfer.js to render the waveform and play the frozen audio.
// No auth, no editing, no version interaction.

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { formatDuration } from "@/lib/utils";
import { STAMP_COLORS, STAMP_EMOJI } from "@/types";
import type { StampType } from "@/types";

interface PublicPlayerProps {
  token: string;
  sourceDurationMs: number;
  stamps: Array<{ id: string; timestampMs: number; type: StampType }>;
}

export function PublicPlayer({ token, sourceDurationMs, stamps }: PublicPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [wsState, setWsState] = useState<"loading" | "ready" | "error">("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: `/api/audio/public/${token}`,
      waveColor: "#525252",
      progressColor: "#f59e0b",
      cursorColor: "#f59e0b",
      cursorWidth: 2,
      height: 80,
      normalize: true,
    });

    wsRef.current = ws;
    ws.on("ready", () => setWsState("ready"));
    ws.on("error", () => setWsState("error"));
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    ws.on("timeupdate", (time: number) => setCurrentTimeMs(time * 1000));

    return () => { ws.destroy(); wsRef.current = null; };
  }, [token]);

  return (
    <div className="space-y-4">
      {/* Waveform */}
      <div className="rounded-2xl bg-surface px-4 py-4">
        <div className="flex items-baseline justify-between mb-3">
          <span className="font-mono text-sm text-secondary">
            {formatDuration(currentTimeMs)}
          </span>
          <span className="font-mono text-xs text-muted">
            {formatDuration(sourceDurationMs)}
          </span>
        </div>

        <div ref={containerRef} className="w-full" />

        {wsState === "loading" && (
          <div className="flex items-center justify-center h-20">
            <span className="size-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        )}
        {wsState === "error" && (
          <div className="flex items-center justify-center h-20">
            <p className="text-sm text-danger">Audio unavailable</p>
          </div>
        )}

        {/* Stamp markers */}
        {stamps.length > 0 && wsState === "ready" && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {stamps.map((stamp) => (
              <div
                key={stamp.id}
                className="flex-shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: `${STAMP_COLORS[stamp.type]}20`,
                  color: STAMP_COLORS[stamp.type],
                }}
              >
                <span>{STAMP_EMOJI[stamp.type]}</span>
                <span className="font-mono">{formatDuration(stamp.timestampMs)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Playback controls */}
      {wsState === "ready" && (
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => wsRef.current?.playPause()}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-base shadow-lg shadow-accent/20 transition-transform active:scale-90"
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-7" aria-hidden>
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-7" aria-hidden>
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>

          {/* Download link */}
          <a
            href={`/api/audio/public/${token}`}
            download={`clip.aac`}
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
      )}
    </div>
  );
}
