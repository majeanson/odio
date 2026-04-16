"use client";

// Clip card — shows clip name (inline editable with a shuffle button for a new
// death-metal name), stage chip, duration, version count badge, processing
// spinner, and frozen lock icon.
// "···" button on the right opens the delete confirmation sheet (replaces
// the undiscoverable long-press pattern).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClipRename } from "@/hooks/useClipRename";
import { formatDuration } from "@/lib/utils";
import { generateDeathMetalName } from "@/lib/clipNames";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { AudioBars } from "@/components/ui/AudioBars";
import { DriveActionWarning } from "@/components/ui/DriveActionWarning";
import type { Clip, ClipStage } from "@/types";

const STAGE_CHIP: Record<ClipStage, { label: string; className: string }> = {
  IDEA:       { label: "idea",       className: "bg-white/10 text-muted" },
  SKETCH:     { label: "sketch",     className: "bg-blue-500/15 text-blue-400" },
  DEVELOPING: { label: "developing", className: "bg-amber-500/15 text-amber-400" },
  DEMO_READY: { label: "demo-ready", className: "bg-green-500/15 text-green-400" },
};

interface ClipCardProps {
  clip: Clip;
  bandId: string;
  canDelete?: boolean;
  onDelete?: (clipId: string) => void;
}

export function ClipCard({ clip, bandId, canDelete = false, onDelete }: ClipCardProps) {
  const router = useRouter();
  const rename = useClipRename(clip.id, clip.name);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shuffling, setShuffling] = useState(false);

  async function handleShuffle(e: React.MouseEvent) {
    e.stopPropagation();
    if (shuffling) return;
    const newName = generateDeathMetalName();
    setShuffling(true);
    try {
      const res = await fetch(`/api/clips/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) router.refresh();
    } finally {
      setShuffling(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clips/${clip.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteSheetOpen(false);
        onDelete?.(clip.id);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleCardClick() {
    if (!rename.editingName) {
      router.push(`/bands/${bandId}/sessions/${clip.sessionId}/clips/${clip.id}`);
    }
  }

  return (
    <>
      <div
        className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-5 transition-colors active:bg-elevated cursor-pointer h-full"
        onClick={handleCardClick}
      >
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Clip name — tap to rename inline; shuffle button randomises the name */}
          {rename.editingName ? (
            <input
              autoFocus
              type="text"
              value={rename.nameInput}
              onChange={(e) => rename.setNameInput(e.target.value)}
              onBlur={rename.confirmEdit}
              onKeyDown={rename.handleKeyDown}
              maxLength={100}
              className="w-full bg-transparent font-display text-lg font-semibold text-primary focus:outline-none border-b border-accent pb-0.5"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-2">
              <button
                className="text-left font-display text-lg font-semibold text-primary"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); rename.startEditing(); }}
              >
                {rename.saving || shuffling
                  ? <span className="opacity-60">{rename.nameInput}</span>
                  : rename.name}
              </button>
              {/* Shuffle button — randomise the clip name */}
              {!clip.frozen && (
                <button
                  onClick={handleShuffle}
                  disabled={shuffling}
                  aria-label="Randomise name"
                  className="flex size-6 items-center justify-center rounded-full text-muted hover:text-secondary hover:bg-elevated transition-colors disabled:opacity-40 shrink-0"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Meta row: time · duration · version count · stage chip */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-base text-muted">
              {new Date(clip.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
            {(clip.latestResultDurationMs ?? clip.sourceDurationMs) != null && (
              <span className="font-mono text-base text-muted">
                {formatDuration((clip.latestResultDurationMs ?? clip.sourceDurationMs)!)}
              </span>
            )}
            {clip._count && clip._count.versions > 0 && (
              <span className="text-base text-muted">
                {clip._count.versions}v
              </span>
            )}
            {!clip.frozen && clip.stage && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STAGE_CHIP[clip.stage].className}`}>
                {STAGE_CHIP[clip.stage].label}
              </span>
            )}
          </div>
        </div>

        {/* Right side — state indicator + "···" menu button */}
        <div className="flex items-center gap-2 shrink-0">
          {clip.transcodeStatus === "PENDING" ? (
            <AudioBars className="size-5 text-muted" />
          ) : clip.frozen ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5 text-accent"
              aria-label="Frozen"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : null}

          {/* "···" — only shown to users who can delete (RECORDER role). */}
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteSheetOpen(true); }}
              aria-label="More actions"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:text-secondary hover:bg-elevated transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
                <circle cx="5" cy="12" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="19" cy="12" r="1.5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation sheet */}
      <BottomSheet
        open={deleteSheetOpen}
        onClose={() => setDeleteSheetOpen(false)}
        title={`Delete "${rename.name}"?`}
      >
        <div className="space-y-3">
          <DriveActionWarning message="The clip, all its versions, and its audio files will be permanently deleted from your Google Drive. This cannot be undone." />
          <p className="text-sm text-secondary">
            This also removes all Odio metadata: versions, stamps, votes, and comments.
          </p>
          <Button
            onClick={handleDelete}
            variant="danger"
            fullWidth
            size="lg"
            disabled={deleting}
            loading={deleting}
          >
            Delete clip
          </Button>
          <Button
            onClick={() => setDeleteSheetOpen(false)}
            variant="ghost"
            fullWidth
          >
            Cancel
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
