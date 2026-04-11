"use client";

// Clip action controls rendered below the waveform editor.
// Handles: stage selector, freeze flow (with version picker), unfreeze (recorder only),
//   post-freeze cleanup, and public share toggle.
// All mutations are optimistic with rollback on failure.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { STAGE_LABELS } from "@/types";
import type { ClipStage, ClipVersion, BandRole } from "@/types";

const STAGE_ORDER: ClipStage[] = ["IDEA", "SKETCH", "DEVELOPING", "DEMO_READY"];

const STAGE_DESCRIPTIONS: Record<ClipStage, string> = {
  IDEA: "Raw idea — keep recording",
  SKETCH: "Rough shape — needs work",
  DEVELOPING: "Coming together — keep refining",
  DEMO_READY: "Ready to share as a demo",
};

interface ClipActionsClientProps {
  clipId: string;
  initialStage: ClipStage;
  frozen: boolean;
  transcodeStatus: "PENDING" | "DONE" | "FAILED";
  publicToken: string | null;
  canEdit: boolean;
  currentUserRole: BandRole;
  versions: ClipVersion[];
  frozenVersionId: string | null;
  /** Source Drive file ID — present means raw audio still exists (cleanup available) */
  driveFileId: string | null;
}

export function ClipActionsClient({
  clipId,
  initialStage,
  frozen,
  transcodeStatus,
  publicToken: initialPublicToken,
  canEdit,
  currentUserRole,
  versions,
  frozenVersionId,
  driveFileId: initialDriveFileId,
}: ClipActionsClientProps) {
  const router = useRouter();
  const [stage, setStage] = useState<ClipStage>(initialStage);
  const [isFrozen, setIsFrozen] = useState(frozen);
  const [driveFileId, setDriveFileId] = useState(initialDriveFileId);
  const [stageSheetOpen, setStageSheetOpen] = useState(false);
  const [freezeSheetOpen, setFreezeSheetOpen] = useState(false);
  const [cleanupSheetOpen, setCleanupSheetOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    frozenVersionId ?? versions[versions.length - 1]?.id ?? "",
  );
  const [freezing, setFreezing] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);
  const [unfreezing, setUnfreezing] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(initialPublicToken);
  const [sharingLoading, setSharingLoading] = useState(false);

  const isRecorder = currentUserRole === "RECORDER";

  async function handleStageChange(newStage: ClipStage) {
    const prev = stage;
    setStage(newStage);
    setStageSheetOpen(false);

    const res = await fetch(`/api/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });

    if (!res.ok) {
      setStage(prev);
    }
  }

  async function handleFreeze() {
    setFreezing(true);
    setFreezeError(null);

    const res = await fetch(`/api/clips/${clipId}/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId: selectedVersionId }),
    });

    if (res.ok) {
      setFreezeSheetOpen(false);
      setIsFrozen(true);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setFreezeError(body.error ?? "Freeze failed — please try again");
      setFreezing(false);
    }
  }

  async function handleUnfreeze() {
    setUnfreezing(true);
    const res = await fetch(`/api/clips/${clipId}/unfreeze`, { method: "POST" });
    if (res.ok) {
      setIsFrozen(false);
      router.refresh();
    }
    setUnfreezing(false);
  }

  async function handleCleanup() {
    setCleaningUp(true);
    const res = await fetch(`/api/clips/${clipId}/cleanup`, { method: "POST" });
    if (res.ok) {
      setDriveFileId(null);
    }
    setCleanupSheetOpen(false);
    setCleaningUp(false);
  }

  async function togglePublicShare() {
    setSharingLoading(true);
    const body = publicToken
      ? { removePublicToken: true }
      : { generatePublicToken: true };

    const res = await fetch(`/api/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updated = await res.json();
      setPublicToken(updated.publicToken ?? null);
    }
    setSharingLoading(false);
  }

  const shareUrl = publicToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${publicToken}`
    : null;

  async function copyShareUrl() {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
  }

  const stageVariant: Record<ClipStage, "default" | "warning" | "accent" | "success"> = {
    IDEA: "default",
    SKETCH: "warning",
    DEVELOPING: "accent",
    DEMO_READY: "success",
  };

  return (
    <div className="space-y-3">
      {/* Stage + Freeze/Unfreeze row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Stage badge — tap to change when not frozen */}
        {canEdit && !isFrozen ? (
          <button
            onClick={() => setStageSheetOpen(true)}
            aria-label="Change stage"
            className="flex items-center gap-1.5"
          >
            <Badge variant={stageVariant[stage]}>
              {STAGE_LABELS[stage]}
            </Badge>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3 text-muted"
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        ) : (
          <Badge variant={stageVariant[stage]}>{STAGE_LABELS[stage]}</Badge>
        )}

        {/* Freeze button */}
        {canEdit && !isFrozen && versions.length > 0 && transcodeStatus !== "PENDING" && (
          <button
            onClick={() => setFreezeSheetOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/30 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Freeze
          </button>
        )}

        {/* Unfreeze — recorder only */}
        {isFrozen && isRecorder && (
          <button
            onClick={handleUnfreeze}
            disabled={unfreezing}
            className="flex items-center gap-1.5 rounded-full bg-elevated px-3 py-1 text-xs font-medium text-secondary hover:text-primary transition-colors disabled:opacity-50"
          >
            {unfreezing ? "Unfreezing…" : "Unfreeze"}
          </button>
        )}

        {/* Processing indicator */}
        {transcodeStatus === "PENDING" && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="size-3 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
            <span className="text-xs text-secondary">rendering…</span>
          </div>
        )}

        {/* Render failed */}
        {transcodeStatus === "FAILED" && (
          <span className="ml-auto text-xs text-danger">Render failed</span>
        )}
      </div>

      {/* Post-freeze cleanup */}
      {isFrozen && driveFileId && (
        <button
          onClick={() => setCleanupSheetOpen(true)}
          className="text-xs text-muted underline underline-offset-2 hover:text-secondary"
        >
          Clean up source audio
        </button>
      )}

      {/* Public share section — only after freeze */}
      {isFrozen && (
        <div className="rounded-xl bg-surface px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-primary">Public share link</p>
            {canEdit && (
              <button
                onClick={togglePublicShare}
                disabled={sharingLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  publicToken ? "bg-accent" : "bg-elevated"
                }`}
                role="switch"
                aria-checked={!!publicToken}
                aria-label="Toggle public sharing"
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    publicToken ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            )}
          </div>

          {publicToken ? (
            <div className="space-y-2">
              <p className="break-all font-mono text-xs text-secondary select-all">
                {shareUrl}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={copyShareUrl}
                  className="text-xs text-accent underline underline-offset-2"
                >
                  Copy link
                </button>
                <span className="text-xs text-muted">·</span>
                <a
                  href={shareUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent underline underline-offset-2"
                >
                  Preview
                </a>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">
              Enable to generate a public link anyone can use to listen to this clip.
            </p>
          )}
        </div>
      )}

      {/* Stage picker sheet */}
      <BottomSheet
        open={stageSheetOpen}
        onClose={() => setStageSheetOpen(false)}
        title="Change stage"
      >
        <div className="space-y-2">
          {STAGE_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => handleStageChange(s)}
              className={`w-full rounded-xl px-4 py-3 text-left transition-colors ${
                s === stage
                  ? "bg-accent/20 text-accent"
                  : "bg-surface text-primary hover:bg-elevated"
              }`}
            >
              <span className="text-sm font-medium">{STAGE_LABELS[s]}</span>
              <span className="block text-xs font-normal text-muted mt-0.5">
                {STAGE_DESCRIPTIONS[s]}
              </span>
            </button>
          ))}
          <Button onClick={() => setStageSheetOpen(false)} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </BottomSheet>

      {/* Freeze picker sheet */}
      <BottomSheet
        open={freezeSheetOpen}
        onClose={() => setFreezeSheetOpen(false)}
        title="Freeze clip"
      >
        <div className="space-y-3">
          <p className="text-sm text-secondary">
            Freeze renders a final audio file. Editing will be disabled. Choose which version to freeze:
          </p>

          <div className="space-y-2">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVersionId(v.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                  selectedVersionId === v.id
                    ? "bg-accent/20 text-accent"
                    : "bg-surface text-primary hover:bg-elevated"
                }`}
              >
                <span className="text-sm font-medium">v{v.versionNumber}</span>
                {v.description && (
                  <span className="flex-1 text-xs text-muted truncate">{v.description}</span>
                )}
                {v.resultDurationMs != null && (
                  <span className="font-mono text-xs text-muted ml-auto">
                    {Math.floor(v.resultDurationMs / 60000)}:
                    {String(Math.floor((v.resultDurationMs % 60000) / 1000)).padStart(2, "0")}
                  </span>
                )}
                {selectedVersionId === v.id && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {freezeError && <p className="text-sm text-danger">{freezeError}</p>}

          <Button onClick={handleFreeze} disabled={freezing || !selectedVersionId} fullWidth>
            {freezing ? "Freezing…" : "Freeze this version"}
          </Button>
          <Button onClick={() => setFreezeSheetOpen(false)} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </BottomSheet>

      {/* Cleanup confirmation sheet */}
      <BottomSheet
        open={cleanupSheetOpen}
        onClose={() => setCleanupSheetOpen(false)}
        title="Clean up source audio"
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-elevated px-4 py-3 space-y-1">
            <p className="text-sm font-medium text-primary">What will be deleted:</p>
            <p className="text-sm text-secondary">Raw source .aac file from Drive</p>
          </div>
          <div className="rounded-xl bg-elevated px-4 py-3 space-y-1">
            <p className="text-sm font-medium text-primary">What will remain:</p>
            <p className="text-sm text-secondary">Frozen render file — clip stays playable</p>
          </div>
          <p className="text-xs text-muted">This cannot be undone.</p>
          <Button
            onClick={handleCleanup}
            disabled={cleaningUp}
            variant="secondary"
            fullWidth
          >
            {cleaningUp ? "Deleting…" : "Delete source audio"}
          </Button>
          <Button onClick={() => setCleanupSheetOpen(false)} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
