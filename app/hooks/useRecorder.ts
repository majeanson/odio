"use client";
// useRecorder — MediaRecorder lifecycle, level meter, stamps, and IndexedDB persistence.
// Single responsibility: capture audio and track recording state.
//
// Device selection and stream acquisition are delegated to useAudioDevices.
//
// State machine: idle → recording → stopping → stopped
// Stamps are buffered in a ref during recording and committed on stop — no closure
// dependency on state avoids MediaRecorder being re-created every time a stamp is added.

import { useState, useRef, useCallback, useEffect } from "react";
import { useAudioDevices } from "./useAudioDevices";
import { savePendingUpload } from "@/lib/pendingUploads";
import type { StampType, PendingUpload } from "@/types";
import { v4 as uuidv4 } from "uuid";

export type RecorderState = "idle" | "recording" | "stopping" | "stopped";

export interface RecordedStamp {
  timestampMs: number;
  type: StampType;
}

export interface RecorderResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  stamps: RecordedStamp[];
  tempId: string;
}

export interface UseRecorderReturn {
  state: RecorderState;
  /** Current audio level 0–1, updated ~60fps during recording */
  level: number;
  /** Elapsed recording time in ms */
  elapsedMs: number;
  stamps: RecordedStamp[];
  annotations: Array<{ timestampMs: number; text: string }>;
  result: RecorderResult | null;
  error: string | null;
  // Device fields forwarded from useAudioDevices
  devices: ReturnType<typeof useAudioDevices>["devices"];
  selectedDeviceId: string | null;
  selectDevice: (deviceId: string | null) => void;
  deviceFallbackWarning: boolean;
  /** Web Audio analyser node — non-null while recording, for live visualisation */
  analyserRef: React.RefObject<AnalyserNode | null>;
  start: () => Promise<void>;
  stop: () => void;
  addStamp: (type: StampType) => void;
  addAnnotation: (text: string) => void;
}

export function useRecorder({ bandId, sessionId }: { bandId: string; sessionId?: string }): UseRecorderReturn {
  const audioDevices = useAudioDevices();

  const [state, setState] = useState<RecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stamps, setStamps] = useState<RecordedStamp[]>([]);
  const [annotations, setAnnotations] = useState<Array<{ timestampMs: number; text: string }>>([]);
  const [result, setResult] = useState<RecorderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref mirror of stamps — lets onstop read the full list without a closure dep on state
  const stampsRef = useRef<RecordedStamp[]>([]);

  // Level meter — updates at ~60fps via requestAnimationFrame
  const updateLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);
    const rms = Math.sqrt(data.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / data.length);
    setLevel(Math.min(1, rms * 4));
    animFrameRef.current = requestAnimationFrame(updateLevel);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    stampsRef.current = [];
    setStamps([]);
    setAnnotations([]);
    setResult(null);

    let stream: MediaStream;
    try {
      stream = await audioDevices.getAudioStream();
    } catch (err) {
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow access and try again."
          : "Could not access microphone.",
      );
      return;
    }

    // Web Audio — analyser for level meter
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    // Wake Lock — keep screen on during recording (convenience, not critical)
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then((lock) => { wakeLockRef.current = lock; }).catch(() => {});
    }

    // Prefer AAC/MP4, fall back to WebM
    const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const durationMs = Date.now() - startTimeRef.current;
      const tempId = uuidv4();
      const currentStamps = stampsRef.current;

      const pending: PendingUpload = {
        tempId, blob, mimeType,
        recordedAt: startTimeRef.current,
        durationMs,
        bandId,
        sessionId: sessionId ?? "",
        clipName: "",
        stamps: currentStamps,
        retryCount: 0,
        status: "pending",
      };

      await savePendingUpload(pending).catch(() => {});

      setResult({ blob, mimeType, durationMs, stamps: currentStamps, tempId });
      setState("stopped");

      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close();
    };

    startTimeRef.current = Date.now();
    setState("recording");
    recorder.start(1000);
    animFrameRef.current = requestAnimationFrame(updateLevel);

    elapsedIntervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 500);
  }, [bandId, sessionId, audioDevices, updateLevel]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      setState("stopping");
      mediaRecorderRef.current.stop();
    }
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    cancelAnimationFrame(animFrameRef.current);
    setLevel(0);
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  const addStamp = useCallback((type: StampType) => {
    const timestampMs = Date.now() - startTimeRef.current;
    const stamp = { timestampMs, type };
    stampsRef.current = [...stampsRef.current, stamp];
    setStamps(stampsRef.current);
    if ("vibrate" in navigator) navigator.vibrate(30);
  }, []);

  const addAnnotation = useCallback((text: string) => {
    const timestampMs = Date.now() - startTimeRef.current;
    setAnnotations((prev) => [...prev, { timestampMs, text: text.trim() }]);
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  return {
    state, level, elapsedMs, stamps, annotations, result, error,
    devices: audioDevices.devices,
    selectedDeviceId: audioDevices.selectedDeviceId,
    selectDevice: audioDevices.selectDevice,
    deviceFallbackWarning: audioDevices.deviceFallbackWarning,
    analyserRef,
    start, stop, addStamp, addAnnotation,
  };
}
