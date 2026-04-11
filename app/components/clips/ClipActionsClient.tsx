"use client";

// Clip action rows — Stage, Freeze/Unfreeze, Share, Cleanup.
// Each action is a full-width tappable row with icon + label + current state.
// Large touch targets (py-4), easy to hit mid-jam with one hand.
// Rendered inside ClipDetailClient's "Actions" section.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { STAGE_LABELS } from "@/types";
import type { ClipStage, ClipVersion, BandRole } from "@/types";

const STAGE_ORDER: ClipStage[] = ["IDEA", "SKETCH", "DEVELOPING", "DEMO_READY"];

const STAGE_DESCRIPTIONS: Record<ClipStage, string> = {
  IDEA: "Raw idea — keep recording",
  SKETCH: "Rough shape — needs work",
  DEVELOPING: "Coming together",
  DEMO_READY: "Ready to share as a demo",
};

// Accent colour per stage (for the left icon bg)
const STAGE_COLOR: Record<ClipStage, string> = {
  IDEA:       "bg-zinc-700 text-zinc-300",
  SKETCH:     "bg-orange-500/20 text-orange-400",
  DEVELOPING: "bg-accent/20 text-accent",
  DEMO_READY: "bg-success/20 text-success",
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
  const [publicToken, setPublicToken] = useState<string | null>(initialPublicToken);

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
  const [sharingLoading, setSharingLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isRecorder = currentUserRole === "RECORDER";

  // ── Stage ─────────────────────────────────────────────────────────────────

  async function handleStageChange(newStage: ClipStage) {
    const prev = stage;
    setStage(newStage);
    setStageSheetOpen(false);
    const res = await fetch(`/api/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
    if (!res.ok) setStage(prev);
  }

  // ── Freeze ────────────────────────────────────────────────────────────────

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
    if (res.ok) { setIsFrozen(false); router.refresh(); }
    setUnfreezing(false);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  async function handleCleanup() {
    setCleaningUp(true);
    const res = await fetch(`/api/clips/${clipId}/cleanup`, { method: "POST" });
    if (res.ok) setDriveFileId(null);
    setCleanupSheetOpen(false);
    setCleaningUp(false);
  }

  // ── Share ─────────────────────────────────────────────────────────────────

  async function toggleShare() {
    setSharingLoading(true);
    const body = publicToken ? { removePublicToken: true } : { generatePublicToken: true };
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

  async function copyLink() {
    const shareUrl = `${window.location.origin}/share/${publicToken}`;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function ActionRow({
    icon,
    label,
    sub,
    onClick,
    right,
    highlight,
  }: {
    icon: React.ReactNode;
    label: string;
    sub?: string;
    onClick?: () => void;
    right?: React.ReactNode;
    highlight?: boolean;
  }) {
    const classes = `flex items-center gap-4 rounded-2xl px-5 py-5 transition-colors w-full text-left ${
      highlight
        ? "bg-accent/10 border border-accent/30 hover:bg-accent/15"
        : "bg-surface hover:bg-elevated"
    }`;
    return onClick ? (
      <button onClick={onClick} className={classes}>
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-primary">{label}</p>
          {sub && <p className="text-sm text-muted mt-0.5">{sub}</p>}
        </div>
        {right ?? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-muted shrink-0" aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </button>
    ) : (
      <div className={classes}>
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-primary">{label}</p>
          {sub && <p className="text-sm text-muted mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
    );
  }

  const iconBox = (color: string, node: React.ReactNode) => (
    <div className={`flex size-12 items-center justify-center rounded-xl shrink-0 ${color}`}>
      {node}
    </div>
  );

  return (
    <>
      {/* Stage */}
      {canEdit && !isFrozen && (
        <ActionRow
          onClick={() => setStageSheetOpen(true)}
          icon={iconBox(STAGE_COLOR[stage],
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
              <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          )}
          label="Stage"
          sub={STAGE_DESCRIPTIONS[stage]}
          right={
            <span className="shrink-0 text-sm font-medium text-muted capitalize">
              {STAGE_LABELS[stage]}
            </span>
          }
        />
      )}

      {/* Freeze */}
      {canEdit && !isFrozen && versions.length > 0 && transcodeStatus !== "PENDING" && (
        <ActionRow
          onClick={() => setFreezeSheetOpen(true)}
          highlight
          icon={iconBox("bg-accent/15 text-accent",
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          )}
          label="Freeze"
          sub="Lock editing and render the final file"
        />
      )}

      {/* Frozen status + unfreeze */}
      {isFrozen && (
        <ActionRow
          onClick={isRecorder ? handleUnfreeze : undefined}
          icon={iconBox("bg-success/15 text-success",
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          )}
          label="Frozen"
          sub={isRecorder ? "Tap to unfreeze and re-edit" : "Final render locked"}
          right={
            unfreezing
              ? <span className="size-4 rounded-full border-2 border-muted border-t-transparent animate-spin shrink-0" />
              : isRecorder
                ? <span className="shrink-0 text-sm text-muted">Unfreeze</span>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-success shrink-0" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
          }
        />
      )}

      {/* Share link */}
      {isFrozen && (
        <ActionRow
          onClick={publicToken ? copyLink : toggleShare}
          icon={iconBox("bg-elevated text-secondary",
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          )}
          label={publicToken ? (linkCopied ? "Copied!" : "Copy share link") : "Enable public share"}
          sub={publicToken ? `${window?.location?.origin ?? ""}/share/${publicToken}`.substring(0, 40) + "…" : "Generate a public link for anyone to listen"}
          right={
            sharingLoading
              ? <span className="size-4 rounded-full border-2 border-muted border-t-transparent animate-spin shrink-0" />
              : publicToken
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-muted shrink-0" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-muted shrink-0" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
          }
        />
      )}

      {/* Post-freeze cleanup */}
      {isFrozen && driveFileId && (
        <ActionRow
          onClick={() => setCleanupSheetOpen(true)}
          icon={iconBox("bg-elevated text-muted",
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          )}
          label="Clean up source audio"
          sub="Delete the raw recording from Drive to save space"
        />
      )}

      {/* Processing */}
      {transcodeStatus === "PENDING" && (
        <div className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-4">
          {iconBox("bg-elevated text-secondary",
            <span className="size-5 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
          )}
          <div>
            <p className="text-base font-medium text-primary">Processing…</p>
            <p className="text-xs text-muted">Audio is being prepared</p>
          </div>
        </div>
      )}

      {/* ── Stage picker sheet ── */}
      <BottomSheet open={stageSheetOpen} onClose={() => setStageSheetOpen(false)} title="Change stage">
        <div className="space-y-2">
          {STAGE_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => handleStageChange(s)}
              className={`w-full rounded-2xl px-5 py-5 text-left transition-colors ${
                s === stage ? "bg-accent/20 text-accent" : "bg-surface text-primary hover:bg-elevated"
              }`}
            >
              <span className="text-lg font-semibold">{STAGE_LABELS[s]}</span>
              <span className="block text-sm text-muted mt-1">{STAGE_DESCRIPTIONS[s]}</span>
            </button>
          ))}
          <Button onClick={() => setStageSheetOpen(false)} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </BottomSheet>

      {/* ── Freeze picker sheet ── */}
      <BottomSheet open={freezeSheetOpen} onClose={() => setFreezeSheetOpen(false)} title="Freeze clip">
        <div className="space-y-3">
          <p className="text-sm text-secondary">Choose which version to lock as the final render:</p>
          <div className="space-y-2">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVersionId(v.id)}
                className={`w-full flex items-center gap-3 rounded-2xl px-5 py-4 text-left transition-colors ${
                  selectedVersionId === v.id ? "bg-accent/20 text-accent" : "bg-surface text-primary hover:bg-elevated"
                }`}
              >
                <span className="text-base font-semibold w-8">v{v.versionNumber}</span>
                {v.description && (
                  <span className="flex-1 text-sm text-muted truncate">{v.description}</span>
                )}
                {v.resultDurationMs != null && (
                  <span className="font-mono text-sm text-muted ml-auto">
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
          <Button onClick={handleFreeze} disabled={freezing || !selectedVersionId} fullWidth size="lg">
            {freezing ? "Freezing…" : "Freeze this version"}
          </Button>
          <Button onClick={() => setFreezeSheetOpen(false)} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </BottomSheet>

      {/* ── Cleanup sheet ── */}
      <BottomSheet open={cleanupSheetOpen} onClose={() => setCleanupSheetOpen(false)} title="Clean up source audio">
        <div className="space-y-3">
          <div className="rounded-2xl bg-elevated px-5 py-4 space-y-1">
            <p className="text-sm font-medium text-primary">Will be deleted</p>
            <p className="text-sm text-secondary">Raw source .aac from Drive</p>
          </div>
          <div className="rounded-2xl bg-elevated px-5 py-4 space-y-1">
            <p className="text-sm font-medium text-primary">Will remain</p>
            <p className="text-sm text-secondary">Frozen render — clip stays playable</p>
          </div>
          <p className="text-xs text-muted">This cannot be undone.</p>
          <Button onClick={handleCleanup} disabled={cleaningUp} variant="danger" fullWidth size="lg">
            {cleaningUp ? "Deleting…" : "Delete source audio"}
          </Button>
          <Button onClick={() => setCleanupSheetOpen(false)} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </BottomSheet>
    </>
  );
}
