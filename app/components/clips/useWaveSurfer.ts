"use client";
// useWaveSurfer — manages WaveSurfer lifecycle.
// Single responsibility: audio playback + waveform rendering.
//
// Used by all three waveform variants:
//   WaveformPlayer   — read-only player with cut masking
//   WaveformEditor   — trim editor (create/resize cuts)
//   WaveformSplitter — split point selector
//   PublicPlayer     — public share page player
//
// Key design decisions:
//   - interact:false — all pointer events handled externally via an overlay div
//   - Seek-in-flight guard: after ws.setTime(), mobile browsers can fire a
//     timeupdate with the OLD currentTime before the audio element updates.
//     We track the seek target and ignore stale events until audio catches up.
//   - Re-seek on play(): before ws.play(), we call ws.setTime(currentTimeMsRef)
//     so audio always starts from the tracked cursor position on mobile.

import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";

export interface CutBoundary {
  startMs: number;
  endMs: number;
}

export interface UseWaveSurferOptions {
  /** Full audio URL (e.g. /api/audio/${clipId} or /api/audio/public/${token}) */
  url: string;
  sourceDurationMs: number;
  /**
   * Read by the timeupdate handler to skip over cut regions during playback.
   * Optional — if omitted, no cut-skipping happens (suitable for plain players).
   */
  cutMarksRef?: React.MutableRefObject<CutBoundary[]>;
  /**
   * If provided, PATCH this URL when the detected file duration differs from
   * sourceDurationMs by more than 200ms (handles imported clips + FFmpeg rounding).
   */
  patchDurationUrl?: string;
}

export interface UseWaveSurferReturn {
  // DOM refs — passed down to WaveformCanvas and interaction hooks
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  wsRef: React.MutableRefObject<WaveSurfer | null>;
  scrollContainerRef: React.MutableRefObject<HTMLElement | null>;
  basePxPerSecRef: React.MutableRefObject<number>;
  effectiveDurMsRef: React.MutableRefObject<number>;
  currentTimeMsRef: React.MutableRefObject<number>;
  // React state for rendering
  wsState: "loading" | "ready" | "error";
  isPlaying: boolean;
  currentTimeMs: number;
  effectiveDurationMs: number;
  audioDurationMismatch: boolean;
  audioErrorStatus: number | null;
  waveScrollLeft: number;
  waveTotalWidth: number;
  // Actions
  seek: (sec: number) => void;
  togglePlay: () => void;
  applyZoom: (pxPerSec: number) => void;
  retry: () => void;
}

export function useWaveSurfer({
  url,
  sourceDurationMs,
  cutMarksRef,
  patchDurationUrl,
}: UseWaveSurferOptions): UseWaveSurferReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const basePxPerSecRef = useRef(0);
  const effectiveDurMsRef = useRef(sourceDurationMs);
  const currentTimeMsRef = useRef(0);
  // Internal empty ref used when cutMarksRef is not provided (no cut-skipping).
  const emptyCutsRef = useRef<CutBoundary[]>([]);
  const activeCutsRef = cutMarksRef ?? emptyCutsRef;
  // Seek-in-flight guard: after ws.setTime(), mobile browsers (Safari) can fire
  // a timeupdate with the OLD currentTime. We store the target and ignore events
  // that are more than 500ms away until the audio element catches up.
  const seekTargetMsRef = useRef<number | null>(null);

  const [wsState, setWsState] = useState<"loading" | "ready" | "error">("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [detectedDurationMs, setDetectedDurationMs] = useState(0);
  const [audioDurationMismatch, setAudioDurationMismatch] = useState(false);
  const [audioErrorStatus, setAudioErrorStatus] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [waveScrollLeft, setWaveScrollLeft] = useState(0);
  const [waveTotalWidth, setWaveTotalWidth] = useState(0);

  const effectiveDurationMs = sourceDurationMs || detectedDurationMs;
  effectiveDurMsRef.current = effectiveDurationMs;

  useEffect(() => {
    if (!containerRef.current) return;
    setWsState("loading");
    setIsPlaying(false);
    setCurrentTimeMs(0);
    setWaveScrollLeft(0);
    setWaveTotalWidth(0);
    currentTimeMsRef.current = 0;
    seekTargetMsRef.current = null;
    basePxPerSecRef.current = 0;
    scrollContainerRef.current = null;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      waveColor: "#3f3f46",
      progressColor: "#f59e0b",
      cursorColor: "#f59e0b",
      cursorWidth: 2,
      height: 100,
      normalize: true,
      interact: false, // all pointer events managed externally via an overlay div
    });

    wsRef.current = ws;

    ws.on("ready", () => {
      setWsState("ready");
      const wsDur = ws.getDuration() * 1000;
      const isWrongFile =
        sourceDurationMs > 0 &&
        wsDur > sourceDurationMs * 1.5 &&
        wsDur - sourceDurationMs > 10_000;

      if (isWrongFile) {
        setAudioDurationMismatch(true);
      } else {
        effectiveDurMsRef.current = wsDur;
        setDetectedDurationMs(wsDur);
        if (patchDurationUrl && (sourceDurationMs === 0 || Math.abs(wsDur - sourceDurationMs) > 200)) {
          fetch(patchDurationUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceDurationMs: wsDur }),
          }).catch(() => {});
        }
      }

      const containerWidth = containerRef.current?.clientWidth ?? 300;
      const dur = ws.getDuration();
      if (dur > 0) basePxPerSecRef.current = containerWidth / dur;

      const sc = (ws.getWrapper() as HTMLElement)?.parentElement ?? null;
      scrollContainerRef.current = sc;
      if (sc) setWaveTotalWidth(sc.scrollWidth);
    });

    ws.on("error", () => {
      fetch(url, { method: "HEAD" })
        .then((r) => setAudioErrorStatus(r.status))
        .catch(() => setAudioErrorStatus(null))
        .finally(() => setWsState("error"));
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => {
      setIsPlaying(false);
      seekTargetMsRef.current = null;
      ws.setTime(0);
      currentTimeMsRef.current = 0;
      setCurrentTimeMs(0);
    });

    ws.on("timeupdate", (time: number) => {
      const ms = time * 1000;
      const effDur = effectiveDurMsRef.current;

      // Seek-in-flight guard: ignore stale pre-seek timeupdates.
      if (seekTargetMsRef.current !== null) {
        if (Math.abs(ms - seekTargetMsRef.current) > 500) return;
        seekTargetMsRef.current = null;
      }

      const clamped = effDur > 0 ? Math.min(ms, effDur) : ms;
      currentTimeMsRef.current = clamped;
      setCurrentTimeMs(clamped);

      if (!ws.isPlaying()) return;

      // Hard stop at effective duration (stale Drive upload guard)
      if (effDur > 0 && ms >= effDur) {
        setIsPlaying(false);
        ws.pause();
        seekTargetMsRef.current = null;
        ws.setTime(0);
        currentTimeMsRef.current = 0;
        setCurrentTimeMs(0);
        return;
      }

      // Skip over cut regions during playback (only if cutMarksRef was provided)
      const hit = activeCutsRef.current.find((cm) => ms >= cm.startMs && ms < cm.endMs);
      if (hit) {
        const targetSec = hit.endMs / 1000;
        const isEndCut = effDur > 0 && targetSec >= effDur / 1000 - 0.3;
        if (isEndCut) {
          ws.pause();
          ws.setTime(hit.startMs / 1000);
        } else {
          ws.setTime(targetSec);
        }
      }
    });

    ws.on("scroll", () => {
      const sc = scrollContainerRef.current;
      if (sc) setWaveScrollLeft(sc.scrollLeft);
    });

    // ResizeObserver — recalculates basePxPerSecRef and waveTotalWidth when the
    // container is resized (e.g. orientation change on mobile, panel resize on desktop).
    // Without this, cut band positions and interaction coordinate math go stale after resize.
    const ro = new ResizeObserver(() => {
      if (!wsRef.current) return;
      const dur = wsRef.current.getDuration();
      const w = containerRef.current?.clientWidth ?? 0;
      if (w > 0 && dur > 0) {
        basePxPerSecRef.current = w / dur;
      }
      const sc = scrollContainerRef.current;
      if (sc) {
        setWaveTotalWidth(sc.scrollWidth);
        setWaveScrollLeft(sc.scrollLeft);
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      ws.destroy();
      wsRef.current = null;
    };
  }, [url, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = useCallback((sec: number) => {
    const ws = wsRef.current;
    if (!ws) return;
    const clamped = Math.min(sec, ws.getDuration());
    const ms = clamped * 1000;
    seekTargetMsRef.current = ms;
    currentTimeMsRef.current = ms;
    setCurrentTimeMs(ms);
    ws.setTime(clamped);
  }, []);

  const togglePlay = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.isPlaying()) {
      ws.pause();
    } else {
      // Re-seek before playing to guarantee audio starts where the cursor is.
      // Necessary on mobile where audio element currentTime can lag after seek.
      ws.setTime(currentTimeMsRef.current / 1000);
      ws.play();
    }
  }, []);

  const applyZoom = useCallback((pxPerSec: number) => {
    wsRef.current?.zoom(pxPerSec);
    requestAnimationFrame(() => {
      const sc = scrollContainerRef.current;
      if (sc) {
        setWaveTotalWidth(sc.scrollWidth);
        setWaveScrollLeft(sc.scrollLeft);
      }
    });
  }, []);

  const retry = useCallback(() => {
    setAudioErrorStatus(null);
    setRetryKey((k) => k + 1);
  }, []);

  return {
    containerRef, wsRef, scrollContainerRef, basePxPerSecRef,
    effectiveDurMsRef, currentTimeMsRef,
    wsState, isPlaying, currentTimeMs, effectiveDurationMs,
    audioDurationMismatch, audioErrorStatus,
    waveScrollLeft, waveTotalWidth,
    seek, togglePlay, applyZoom, retry,
  };
}
