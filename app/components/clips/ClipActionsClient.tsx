"use client";
// ClipActionsClient — Freeze/Unfreeze, Share, and Cleanup action rows.
// Thin coordinator: state + async mutations here, UI delegated to ActionRow, FreezeSheet, CleanupSheet.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AudioBars } from "@/components/ui/AudioBars";
import { ActionRow } from "./ActionRow";
import { FreezeSheet } from "./FreezeSheet";
import { CleanupSheet } from "./CleanupSheet";
import type { ClipVersion, BandRole } from "@/types";

interface ClipActionsClientProps {
  clipId: string;
  clipName: string;
  frozen: boolean;
  transcodeStatus: "PENDING" | "DONE" | "FAILED";
  publicToken: string | null;
  canEdit: boolean;
  currentUserRole: BandRole;
  versions: ClipVersion[];
  frozenVersionId: string | null;
  driveFileId: string | null;
}

function iconBox(color: string, node: React.ReactNode) {
  return (
    <div className={`flex size-12 items-center justify-center rounded-xl shrink-0 ${color}`}>
      {node}
    </div>
  );
}

export function ClipActionsClient({
  clipId,
  clipName,
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
  const [isFrozen, setIsFrozen] = useState(frozen);
  const [driveFileId, setDriveFileId] = useState(initialDriveFileId);
  const [publicToken, setPublicToken] = useState<string | null>(initialPublicToken);

  const [freezeSheetOpen, setFreezeSheetOpen] = useState(false);
  const [cleanupSheetOpen, setCleanupSheetOpen] = useState(false);

  const [unfreezing, setUnfreezing] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isRecorder = currentUserRole === "RECORDER";

  // ── Freeze ────────────────────────────────────────────────────────────────

  async function handleFreeze(versionId: string, finalName: string) {
    const res = await fetch(`/api/clips/${clipId}/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId, finalName }),
    });
    if (res.ok) {
      setFreezeSheetOpen(false);
      setIsFrozen(true);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Freeze failed — please try again");
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

  // ── Icons (inline SVGs kept here to avoid a file per icon) ───────────────

  const lockIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );

  const shareIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );

  const trashIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );

  const copyIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-muted shrink-0" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );

  const checkIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-success shrink-0" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Freeze */}
      {canEdit && !isFrozen && versions.length > 0 && transcodeStatus !== "PENDING" && (
        <ActionRow
          onClick={() => setFreezeSheetOpen(true)}
          highlight
          icon={iconBox("bg-accent/15 text-accent", lockIcon)}
          label="Freeze"
          sub="Lock editing and render the final file"
        />
      )}

      {/* Frozen status + unfreeze */}
      {isFrozen && (
        <ActionRow
          onClick={isRecorder ? handleUnfreeze : undefined}
          icon={iconBox("bg-success/15 text-success", lockIcon)}
          label="Frozen"
          sub={isRecorder ? "Tap to unfreeze and re-edit" : "Final render locked"}
          right={
            unfreezing
              ? <AudioBars className="size-4 text-muted" />
              : isRecorder
                ? <span className="shrink-0 text-sm text-muted">Unfreeze</span>
                : checkIcon
          }
        />
      )}

      {/* Share link */}
      {isFrozen && (
        <ActionRow
          onClick={publicToken ? copyLink : toggleShare}
          icon={iconBox("bg-elevated text-secondary", shareIcon)}
          label={publicToken ? (linkCopied ? "Copied!" : "Copy share link") : "Enable public share"}
          sub={
            publicToken
              ? `${window?.location?.origin ?? ""}/share/${publicToken}`.substring(0, 40) + "…"
              : "Generate a public link for anyone to listen"
          }
          right={
            sharingLoading
              ? <AudioBars className="size-4 text-muted" />
              : publicToken ? copyIcon : undefined
          }
        />
      )}

      {/* Post-freeze cleanup */}
      {isFrozen && driveFileId && (
        <ActionRow
          onClick={() => setCleanupSheetOpen(true)}
          icon={iconBox("bg-elevated text-muted", trashIcon)}
          label="Clean up source audio"
          sub="Delete the raw recording from Drive to save space"
        />
      )}

      {/* Processing */}
      {transcodeStatus === "PENDING" && (
        <div className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-4">
          {iconBox("bg-elevated text-secondary", <AudioBars className="size-5 text-secondary" />)}
          <div>
            <p className="text-base font-medium text-primary">Processing…</p>
            <p className="text-xs text-muted">Audio is being prepared</p>
          </div>
        </div>
      )}

      <FreezeSheet
        open={freezeSheetOpen}
        onClose={() => setFreezeSheetOpen(false)}
        clipName={clipName}
        versions={versions}
        initialVersionId={frozenVersionId ?? versions[versions.length - 1]?.id ?? ""}
        onFreeze={handleFreeze}
      />

      <CleanupSheet
        open={cleanupSheetOpen}
        onClose={() => setCleanupSheetOpen(false)}
        isDeleting={cleaningUp}
        onConfirm={handleCleanup}
      />
    </>
  );
}
