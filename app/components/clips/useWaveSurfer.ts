"use client";
// useWaveSurfer — manages WaveSurfer lifecycle.
// Single responsibility: audio playback + waveform rendering.
//
// Key design decisions:
//   - interact:false — all pointer events are handled externally via an overlay div
//   - Seek-in-flight guard: after ws.setTime(), mobile browsers can fire a timeupdate
//     with the OLD currentTime before the audio element updates. We track the seek
//     target and ignore stale events until the audio catches up.
//   - Re-seek on play(): before ws.play(), we call ws.setTime(currentTimeMsRef.current)
//     to guarantee audio plays from the tracked cursor position, not wherever the
//     audio element's internal currentTime happens to be.

import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";

export interface CutBoundary {
  startMs: number;
  endMs: number;
}

export interface UseWaveSurferOptions {
  clipId: string;
  sourceDurationMs: number;
  /** Kept in sync by the coordinator. Read inside WaveSurfer's timeupdate to skip cuts. */
  cutMarksRef: React.MutableRefObject<CutBoundary[]>;
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
  clipId,
  sourceDurationMs,
  cutMarksRef,
}: UseWaveSurferOptions): UseWaveSurferReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const basePxPerSecRef = useRef(0);
  const effectiveDurMsRef = useRef(sourceDurationMs);
  const currentTimeMsRef = useRef(0);
  // Seek-in-flight guard: set to the target ms when seek() is called.
  // timeupdate events that are more than 500ms from this target are ignored
  // (they're stale pre-seek events from the previous position).
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
      url: `/api/audio/${clipId}`,
      waveColor: "#3f3f46",
      progressColor: "#f59e0b",
      cursorColor: "#f59e0b",
      cursorWidth: 2,
      height: 100,
      normalize: true,
      interact: false, // all pointer events are managed by WaveformCanvas overlay
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
        if (sourceDurationMs === 0 || Math.abs(wsDur - sourceDurationMs) > 200) {
          fetch(`/api/clips/${clipId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceDurationMs: wsDur }),
          }).catch(() => {});
        }
      }

      const containerWidth = containerRef.current?.clientWidth ?? 300;
      const dur = ws.getDuration();
      if (dur > 0) basePxPerSecRef.current = containerWidth / dur;

      // scrollContainer = wrapper.parentElement inside WaveSurfer's shadow DOM.
      // This is the element that receives the native "scroll" event and whose
      // scrollLeft we read for zoom/pan position math.
      const sc = (ws.getWrapper() as HTMLElement)?.parentElement ?? null;
      scrollContainerRef.current = sc;
      if (sc) setWaveTotalWidth(sc.scrollWidth);
    });

    ws.on("error", () => {
      fetch(`/api/audio/${clipId}`, { method: "HEAD" })
        .then((r) => setAudioErrorStatus(r.status))
        .catch(() => setAudioErrorStatus(null))
        .finally(() => setWsState("error"));
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => {
      setIsPlaying(false);
      ws.setTime(0);
      currentTimeMsRef.current = 0;
      setCurrentTimeMs(0);
    });

    ws.on("timeupdate", (time: number) => {
      const ms = time * 1000;
      const effDur = effectiveDurMsRef.current;

      // Seek-in-flight guard: ignore stale pre-seek timeupdate events.
      // Mobile browsers (Safari) can fire timeupdate with the OLD currentTime
      // immediately after ws.setTime(), before the audio element updates.
      if (seekTargetMsRef.current !== null) {
        if (Math.abs(ms - seekTargetMsRef.current) > 500) return; // stale — ignore
        seekTargetMsRef.current = null; // caught up to seek target — resume normal tracking
      }

      const clamped = effDur > 0 ? Math.min(ms, effDur) : ms;
      currentTimeMsRef.current = clamped;
      setCurrentTimeMs(clamped);

      if (!ws.isPlaying()) return;

      // Hard stop at effective duration (guard against stale Drive uploads)
      if (effDur > 0 && ms >= effDur) {
        ws.pause();
        ws.setTime(0);
        currentTimeMsRef.current = 0;
        setCurrentTimeMs(0);
        return;
      }

      // Skip over cut regions during playback
      const hit = cutMarksRef.current.find((cm) => ms >= cm.startMs && ms < cm.endMs);
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

    // WaveSurfer emits "scroll" whenever its scrollContainer's native scroll
    // event fires — including when we programmatically set sc.scrollLeft during pan.
    ws.on("scroll", () => {
      const sc = scrollContainerRef.current;
      if (sc) setWaveScrollLeft(sc.scrollLeft);
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [clipId, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = useCallback((sec: number) => {
    const ws = wsRef.current;
    if (!ws) return;
    const clamped = Math.min(sec, ws.getDuration());
    const ms = clamped * 1000;
    // Set the guard BEFORE calling setTime so it's active when timeupdate fires.
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
      // Re-seek to the tracked cursor position before playing.
      // Guarantees audio starts from where the visual cursor is, not from
      // wherever the audio element's internal currentTime happens to be
      // (which can lag on mobile after a click-to-seek).
      ws.setTime(currentTimeMsRef.current / 1000);
      ws.play();
    }
  }, []);

  const applyZoom = useCallback((pxPerSec: number) => {
    wsRef.current?.zoom(pxPerSec);
    // Read scrollWidth after WaveSurfer redraws at the new zoom level.
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
