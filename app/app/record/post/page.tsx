"use client";

// Post-record screen — shown immediately after recording stops.
// User can rename the clip, see duration + stamps, monitor upload progress,
// then go Done (→ session), Record Another (→ /record), or Delete.
//
// Upload starts automatically on mount. Stranded uploads are recovered
// by the root auth layout via the UploadBanner.

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { useUploadPipeline } from "@/hooks/useUploadPipeline";
import {
  getPendingUpload,
  deletePendingUpload,
} from "@/lib/pendingUploads";
import { formatDuration, generateClipName } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { AudioBars } from "@/components/ui/AudioBars";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { STAMP_EMOJI } from "@/types";
import type { PendingUpload, StampType } from "@/types";

function statusLabel(status: ReturnType<typeof useUploadPipeline>["status"]): string {
  switch (status) {
    case "idle":
    case "uploading":    return "Uploading…";
    case "done":         return "Saved";
    case "paused":       return "Upload paused — waiting for connection";
    case "token-error":  return "Drive connection needs renewal — ask band creator to re-authorize";
    case "session-error":return "Session expired — sign in again to resume";
  }
}

function stampSummary(stamps: Array<{ timestampMs: number; type: string }>): [StampType, number][] {
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const uploadStartedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const { status, resultSessionId, finalizeError, startUpload } = useUploadPipeline(sessionIdParam);

  // Local object URL for pre-upload playback — revoked on unmount
  const audioUrl = useMemo(
    () => (upload?.blob ? URL.createObjectURL(upload.blob) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upload?.tempId],
  );
  useEffect(() => { return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }; }, [audioUrl]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    playing ? audio.pause() : audio.play().catch(() => {});
  }

  // Load the pending upload from IndexedDB on mount
  useEffect(() => {
    if (!tempId) return;
    getPendingUpload(tempId).then((u) => {
      if (!u) { router.replace(`/bands/${bandId}`); return; }
      const name = u.clipName || generateClipName(1);
      setUpload({ ...u, clipName: name });
      setClipName(name);
      setNameInput(name);
    });
  }, [tempId, bandId, router]);

  // Start upload once we have the upload data (guard against double-fire)
  useEffect(() => {
    if (upload && status === "idle" && !uploadStartedRef.current) {
      uploadStartedRef.current = true;
      startUpload(upload, clipName);
    }
  }, [upload, status, clipName, startUpload]);

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
    router.refresh();
    router.replace(resultSessionId
      ? `/bands/${bandId}/sessions/${resultSessionId}`
      : `/bands/${bandId}`
    );
  }

  function handleNextSong() {
    router.replace(`/record?bandId=${bandId}${sessionIdParam ? `&sessionId=${sessionIdParam}` : ""}`);
  }

  const stamps = upload?.stamps ?? [];
  const summary = stampSummary(stamps);
  const isDone = status === "done";
  const isError = status === "paused" || status === "token-error" || status === "session-error";

  return (
    <div className="flex min-h-svh flex-col bg-base text-primary px-6 pt-safe md:max-w-lg md:mx-auto">
      {/* Header */}
      <div className="flex h-[72px] items-center">
        <button onClick={handleDone} className="flex items-center justify-center text-secondary hover:text-primary transition-colors" aria-label="Go to session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-8" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <h1 className="ml-4 font-display text-2xl font-bold">
          {isDone ? "Clip saved" : isError ? "Upload paused" : "Uploading…"}
        </h1>
      </div>

      {/* Clip name — tappable inline edit */}
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
                if (e.key === "Escape") { setNameInput(clipName); setEditingName(false); }
              }}
              maxLength={100}
              className="flex-1 rounded-2xl border border-accent bg-surface px-5 py-4 font-display text-3xl font-bold text-primary focus:outline-none"
            />
          </div>
        ) : (
          <button onClick={() => { setNameInput(clipName); setEditingName(true); }} className="flex items-start gap-3" aria-label="Rename clip">
            <span className="font-display text-4xl font-bold text-primary leading-tight">{clipName}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6 text-muted mt-2 shrink-0" aria-hidden>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
        {upload && (
          <p className="mt-3 font-mono text-2xl text-secondary">{formatDuration(upload.durationMs)}</p>
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
      <div className={[
        "mt-6 rounded-2xl px-4 py-3 text-sm",
        isError ? "border border-danger/30 bg-danger/10 text-danger" : "bg-surface text-secondary",
      ].join(" ")}>
        <div className="flex items-center gap-2">
          {status === "uploading" && <AudioBars className="size-3" />}
          {isDone && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-accent flex-shrink-0" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          <span>{statusLabel(status)}</span>
        </div>
        {finalizeError && <p className="mt-1 text-xs font-mono opacity-80">{finalizeError}</p>}
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <div className="space-y-4 pb-14">
        {audioUrl && (
          <>
            <audio ref={audioRef} src={audioUrl} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
            <Button onClick={togglePlay} variant="secondary" fullWidth size="lg">
              <span className="flex items-center justify-center gap-2">
                {playing ? (
                  <><svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>Pause playback</>
                ) : (
                  <><svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden><polygon points="5 3 19 12 5 21 5 3" /></svg>Play recording</>
                )}
              </span>
            </Button>
          </>
        )}
        <Button onClick={handleDone} fullWidth size="lg">Done</Button>
        {status === "uploading" && (
          <p className="text-center text-sm text-muted">Upload continues in the background</p>
        )}
        <Button onClick={handleNextSong} variant="secondary" fullWidth size="lg">Record another song</Button>
        <button onClick={() => setDeleteConfirmOpen(true)} className="w-full py-4 text-base text-danger underline underline-offset-4">
          Delete this recording
        </button>
      </div>

      <BottomSheet open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title="Delete recording?">
        <div className="space-y-3">
          <p className="text-sm text-secondary">This will permanently delete the audio. This cannot be undone.</p>
          <Button onClick={handleDelete} variant="danger" fullWidth>Delete</Button>
          <Button onClick={() => setDeleteConfirmOpen(false)} variant="ghost" fullWidth>Cancel</Button>
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
