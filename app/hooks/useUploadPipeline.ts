"use client";
// useUploadPipeline — 3-step Drive upload workflow with status tracking.
// Single responsibility: init session URL → PUT blob to Drive → finalize in Postgres.
//
// Steps:
//   1. POST /api/upload/init    → get resumable Drive session URL + pre-allocated driveFileId
//   2. PUT  <sessionUrl>        → stream blob directly to Drive (CORS-safe: no body read)
//   3. POST /api/upload/finalize → create Clip + ClipVersion rows, remove from IndexedDB
//
// Error states:
//   "paused"        — network failure, retryable (upload stays in IndexedDB)
//   "token-error"   — band creator's Drive token invalid (notify user)
//   "session-error" — user's own auth session expired (redirect to login)

import { useState, useCallback } from "react";
import {
  updatePendingUpload,
  deletePendingUpload,
} from "@/lib/pendingUploads";
import { usePendingUploadsStore } from "@/store/pendingUploadsStore";
import type { PendingUpload } from "@/types";

export type UploadStatus =
  | "idle"
  | "uploading"
  | "done"
  | "paused"
  | "token-error"
  | "session-error";

export interface UseUploadPipelineReturn {
  status: UploadStatus;
  resultSessionId: string | null;
  finalizeError: string | null;
  startUpload: (upload: PendingUpload, clipName: string) => Promise<void>;
}

export function useUploadPipeline(initialSessionId?: string): UseUploadPipelineReturn {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [resultSessionId, setResultSessionId] = useState<string | null>(initialSessionId ?? null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const startUpload = useCallback(async (u: PendingUpload, clipName: string) => {
    setStatus("uploading");
    setFinalizeError(null);

    await updatePendingUpload(u.tempId, { clipName, status: "uploading" }).catch(() => {});

    const refreshStore = () => usePendingUploadsStore.getState().refresh();

    try {
      // ── Step 1: Init ────────────────────────────────────────────────────
      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bandId: u.bandId,
          sessionId: u.sessionId || undefined,
          mimeType: u.mimeType,
          fileSize: u.blob.size,
          clipName,
          tempId: u.tempId,
        }),
      });

      if (initRes.status === 401) {
        setStatus("session-error");
        await updatePendingUpload(u.tempId, { status: "session-error" });
        refreshStore();
        return;
      }

      if (!initRes.ok) {
        const body = await initRes.json().catch(() => ({}));
        if (body?.error === "CREATOR_TOKEN_INVALID") {
          setStatus("token-error");
          await updatePendingUpload(u.tempId, { status: "token-error" });
        } else {
          setStatus("paused");
          await updatePendingUpload(u.tempId, { status: "paused" });
        }
        refreshStore();
        return;
      }

      const { uploadSessionUrl, driveFileId } = await initRes.json();
      await updatePendingUpload(u.tempId, { uploadSessionUrl, driveFileId, byteOffset: 0 });

      // ── Step 2: Drive PUT ───────────────────────────────────────────────
      // driveFileId is pre-allocated server-side. We never read the Drive
      // response body (blocked by CORS on the session URL).
      const uploadRes = await fetch(uploadSessionUrl, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes 0-${u.blob.size - 1}/${u.blob.size}`,
          "Content-Type": u.mimeType,
        },
        body: u.blob,
      });

      if (!uploadRes.ok) {
        setStatus("paused");
        await updatePendingUpload(u.tempId, { status: "paused" });
        refreshStore();
        return;
      }

      // ── Step 3: Finalize ────────────────────────────────────────────────
      const finalRes = await fetch("/api/upload/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempId: u.tempId,
          bandId: u.bandId,
          sessionId: u.sessionId || undefined,
          clipName,
          mimeType: u.mimeType,
          durationMs: u.durationMs,
          driveFileId,
          stamps: u.stamps ?? [],
        }),
      });

      if (finalRes.ok) {
        const data = await finalRes.json();
        setResultSessionId(data.sessionId);
        await deletePendingUpload(u.tempId);
        refreshStore();
        setStatus("done");
      } else {
        const errBody = await finalRes.json().catch(() => ({}));
        setFinalizeError(`${finalRes.status}: ${errBody?.error ?? "unknown"}`);
        setStatus("paused");
        await updatePendingUpload(u.tempId, { status: "paused" });
        refreshStore();
      }
    } catch (err) {
      console.error("[useUploadPipeline] network error:", err);
      setStatus("paused");
      await updatePendingUpload(u.tempId, { status: "paused" }).catch(() => {});
      refreshStore();
    }
  }, []);

  return { status, resultSessionId, finalizeError, startUpload };
}
