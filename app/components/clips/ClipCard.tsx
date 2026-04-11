"use client";

// Clip card — shows clip name (inline editable), duration, stage chip,
// version count badge, processing spinner, and frozen lock icon.
// "···" button on the right opens the delete confirmation sheet (replaces
// the undiscoverable long-press pattern).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { STAGE_LABELS } from "@/types";
import type { Clip, ClipStage } from "@/types";

const STAGE_VARIANTS: Record<ClipStage, "default" | "accent" | "warning" | "success" | "danger"> = {
  IDEA: "default",
  SKETCH: "warning",
  DEVELOPING: "accent",
  DEMO_READY: "success",
};

interface ClipCardProps {
  clip: Clip;
  bandId: string;
  onDelete?: (clipId: string) => void;
}

export function ClipCard({ clip, bandId, onDelete }: ClipCardProps) {
  const router = useRouter();
  const [name, setName] = useState(clip.name);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(clip.name);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveName(newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clips/${clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) setName(trimmed);
    } finally {
      setSaving(false);
    }
  }

  function handleNameBlur() {
    saveName(nameInput);
    setEditingName(false);
  }

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { saveName(nameInput); setEditingName(false); }
    if (e.key === "Escape") { setNameInput(name); setEditingName(false); }
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
    if (!editingName) {
      router.push(`/bands/${bandId}/sessions/${clip.sessionId}/clips/${clip.id}`);
    }
  }

  return (
    <>
      <div
        className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 transition-colors active:bg-elevated cursor-pointer"
        onClick={handleCardClick}
      >
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Clip name */}
          {editingName ? (
            <input
              autoFocus
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              maxLength={100}
              className="w-full bg-transparent text-base font-medium text-primary focus:outline-none border-b border-accent pb-0.5"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              className="text-left text-base font-medium text-primary"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setNameInput(name);
                setEditingName(true);
              }}
            >
              {saving ? <span className="opacity-60">{nameInput}</span> : name}
            </button>
          )}

          {/* Meta row: duration · stage · version count */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {clip.sourceDurationMs != null && (
              <span className="font-mono text-xs text-muted">
                {formatDuration(clip.sourceDurationMs)}
              </span>
            )}
            <Badge variant={STAGE_VARIANTS[clip.stage]}>
              {STAGE_LABELS[clip.stage]}
            </Badge>
            {clip._count && clip._count.versions > 0 && (
              <span className="text-xs text-muted">
                {clip._count.versions} version{clip._count.versions !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Right side — state indicator + "···" menu button */}
        <div className="flex items-center gap-1 shrink-0">
          {clip.transcodeStatus === "PENDING" ? (
            <span
              className="size-4 rounded-full border-2 border-muted border-t-transparent animate-spin"
              aria-label="Processing"
            />
          ) : clip.frozen ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 text-accent"
              aria-label="Frozen"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : null}

          {/* "···" — opens delete sheet. Stops propagation so card doesn't navigate. */}
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteSheetOpen(true); }}
            aria-label="More actions"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-secondary hover:bg-elevated transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden>
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Delete confirmation sheet */}
      <BottomSheet
        open={deleteSheetOpen}
        onClose={() => setDeleteSheetOpen(false)}
        title={`Delete "${name}"?`}
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
