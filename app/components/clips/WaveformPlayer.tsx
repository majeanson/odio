"use client";

// Pure waveform player — single responsibility: play audio.
// No editing, no version management, no cut creation.
// Receives activeCuts from parent; visualises them (blue) and skips them during playback.
// Click-to-seek works because enableDragSelection is never called.
// Used on: clip detail page, share page.

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { formatPosition, formatDuration, calcResultDuration } from "@/lib/utils";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const activeCutsRef = useRef(activeCuts);

  const [wsState, setWsState] = useState<"loading" | "ready" | "error">("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  // Keep ref in sync so the timeupdate handler (stale closure) sees current cuts
  useEffect(() => {
    activeCutsRef.current = activeCuts;
  }, [activeCuts]);

  // Re-draw regions when cuts change or waveform first becomes ready
  useEffect(() => {
    if (wsState !== "ready" || !regionsRef.current) return;
    regionsRef.current.clearRegions();
    activeCuts.forEach((m) => {
      const region = regionsRef.current!.addRegion({
        start: m.startMs / 1000,
        end: m.endMs / 1000,
        color: "rgba(59, 130, 246, 0.18)",
        drag: false,
        resize: false,
      });
      // Display-only overlay — must not intercept pointer events so
      // WaveSurfer's native click-to-seek still fires underneath.
      if (region.element) region.element.style.pointerEvents = "none";
    });
  }, [activeCuts, wsState]);

  useEffect(() => {
    if (!containerRef.current) return;
    setWsState("loading");
    setCurrentTimeMs(0);
    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: `/api/audio/${clipId}`,
      waveColor: "#3f3f46",
      progressColor: "#f59e0b",
      cursorColor: "#f59e0b",
      cursorWidth: 2,
      height: 88,
      normalize: true,
      interact: true, // click-to-seek — works because no enableDragSelection overlay
      plugins: [regions],
    });

    wsRef.current = ws;
    ws.on("ready", () => setWsState("ready"));
    ws.on("error", () => setWsState("error"));
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    ws.on("timeupdate", (time: number) => {
      const ms = time * 1000;
      setCurrentTimeMs(ms);
      const hit = activeCutsRef.current.find((cm) => ms >= cm.startMs && ms < cm.endMs);
      if (hit && wsRef.current) wsRef.current.setTime(hit.endMs / 1000);
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [clipId, retryKey]);

  const virtualDurationMs =
    activeCuts.length > 0 ? calcResultDuration(sourceDurationMs, activeCuts) : sourceDurationMs;

  return (
    <div className="rounded-2xl bg-surface overflow-hidden">
      {/* Clock */}
      <div className="px-5 pt-5 flex items-baseline justify-between gap-4">
        <span className="font-mono text-3xl font-semibold text-primary tabular-nums leading-none tracking-tight">
          {formatPosition(currentTimeMs)}
        </span>
        <span className="font-mono text-sm text-muted tabular-nums shrink-0">
          {formatPosition(virtualDurationMs)}
        </span>
      </div>

      {/* Waveform */}
      <div className="px-5 pt-3 pb-1">
        <div ref={containerRef} className="w-full" />
        {wsState === "loading" && (
          <div className="h-[88px] flex items-center justify-center">
            <span className="size-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        )}
        {wsState === "error" && (
          <div className="h-[88px] flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-muted text-center leading-snug">
              Drive connection needs renewal
            </p>
            <div className="flex items-center gap-3">
              <a
                href="/login"
                className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-medium text-white"
              >
                Reconnect Drive
              </a>
              <button
                onClick={() => setRetryKey((k) => k + 1)}
                className="text-xs text-muted underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stamps */}
      {stamps.length > 0 && wsState === "ready" && (
        <div className="px-5 pb-2 flex gap-2 overflow-x-auto">
          {stamps.map((stamp) => (
            <button
              key={stamp.id}
              onClick={() => wsRef.current?.setTime(stamp.timestampMs / 1000)}
              aria-label={`Jump to ${formatDuration(stamp.timestampMs)}`}
              className="flex-shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs active:scale-95 transition-transform"
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

      {/* Play button */}
      <div className="pb-6 pt-2 flex justify-center">
        <button
          onClick={() => wsRef.current?.playPause()}
          disabled={wsState !== "ready"}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-accent shadow-lg shadow-accent/25 transition-transform active:scale-90 disabled:opacity-40 disabled:shadow-none"
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
      </div>
    </div>
  );
}
