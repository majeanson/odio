"use client";

// Post-record screen — shown immediately after recording stops.
// User can rename the clip, see duration + stamps, monitor upload progress,
// then go Done (→ session), Record Another (→ /record), or Delete.
//
// Upload is started automatically on mount. This screen is the primary
// upload initiator; stranded uploads are recovered by the root auth layout.

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import {
  getPendingUpload,
  updatePendingUpload,
  deletePendingUpload,
} from "@/lib/pendingUploads";
import { usePendingUploadsStore } from "@/store/pendingUploadsStore";
import { formatDuration, generateClipName } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { AudioBars } from "@/components/ui/AudioBars";
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
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [resultSessionId, setResultSessionId] = useState<string | null>(
    sessionIdParam ?? null,
  );

  const uploadStartedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // Create a local object URL for playback from the in-memory blob.
  // Revoke on unmount to avoid memory leaks.
  const audioUrl = useMemo(
    () => (upload?.blob ? URL.createObjectURL(upload.blob) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upload?.tempId], // re-create only if the recording changes
  );
  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }

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
          usePendingUploadsStore.getState().refresh();
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
          usePendingUploadsStore.getState().refresh();
          return;
        }

        const { uploadSessionUrl, driveFileId } = await initRes.json();
        await updatePendingUpload(u.tempId, {
          uploadSessionUrl,
          driveFileId,
          byteOffset: 0,
        });

        // Step 2: Upload blob directly to Drive.
        // driveFileId is pre-allocated server-side — we never read the Drive
        // response body, which is blocked by CORS (no Origin on the session URL).
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
          usePendingUploadsStore.getState().refresh();
          uploadStartedRef.current = false;
          return;
        }

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
          // Sync the Zustand store so the UploadBanner in AuthShell dismisses
          // immediately. Without this, the store still holds the "uploading"
          // entry in memory (it only reads IndexedDB on mount) and the banner
          // spins forever until the next full page refresh.
          usePendingUploadsStore.getState().refresh();
          setStatus("done");
        } else {
          const errBody = await finalRes.json().catch(() => ({}));
          console.error("[finalize] failed", finalRes.status, errBody);
          setFinalizeError(`${finalRes.status}: ${errBody?.error ?? "unknown"}`);
          setStatus("paused");
          await updatePendingUpload(u.tempId, { status: "paused" });
          usePendingUploadsStore.getState().refresh();
          uploadStartedRef.current = false;
        }
      } catch (err) {
        // Network error — leave in IndexedDB for root layout recovery
        console.error("[doUpload] caught", err);
        setStatus("paused");
        await updatePendingUpload(u.tempId, { status: "paused" }).catch(() => {});
        usePendingUploadsStore.getState().refresh();
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
    <div className="flex min-h-svh flex-col bg-base text-primary px-6 pt-safe md:max-w-lg md:mx-auto">
      {/* Header */}
      <div className="flex h-[72px] items-center">
        <button
          onClick={handleDone}
          className="flex items-center justify-center text-secondary hover:text-primary transition-colors"
          aria-label="Go to session"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-8"
            aria-hidden
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <h1 className="ml-4 font-display text-2xl font-bold">
          {isDone ? "Clip saved" : isError ? "Upload paused" : "Uploading…"}
        </h1>
      </div>

      {/* Clip name */}
      <div className="mt-10">
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
              className="flex-1 rounded-2xl border border-accent bg-surface px-5 py-4 font-display text-3xl font-bold text-primary focus:outline-none"
            />
          </div>
        ) : (
          <button
            onClick={() => {
              setNameInput(clipName);
              setEditingName(true);
            }}
            className="flex items-start gap-3"
            aria-label="Rename clip"
          >
            <span className="font-display text-4xl font-bold text-primary leading-tight">{clipName}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6 text-muted mt-2 shrink-0"
              aria-hidden
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}

        {/* Duration */}
        {upload && (
          <p className="mt-3 font-mono text-2xl text-secondary">
            {formatDuration(upload.durationMs)}
          </p>
        )}
      </div>

      {/* Stamp summary */}
      {summary.length > 0 && (
        <div className="mt-8 flex gap-5">
          {summary.map(([type, count]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="text-2xl">{STAMP_EMOJI[type]}</span>
              <span className="text-base font-semibold text-secondary">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Upload status */}
      <div
        className={[
          "mt-6 rounded-2xl px-4 py-3 text-sm",
          isDone
            ? "bg-surface text-secondary"
            : isError
            ? "border border-danger/30 bg-danger/10 text-danger"
            : "bg-surface text-secondary",
        ].join(" ")}
      >
        <div className="flex items-center gap-2">
          {status === "uploading" && (
            <AudioBars className="size-3" />
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
        {finalizeError && (
          <p className="mt-1 text-xs font-mono opacity-80">{finalizeError}</p>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="space-y-4 pb-14">
        {/* Hidden audio element + play/pause button */}
        {audioUrl && (
          <>
            <audio
              ref={audioRef}
              src={audioUrl}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
            <Button onClick={togglePlay} variant="secondary" fullWidth size="lg">
              <span className="flex items-center justify-center gap-2">
                {playing ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                    Pause playback
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Play recording
                  </>
                )}
              </span>
            </Button>
          </>
        )}
        <Button onClick={handleDone} fullWidth size="lg">
          Done
        </Button>
        {status === "uploading" && (
          <p className="text-center text-sm text-muted">Upload continues in the background</p>
        )}
        <Button onClick={handleNextSong} variant="secondary" fullWidth size="lg">
          Record another song
        </Button>
        <button
          onClick={() => setDeleteConfirmOpen(true)}
          className="w-full py-4 text-base text-danger underline underline-offset-4"
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
