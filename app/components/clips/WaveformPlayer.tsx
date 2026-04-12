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
  // Tracks the current position outside of React state so the play button handler
  // is never stale. Updated by every timeupdate (both playback and click-to-seek).
  // Used to re-seek right before play() — fixes WaveSurfer's click-while-paused
  // sync gap where the visual cursor moves but the audio element's currentTime lags.
  const currentTimeMsRef = useRef(0);

  const [wsState, setWsState] = useState<"loading" | "ready" | "error">("loading");
  const [audioErrorStatus, setAudioErrorStatus] = useState<number | null>(null);
  const [audioDurationMismatch, setAudioDurationMismatch] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  // Tracks the real audio duration. Starts as the DB value; updated from
  // WaveSurfer on first load when sourceDurationMs is 0 (imported clips).
  const [detectedDurationMs, setDetectedDurationMs] = useState(0);
  // Ref keeps the effective duration accessible inside stale WaveSurfer closures
  // without requiring the effect to re-run. Set synchronously in the ready handler
  // so timeupdate sees the real value before the first play tick.
  const effectiveDurMsRef = useRef(sourceDurationMs);
  const effectiveDurationMs = sourceDurationMs || detectedDurationMs;
  effectiveDurMsRef.current = effectiveDurationMs;

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
    ws.on("ready", () => {
      setWsState("ready");
      const wsDur = ws.getDuration() * 1000;
      if (sourceDurationMs === 0) {
        // Duration unknown (imported clip). Set the ref synchronously so the
        // very first timeupdate tick already has the right value — don't wait
        // for the React state re-render that setDetectedDurationMs triggers.
        effectiveDurMsRef.current = wsDur;
        setDetectedDurationMs(wsDur);
        // Persist to DB so subsequent page loads have a real sourceDurationMs.
        fetch(`/api/clips/${clipId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceDurationMs: wsDur }),
        }).catch(() => {/* non-fatal */});
      } else {
        const tolerance = Math.max(2000, sourceDurationMs * 0.1);
        if (Math.abs(wsDur - sourceDurationMs) > tolerance) {
          setAudioDurationMismatch(true);
        }
      }
    });
    ws.on("error", () => {
      // Probe the audio URL to get the real HTTP status so we can show
      // the right message (auth error vs. file missing vs. server error).
      fetch(`/api/audio/${clipId}`, { method: "HEAD" })
        .then((r) => setAudioErrorStatus(r.status))
        .catch(() => setAudioErrorStatus(null))
        .finally(() => setWsState("error"));
    });
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => {
      setIsPlaying(false);
      // Reset cursor to the beginning so the waveform looks clean at rest
      // rather than leaving an amber line pinned at the right edge.
      ws.setTime(0);
    });
    ws.on("timeupdate", (time: number) => {
      const ms = time * 1000;
      const effDur = effectiveDurMsRef.current;
      // Always track position — currentTimeMsRef is used by the play button
      // to re-seek before playback (fixes click-while-paused sync gap).
      currentTimeMsRef.current = effDur > 0 ? Math.min(ms, effDur) : ms;
      setCurrentTimeMs(effDur > 0 ? Math.min(ms, effDur) : ms);
      // Only skip cuts during active playback — never during seeks while paused
      // (which would cause position 0 after finish-reset to jump to a cut's endMs).
      if (!ws.isPlaying()) return;
      // Stop if the Drive file is longer than the clip duration (e.g. stale split upload).
      // Guard effDur > 0 so imported clips with unknown duration play to natural finish.
      if (effDur > 0 && ms >= effDur) {
        ws.pause();
        ws.setTime(0);
        return;
      }
      const hit = activeCutsRef.current.find((cm) => ms >= cm.startMs && ms < cm.endMs);
      if (hit && wsRef.current) {
        const targetSec = hit.endMs / 1000;
        // Seeking to the very end of a streamed file can silently fail if the
        // final bytes aren't buffered yet. Detect end-cuts and stop cleanly.
        if (effDur > 0 && targetSec >= effDur / 1000 - 0.3) {
          ws.pause();
          ws.setTime(hit.startMs / 1000);
        } else {
          ws.setTime(targetSec);
        }
      }
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [clipId, retryKey]);

  const virtualDurationMs =
    activeCuts.length > 0 ? calcResultDuration(effectiveDurationMs, activeCuts) : effectiveDurationMs;

  return (
    <div className="rounded-2xl bg-surface overflow-hidden">
      {/* Audio file mismatch warning */}
      {audioDurationMismatch && (
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
              {audioErrorStatus === 404
                ? "Audio not yet available — upload may still be processing"
                : audioErrorStatus === 401 || audioErrorStatus === 503
                  ? "Drive connection needs renewal"
                  : "Audio unavailable"}
            </p>
            <div className="flex items-center gap-3">
              {(audioErrorStatus === 401 || audioErrorStatus === 503) && (
                <a
                  href="/login"
                  className="icon-sm rounded-xl bg-accent px-3.5 py-1.5 text-xs font-bold text-[#080808]"
                >
                  Reconnect Drive
                </a>
              )}
              <button
                onClick={() => { setAudioErrorStatus(null); setRetryKey((k) => k + 1); }}
                className="icon-sm text-xs text-muted underline underline-offset-2"
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
              onClick={() => {
              // Update ref synchronously so the play button doesn't re-seek
              // to the old position if pressed immediately after a stamp click.
              currentTimeMsRef.current = stamp.timestampMs;
              wsRef.current?.setTime(stamp.timestampMs / 1000);
            }}
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

      {/* Play button */}
      <div className="pb-6 pt-2 flex justify-center">
        <button
          onClick={() => {
            const ws = wsRef.current;
            if (!ws) return;
            if (ws.isPlaying()) {
              ws.pause();
            } else {
              // Re-seek to the tracked cursor position before playing.
              // WaveSurfer's click-while-paused updates the visual cursor via
              // timeupdate but the audio element's currentTime can lag behind —
              // this guarantees play always starts where the cursor is.
              ws.setTime(currentTimeMsRef.current / 1000);
              ws.play();
            }
          }}
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
