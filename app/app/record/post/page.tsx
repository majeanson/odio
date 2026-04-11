"use client";

// Post-record screen — shown immediately after recording stops.
// User can rename the clip, see duration + stamps, monitor upload progress,
// then go Done (→ session), Record Another (→ /record), or Delete.
//
// Upload is started automatically on mount. This screen is the primary
// upload initiator; stranded uploads are recovered by the root auth layout.

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import {
  getPendingUpload,
  updatePendingUpload,
  deletePendingUpload,
} from "@/lib/pendingUploads";
import { formatDuration, generateClipName } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { STAMP_EMOJI } from "@/types";
import type { PendingUpload, StampType } from "@/types";

type UploadStatus =
  | "loading"
  | "uploading"
  | "done"
  | "paused"
  | "token-error"
  | "session-error";

function statusLabel(status: UploadStatus): string {
  switch (status) {
    case "loading":
    case "uploading":
      return "Uploading…";
    case "done":
      return "Saved";
    case "paused":
      return "Upload paused — waiting for connection";
    case "token-error":
      return "Drive connection needs renewal — ask band creator to re-authorize";
    case "session-error":
      return "Session expired — sign in again to resume";
  }
}

// Group stamps by type for the summary row
function stampSummary(stamps: Array<{ timestampMs: number; type: string }>) {
  const counts: Partial<Record<StampType, number>> = {};
  for (const s of stamps) {
    const t = s.type as StampType;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return Object.entries(counts) as [StampType, number][];
}

function PostRecordScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tempId = searchParams.get("tempId") ?? "";
  const bandId = searchParams.get("bandId") ?? "";
  const sessionIdParam = searchParams.get("sessionId") ?? undefined;

  const [upload, setUpload] = useState<PendingUpload | null>(null);
  const [clipName, setClipName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [status, setStatus] = useState<UploadStatus>("loading");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [resultSessionId, setResultSessionId] = useState<string | null>(
    sessionIdParam ?? null,
  );

  const uploadStartedRef = useRef(false);

  // Load the pending upload from IndexedDB on mount
  useEffect(() => {
    if (!tempId) return;
    getPendingUpload(tempId).then((u) => {
      if (!u) {
        // Pending upload missing — navigate home
        router.replace(`/bands/${bandId}`);
        return;
      }
      // Auto-generate a name if blank
      const name = u.clipName || generateClipName(1);
      setUpload({ ...u, clipName: name });
      setClipName(name);
      setNameInput(name);
    });
  }, [tempId, bandId, router]);

  const doUpload = useCallback(
    async (u: PendingUpload, name: string) => {
      if (uploadStartedRef.current) return;
      uploadStartedRef.current = true;

      setStatus("uploading");

      // Persist the clip name to IndexedDB before uploading
      await updatePendingUpload(u.tempId, {
        clipName: name,
        status: "uploading",
      }).catch(() => {});

      try {
        // Step 1: Get a Drive resumable upload session URL
        const initRes = await fetch("/api/upload/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bandId: u.bandId,
            sessionId: u.sessionId || undefined,
            mimeType: u.mimeType,
            fileSize: u.blob.size,
            clipName: name,
            tempId: u.tempId,
          }),
        });

        if (initRes.status === 401) {
          setStatus("session-error");
          await updatePendingUpload(u.tempId, { status: "session-error" });
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
          return;
        }

        const { uploadSessionUrl } = await initRes.json();
        await updatePendingUpload(u.tempId, {
          uploadSessionUrl,
          byteOffset: 0,
        });

        // Step 2: Upload blob directly to Drive
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
          uploadStartedRef.current = false;
          return;
        }

        // Parse Drive file ID from upload response
        const uploadBody = await uploadRes.json().catch(() => ({}));
        const driveFileId: string | undefined = uploadBody?.id;

        if (!driveFileId) {
          setStatus("paused");
          await updatePendingUpload(u.tempId, { status: "paused" });
          uploadStartedRef.current = false;
          return;
        }

        await updatePendingUpload(u.tempId, { driveFileId });

        // Step 3: Finalize — create Clip + ClipVersion rows in Postgres
        const finalRes = await fetch("/api/upload/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tempId: u.tempId,
            bandId: u.bandId,
            sessionId: u.sessionId || undefined,
            clipName: name,
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
          setStatus("done");
        } else {
          setStatus("paused");
          await updatePendingUpload(u.tempId, { status: "paused" });
          uploadStartedRef.current = false;
        }
      } catch {
        // Network error — leave in IndexedDB for root layout recovery
        setStatus("paused");
        await updatePendingUpload(u.tempId, { status: "paused" }).catch(() => {});
        uploadStartedRef.current = false;
      }
    },
    [],
  );

  // Start upload once we have the upload data
  useEffect(() => {
    if (upload && status === "loading") {
      doUpload(upload, clipName);
    }
  }, [upload, status, clipName, doUpload]);

  function handleNameSave() {
    const trimmed = nameInput.trim();
    if (trimmed) setClipName(trimmed);
    setEditingName(false);
  }

  async function handleDelete() {
    await deletePendingUpload(tempId);
    setDeleteConfirmOpen(false);
    router.replace(`/bands/${bandId}`);
  }

  function handleDone() {
    if (resultSessionId) {
      router.replace(`/bands/${bandId}/sessions/${resultSessionId}`);
    } else {
      router.replace(`/bands/${bandId}`);
    }
  }

  function handleNextSong() {
    router.replace(
      `/record?bandId=${bandId}${sessionIdParam ? `&sessionId=${sessionIdParam}` : ""}`,
    );
  }

  const stamps = upload?.stamps ?? [];
  const summary = stampSummary(stamps);
  const isDone = status === "done";
  const isError = status === "paused" || status === "token-error" || status === "session-error";

  return (
    <div className="flex min-h-svh flex-col bg-base text-primary px-6 pt-safe">
      {/* Header */}
      <div className="flex h-14 items-center">
        <button
          onClick={handleDone}
          className="text-secondary hover:text-primary transition-colors"
          aria-label="Close"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
            aria-hidden
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <h1 className="ml-3 text-base font-semibold">Clip saved</h1>
      </div>

      {/* Clip name */}
      <div className="mt-8">
        {editingName ? (
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameSave();
                if (e.key === "Escape") {
                  setNameInput(clipName);
                  setEditingName(false);
                }
              }}
              maxLength={100}
              className="flex-1 rounded-xl border border-accent bg-surface px-4 py-3 text-xl font-semibold text-primary focus:outline-none"
            />
          </div>
        ) : (
          <button
            onClick={() => {
              setNameInput(clipName);
              setEditingName(true);
            }}
            className="flex items-center gap-2 group"
            aria-label="Rename clip"
          >
            <span className="text-2xl font-semibold text-primary">{clipName}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity"
              aria-hidden
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}

        {/* Duration */}
        {upload && (
          <p className="mt-1 font-mono text-lg text-secondary">
            {formatDuration(upload.durationMs)}
          </p>
        )}
      </div>

      {/* Stamp summary */}
      {summary.length > 0 && (
        <div className="mt-6 flex gap-4">
          {summary.map(([type, count]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="text-xl">{STAMP_EMOJI[type]}</span>
              <span className="text-sm font-medium text-secondary">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Upload status */}
      <div
        className={[
          "mt-6 rounded-xl px-4 py-3 text-sm",
          isDone
            ? "bg-surface text-secondary"
            : isError
            ? "border border-danger/30 bg-danger/10 text-danger"
            : "bg-surface text-secondary",
        ].join(" ")}
      >
        <div className="flex items-center gap-2">
          {status === "uploading" && (
            <span className="size-3 rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0" />
          )}
          {isDone && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 text-accent flex-shrink-0"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          <span>{statusLabel(status)}</span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="space-y-3 pb-12">
        <Button onClick={handleDone} fullWidth>
          Done
        </Button>
        <Button onClick={handleNextSong} variant="secondary" fullWidth>
          Record another song
        </Button>
        <button
          onClick={() => setDeleteConfirmOpen(true)}
          className="w-full py-3 text-sm text-danger underline underline-offset-4"
        >
          Delete this recording
        </button>
      </div>

      {/* Delete confirmation sheet */}
      <BottomSheet
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete recording?"
      >
        <div className="space-y-3">
          <p className="text-sm text-secondary">
            This will permanently delete the audio. This cannot be undone.
          </p>
          <Button onClick={handleDelete} variant="danger" fullWidth>
            Delete
          </Button>
          <Button
            onClick={() => setDeleteConfirmOpen(false)}
            variant="ghost"
            fullWidth
          >
            Cancel
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

export default function PostRecordPage() {
  return (
    <Suspense>
      <PostRecordScreen />
    </Suspense>
  );
}
