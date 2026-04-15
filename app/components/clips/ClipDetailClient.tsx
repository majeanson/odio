"use client";
// ClipDetailClient — 2-tab coordinator: Edit | Team.
//
// Edit tab (default): actions first (edit/trim/split CTA), then version chain
// newest-to-oldest (v3 → v2 → v1 "Original"), then lifecycle actions (freeze/share/cleanup).
//
// Team tab: vote + comments in one view. Secondary priority — relevant once the
// clip is near-frozen or frozen, after the edit workflow is complete.
//
// WaveformPlayer is always visible above the tab bar so playback persists across tabs.
// selectedVersionId is lifted so the player, vote panel, and actions all stay in sync.

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { WaveformPlayer } from "./WaveformPlayer";
import { ClipActionsClient } from "./ClipActionsClient";
import { CollaborationSection } from "./CollaborationSection";
import { VersionCard } from "./VersionCard";
import type { ClipVersion, Stamp, Vote, Comment, ClipStage, BandRole } from "@/types";

type TabId = "edit" | "team";

interface ClipDetailClientProps {
  clipId: string;
  clipName: string;
  bandId: string;
  sessionId: string;
  sourceDurationMs: number;
  frozen: boolean;
  frozenVersionId: string | null;
  versions: ClipVersion[];
  stamps: Stamp[];
  canEdit: boolean;
  currentUserRole: BandRole;
  editHref: string;
  initialStage: ClipStage;
  transcodeStatus: "PENDING" | "DONE" | "FAILED";
  publicToken: string | null;
  driveFileId: string | null;
  memberCount: number;
  currentUserEmail: string;
  initialVotes: Vote[];
  initialComments: Comment[];
}

export function ClipDetailClient({
  clipId, clipName,
  bandId: _bandId, sessionId: _sessionId,
  sourceDurationMs, frozen, frozenVersionId, versions, stamps,
  canEdit, currentUserRole, editHref, initialStage,
  transcodeStatus, publicToken, driveFileId,
  memberCount, currentUserEmail, initialVotes, initialComments,
}: ClipDetailClientProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    () => versions.at(-1)?.id ?? null,
  );
  const [tab, setTab] = useState<TabId>("edit");

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;
  const activeCuts = Array.isArray(selectedVersion?.cutMarks)
    ? (selectedVersion!.cutMarks as Array<{ startMs: number; endMs: number }>)
    : [];

  // Newest first for display; original (v1) lands at the bottom.
  // VersionCard already labels v1 "Original recording" when no description is set.
  const versionsNewestFirst = [...versions].reverse();

  const sharedCollabProps = {
    clipId, memberCount, currentUserEmail, frozen, versions,
    initialVotes, initialComments,
    activeVersionId: selectedVersionId ?? undefined,
    initialStage,
    canEditStage: canEdit && !frozen,
  } as const;

  const TABS = [
    { id: "edit"  as const, label: "Edit" },
    { id: "team"  as const, label: "Team" },
  ] satisfies { id: TabId; label: string }[];

  return (
    <div className="flex flex-col md:max-w-3xl md:mx-auto">

      {/* Player — always visible, always playing */}
      <div className="px-4 pt-6 pb-2">
        <WaveformPlayer clipId={clipId} sourceDurationMs={sourceDurationMs} activeCuts={activeCuts} stamps={stamps} />
      </div>

      {/* Tab bar */}
      <div className="sticky z-20 flex bg-base border-b border-border" style={{ top: "calc(var(--upload-banner-h, 0px) + 72px)" }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 flex items-center justify-center border-b-2 transition-colors",
              "text-sm font-bold uppercase tracking-wide py-3",
              tab === id ? "text-primary border-accent" : "text-muted border-transparent",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Edit tab — actions first, then version chain newest→oldest, then lifecycle */}
      {tab === "edit" && (
        <div className="px-4 pt-6 pb-8 flex flex-col gap-3">

          {/* Primary action — Edit cuts (only when editable) */}
          {canEdit && !frozen && (
            <Link
              href={editHref}
              className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-5 hover:bg-elevated transition-colors"
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-accent/15 shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6 text-accent" aria-hidden>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-primary">Edit cuts</p>
                <p className="text-sm text-muted">Trim, cut, or split this clip</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5 text-muted shrink-0" aria-hidden>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          )}

          {/* Version chain — newest first, original at bottom */}
          {versions.length > 0 ? (
            versionsNewestFirst.map((v) => (
              <VersionCard
                key={v.id}
                version={v}
                isActive={v.id === selectedVersionId}
                sourceDurationMs={sourceDurationMs}
                onClick={() => setSelectedVersionId(v.id)}
              />
            ))
          ) : (
            <p className="text-sm text-muted px-1">Recording not yet processed.</p>
          )}

          {/* Lifecycle actions — freeze, share, cleanup */}
          {(canEdit || frozen) && (
            <ClipActionsClient
              clipId={clipId} clipName={clipName} frozen={frozen}
              transcodeStatus={transcodeStatus} publicToken={publicToken}
              canEdit={canEdit} currentUserRole={currentUserRole}
              versions={versions} frozenVersionId={frozenVersionId}
              driveFileId={driveFileId}
            />
          )}
        </div>
      )}

      {/* Team tab — vote + comments, post-edit collaboration */}
      {tab === "team" && (
        <div className="px-4 pt-6 pb-8 flex flex-col gap-4">
          {/* Version context — surfaces which version is being voted on */}
          {selectedVersion && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-0.5">Voting on</p>
                <p className="text-sm font-semibold text-primary">
                  v{selectedVersion.versionNumber}
                  {selectedVersion.description && (
                    <span className="font-normal text-secondary"> — {selectedVersion.description}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setTab("edit")}
                className="shrink-0 text-xs text-accent font-medium"
              >
                change
              </button>
            </div>
          )}
          <CollaborationSection {...sharedCollabProps} scope="full" />
        </div>
      )}
    </div>
  );
}
