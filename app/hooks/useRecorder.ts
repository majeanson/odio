"use client";

// Core recording hook — manages MediaRecorder lifecycle, level meter,
// wake lock, stamps, IndexedDB persistence on stop, and audio input selection.
//
// State machine: idle → recording → stopping → stopped
// Stamps are buffered in memory during recording and written on finalize.
// Devices: enumerated on mount; selected device persisted in localStorage.

import { useState, useRef, useCallback, useEffect } from "react";
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

export interface AudioDevice {
  deviceId: string;
  label: string;
}

const DEVICE_STORAGE_KEY = "odio:selectedDeviceId";

export interface UseRecorderReturn {
  state: RecorderState;
  /** Current audio level 0–1, updated ~60fps during recording */
  level: number;
  /** Elapsed recording time in ms */
  elapsedMs: number;
  stamps: RecordedStamp[];
  result: RecorderResult | null;
  error: string | null;
  /** Available audio input devices (populated after first permission grant) */
  devices: AudioDevice[];
  /** Currently selected device ID (null = system default) */
  selectedDeviceId: string | null;
  selectDevice: (deviceId: string | null) => void;
  /** Set when selected device was unavailable and we fell back to the default */
  deviceFallbackWarning: boolean;
  start: () => Promise<void>;
  stop: () => void;
  addStamp: (type: StampType) => void;
  addAnnotation: (text: string) => void;
  annotations: Array<{ timestampMs: number; text: string }>;
}

export function useRecorder(params: {
  bandId: string;
  sessionId?: string;
}): UseRecorderReturn {
  const { bandId, sessionId } = params;

  const [state, setState] = useState<RecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stamps, setStamps] = useState<RecordedStamp[]>([]);
  const [annotations, setAnnotations] = useState<
    Array<{ timestampMs: number; text: string }>
  >([]);
  const [result, setResult] = useState<RecorderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [deviceFallbackWarning, setDeviceFallbackWarning] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      return localStorage.getItem(DEVICE_STORAGE_KEY) ?? null;
    },
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref mirror of stamps state — lets onstop read current stamps without
  // being in the closure deps, which would cause MediaRecorder to be re-created
  // every time a stamp is added mid-recording.
  const stampsRef = useRef<RecordedStamp[]>([]);

  // Enumerate audio input devices after mount.
  // Only populated after the user has granted microphone permission at least once.
  async function enumerateDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId }));
      setDevices(inputs);
    } catch {
      // mediaDevices may not be available in all contexts — silently ignore
    }
  }

  useEffect(() => {
    enumerateDevices();
    // Re-enumerate when devices change (Bluetooth connect/disconnect)
    navigator.mediaDevices?.addEventListener("devicechange", enumerateDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", enumerateDevices);
    };
  }, []);

  function selectDevice(deviceId: string | null) {
    setSelectedDeviceId(deviceId);
    if (deviceId) {
      localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    } else {
      localStorage.removeItem(DEVICE_STORAGE_KEY);
    }
  }

  // Level meter — updates at ~60fps via requestAnimationFrame
  const updateLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);
    // RMS calculation
    const rms = Math.sqrt(
      data.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / data.length,
    );
    setLevel(Math.min(1, rms * 4)); // scale up for visual clarity
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
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false, // musicians don't want echo cancellation
        noiseSuppression: false,
        autoGainControl: false,
      };
      // Use selected device if set and still available
      if (selectedDeviceId) {
        audioConstraints.deviceId = { exact: selectedDeviceId };
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
    } catch (err) {
      // If exact device constraint failed, retry with default
      if (
        err instanceof Error &&
        err.name === "OverconstrainedError" &&
        selectedDeviceId
      ) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
          // Notify UI that we fell back to the built-in mic
          setDeviceFallbackWarning(true);
          setTimeout(() => setDeviceFallbackWarning(false), 4000);
        } catch {
          setError("Could not access microphone.");
          return;
        }
      } else {
        setError(
          err instanceof Error && err.name === "NotAllowedError"
            ? "Microphone permission denied. Please allow access and try again."
            : "Could not access microphone.",
        );
        return;
      }
    }

    // After permission granted, refresh device list (labels now available)
    enumerateDevices();

    // Set up Web Audio analyser for level meter
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    // Wake Lock — keep screen on during recording
    if ("wakeLock" in navigator) {
      navigator.wakeLock
        .request("screen")
        .then((lock) => { wakeLockRef.current = lock; })
        .catch(() => {}); // not critical — just a convenience
    }

    // MediaRecorder — prefer AAC/MP4, fall back to WebM
    const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const durationMs = Date.now() - startTimeRef.current;
      const tempId = uuidv4();
      const currentStamps = stampsRef.current; // read from ref — stable, no re-render dependency

      const pending: PendingUpload = {
        tempId,
        blob,
        mimeType,
        recordedAt: startTimeRef.current,
        durationMs,
        bandId,
        sessionId: sessionId ?? "",
        clipName: "", // will be set on post-record screen or auto-generated on finalize
        stamps: currentStamps,
        retryCount: 0,
        status: "pending",
      };

      // Write to IndexedDB FIRST — before any upload attempt
      await savePendingUpload(pending).catch(() => {});

      setResult({
        blob,
        mimeType,
        durationMs,
        stamps: currentStamps,
        tempId,
      });
      setState("stopped");

      // Cleanup
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close();
    };

    startTimeRef.current = Date.now();
    setState("recording");

    recorder.start(1000); // collect chunks every 1s
    animFrameRef.current = requestAnimationFrame(updateLevel);

    // Elapsed timer
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 500);
  }, [bandId, sessionId, selectedDeviceId, updateLevel]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      setState("stopping");
      mediaRecorderRef.current.stop();
    }
    // Release wake lock
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    // Stop level meter
    cancelAnimationFrame(animFrameRef.current);
    setLevel(0);
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  const addStamp = useCallback((type: StampType) => {
    const timestampMs = Date.now() - startTimeRef.current;
    const newStamp = { timestampMs, type };
    // Keep ref in sync so onstop reads the full list without a closure dependency on state
    stampsRef.current = [...stampsRef.current, newStamp];
    setStamps(stampsRef.current);
    // Haptic feedback
    if ("vibrate" in navigator) navigator.vibrate(30);
  }, []);

  const addAnnotation = useCallback((text: string) => {
    const timestampMs = Date.now() - startTimeRef.current;
    setAnnotations((prev) => [...prev, { timestampMs, text: text.trim() }]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (elapsedIntervalRef.current)
        clearInterval(elapsedIntervalRef.current);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  return {
    state,
    level,
    elapsedMs,
    stamps,
    result,
    error,
    devices,
    selectedDeviceId,
    deviceFallbackWarning,
    selectDevice,
    start,
    stop,
    addStamp,
    addAnnotation,
    annotations,
  };
}
