"use client";
// useAudioDevices — enumerate audio inputs, persist selection, acquire streams.
// Single responsibility: know which microphone is available and get a stream from it.
//
// Musicians want raw audio: echo cancellation, noise suppression, and auto-gain
// are all disabled. Device selection is persisted in localStorage so the chosen
// mic survives page reloads.

import { useState, useEffect, useCallback } from "react";

export interface AudioDevice {
  deviceId: string;
  label: string;
}

const DEVICE_KEY = "odio:selectedDeviceId";

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [deviceFallbackWarning, setDeviceFallbackWarning] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(DEVICE_KEY) ?? null;
  });

  const enumerateDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(
        all
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId })),
      );
    } catch { /* mediaDevices not available in all contexts */ }
  }, []);

  useEffect(() => {
    enumerateDevices();
    navigator.mediaDevices?.addEventListener("devicechange", enumerateDevices);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", enumerateDevices);
  }, [enumerateDevices]);

  function selectDevice(deviceId: string | null) {
    setSelectedDeviceId(deviceId);
    if (deviceId) localStorage.setItem(DEVICE_KEY, deviceId);
    else localStorage.removeItem(DEVICE_KEY);
  }

  /**
   * Acquires a MediaStream from the selected device.
   * Falls back to the system default if the chosen device is unavailable (e.g. Bluetooth disconnected).
   * Throws on permission denial or any other hard failure.
   * Refreshes the device list on success so labels appear after the first permission grant.
   */
  const getAudioStream = useCallback(async (): Promise<MediaStream> => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId
          ? { ...MIC_CONSTRAINTS, deviceId: { exact: selectedDeviceId } }
          : MIC_CONSTRAINTS,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "OverconstrainedError" && selectedDeviceId) {
        // Preferred device no longer available — silently fall back to system default
        stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
        setDeviceFallbackWarning(true);
        setTimeout(() => setDeviceFallbackWarning(false), 4000);
      } else {
        throw err;
      }
    }
    // Labels are now available — refresh so the picker shows real names
    enumerateDevices();
    return stream;
  }, [selectedDeviceId, enumerateDevices]);

  return { devices, selectedDeviceId, deviceFallbackWarning, selectDevice, getAudioStream };
}
