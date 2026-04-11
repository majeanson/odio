"use client";

// Clip card — shows clip name (inline editable), duration, stage chip,
// version count badge, processing spinner, and frozen lock icon.
// Swipe-left or long-press reveals the delete action (confirmation sheet).

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn, formatDuration } from "@/lib/utils";
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
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerMoveRef = useRef(false);

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
    if (e.key === "Enter") {
      saveName(nameInput);
      setEditingName(false);
    }
    if (e.key === "Escape") {
      setNameInput(name);
      setEditingName(false);
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

  // Tap the card body → navigate to clip detail
  // Long-press → open delete sheet
  function handlePointerDown() {
    pointerMoveRef.current = false;
    longPressRef.current = setTimeout(() => setDeleteSheetOpen(true), 500);
  }
  function handlePointerMove() {
    pointerMoveRef.current = true;
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }
  function handlePointerUp() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }
  function handleCardClick() {
    if (!editingName && !pointerMoveRef.current) {
      router.push(`/bands/${bandId}/sessions/${clip.sessionId}/clips/${clip.id}`);
    }
  }

  return (
    <>
      <div
        className="flex items-start gap-3 rounded-xl bg-surface px-4 py-3 transition-colors active:bg-elevated cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
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
                if (longPressRef.current) clearTimeout(longPressRef.current);
                setNameInput(name);
                setEditingName(true);
              }}
            >
              {saving ? (
                <span className="opacity-60">{nameInput}</span>
              ) : (
                name
              )}
            </button>
          )}

          {/* Meta row: duration · stage */}
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

        {/* Right side — frozen lock only; delete via long-press */}
        {clip.frozen && (
          <div className="shrink-0 pt-0.5">
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
          </div>
        )}
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
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete clip"}
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
