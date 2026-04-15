"use client";

// Clip card — shows clip name (inline editable), duration,
// version count badge, processing spinner, and frozen lock icon.
// Stage is shown only in the clip detail collaboration section, not here.
// "···" button on the right opens the delete confirmation sheet (replaces
// the undiscoverable long-press pattern).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClipRename } from "@/hooks/useClipRename";
import { formatDuration } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { AudioBars } from "@/components/ui/AudioBars";
import type { Clip } from "@/types";

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
        className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-4 transition-colors active:bg-elevated cursor-pointer h-full"
        onClick={handleCardClick}
      >
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Clip name — tap to rename inline */}
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
            <button
              className="text-left font-display text-lg font-semibold text-primary"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); rename.startEditing(); }}
            >
              {rename.saving ? <span className="opacity-60">{rename.nameInput}</span> : rename.name}
            </button>
          )}

          {/* Meta row: time · duration · version count */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">
              {new Date(clip.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
            {(clip.latestResultDurationMs ?? clip.sourceDurationMs) != null && (
              <span className="font-mono text-sm text-muted">
                {formatDuration((clip.latestResultDurationMs ?? clip.sourceDurationMs)!)}
              </span>
            )}
            {clip._count && clip._count.versions > 0 && (
              <span className="text-sm text-muted">
                {clip._count.versions}v
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
          <p className="text-sm text-secondary">
            This will permanently delete the clip and all its versions from
            Drive. This cannot be undone.
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
