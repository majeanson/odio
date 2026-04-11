"use client";

// Thin hook wrapping the Zustand pendingUploadsStore.
// Initialises the store from IndexedDB on first mount and wires the online
// event for auto-retry. All state and actions live in the store — components
// can also import usePendingUploadsStore directly if they need only a slice.

import { useEffect } from "react";
import { usePendingUploadsStore } from "@/store/pendingUploadsStore";

export function usePendingUploads() {
  const { uploads, refresh, retryUpload, discardUpload, saveToDevice } =
    usePendingUploadsStore();

  // Load IndexedDB on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-retry paused uploads when the device comes back online
  useEffect(() => {
    function onOnline() {
      const paused = usePendingUploadsStore
        .getState()
        .uploads.filter((u) => u.status === "paused");
      paused.forEach((u) => retryUpload(u.tempId));
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retryUpload]);

  return {
    pendingUploads: uploads,
    retryUpload,
    discardUpload,
    saveToDevice,
  };
}
