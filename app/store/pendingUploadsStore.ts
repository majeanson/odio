// Zustand store for pending upload state.
// Single source of truth for the UploadBanner and the recording post-screen.
// IndexedDB is the durable store; this is the in-memory view of it.

import { create } from "zustand";
import {
  getAllPendingUploads,
  updatePendingUpload,
  deletePendingUpload,
  downloadBlobToDevice,
} from "@/lib/pendingUploads";
import type { PendingUpload } from "@/types";

interface PendingUploadsState {
  uploads: PendingUpload[];
  /** Sync the in-memory list from IndexedDB */
  refresh: () => Promise<void>;
  retryUpload: (tempId: string) => Promise<void>;
  discardUpload: (tempId: string) => Promise<void>;
  saveToDevice: (tempId: string) => Promise<void>;
}

export const usePendingUploadsStore = create<PendingUploadsState>((set, get) => {
  /** Update a single upload in-memory — avoids a full IndexedDB read. */
  function patchUpload(tempId: string, patch: Partial<PendingUpload>) {
    set((s) => ({
      uploads: s.uploads.map((u) => (u.tempId === tempId ? { ...u, ...patch } : u)),
    }));
  }

  return {
    uploads: [],

    refresh: async () => {
      const uploads = await getAllPendingUploads().catch(() => []);
      set({ uploads });
    },

    retryUpload: async (tempId) => {
      const { uploads } = get();
      const upload = uploads.find((u) => u.tempId === tempId);
      if (!upload) return;

      const retryPatch = {
        status: "uploading" as const,
        retryCount: upload.retryCount + 1,
        lastAttemptAt: Date.now(),
      };
      await updatePendingUpload(tempId, retryPatch);
      patchUpload(tempId, retryPatch);

      try {
        let sessionUrl = upload.uploadSessionUrl;
        let byteOffset = upload.byteOffset ?? 0;

        let driveFileId = upload.driveFileId;

        if (!sessionUrl) {
          const initRes = await fetch("/api/upload/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bandId: upload.bandId,
              sessionId: upload.sessionId,
              mimeType: upload.mimeType,
              fileSize: upload.blob.size,
              clipName: upload.clipName,
              tempId: upload.tempId,
            }),
          });

          if (initRes.status === 401) {
            await updatePendingUpload(tempId, { status: "session-error" });
            patchUpload(tempId, { status: "session-error" });
            return;
          }

          if (!initRes.ok) {
            const body = await initRes.json().catch(() => ({}));
            const status = body?.error === "CREATOR_TOKEN_INVALID" ? "token-error" : "paused";
            await updatePendingUpload(tempId, { status });
            patchUpload(tempId, { status });
            return;
          }

          const data = await initRes.json();
          sessionUrl = data.uploadSessionUrl;
          driveFileId = data.driveFileId;
          byteOffset = 0;
          await updatePendingUpload(tempId, { uploadSessionUrl: sessionUrl, driveFileId, byteOffset: 0 });
          patchUpload(tempId, { uploadSessionUrl: sessionUrl, driveFileId, byteOffset: 0 });
        }

        // driveFileId is pre-allocated server-side — never read the Drive response
        // body, which is blocked by CORS (session URL created without browser Origin).
        const slice = upload.blob.slice(byteOffset);
        const uploadRes = await fetch(sessionUrl!, {
          method: "PUT",
          headers: {
            "Content-Range": `bytes ${byteOffset}-${upload.blob.size - 1}/${upload.blob.size}`,
            "Content-Type": upload.mimeType,
          },
          body: slice,
        });

        if (!uploadRes.ok && uploadRes.status !== 308) {
          await updatePendingUpload(tempId, { status: "paused" });
          patchUpload(tempId, { status: "paused" });
          return;
        }

        if (!driveFileId) {
          await updatePendingUpload(tempId, { status: "paused" });
          patchUpload(tempId, { status: "paused" });
          return;
        }

        const finalRes = await fetch("/api/upload/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tempId: upload.tempId,
            bandId: upload.bandId,
            sessionId: upload.sessionId || undefined,
            clipName: upload.clipName,
            mimeType: upload.mimeType,
            durationMs: upload.durationMs,
            driveFileId,
            stamps: upload.stamps ?? [],
          }),
        });

        if (finalRes.ok) {
          await deletePendingUpload(tempId);
          set((s) => ({ uploads: s.uploads.filter((u) => u.tempId !== tempId) }));
        } else {
          await updatePendingUpload(tempId, { status: "paused" });
          patchUpload(tempId, { status: "paused" });
        }
      } catch {
        await updatePendingUpload(tempId, { status: "paused" }).catch(() => {});
        patchUpload(tempId, { status: "paused" });
      }
    },

    discardUpload: async (tempId) => {
      await deletePendingUpload(tempId);
      set((s) => ({ uploads: s.uploads.filter((u) => u.tempId !== tempId) }));
    },

    saveToDevice: async (tempId) => {
      const upload = get().uploads.find((u) => u.tempId === tempId);
      if (!upload) return;
      const ext = upload.mimeType.includes("webm") ? "webm" : "aac";
      downloadBlobToDevice(upload.blob, `${upload.clipName}.${ext}`);
    },
  };
});
