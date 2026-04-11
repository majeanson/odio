"use client";

// Clip detail — 3-tab layout: Versions | Vote | Chat
//
// WaveformPlayer is always visible above the tab bar so playback is never
// interrupted while navigating between concerns.
//
// Versions  — pick a cut to listen to, edit, or freeze
// Vote      — decide together on the current version + song stage
// Chat      — comments thread
//
// selectedVersionId lifts version selection so the player always reflects
// the version the band is actively discussing or voting on.

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { WaveformPlayer } from "./WaveformPlayer";
import { ClipActionsClient } from "./ClipActionsClient";
import { CollaborationSection } from "./CollaborationSection";
import { formatDuration } from "@/lib/utils";
import type { ClipVersion, Stamp, Vote, Comment, ClipStage, BandRole } from "@/types";

type TabId = "versions" | "vote" | "chat";

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
  clipId,
  clipName,
  bandId: _bandId,
  sessionId: _sessionId,
  sourceDurationMs,
  frozen,
  frozenVersionId,
  versions,
  stamps,
  canEdit,
  currentUserRole,
  editHref,
  initialStage,
  transcodeStatus,
  publicToken,
  driveFileId,
  memberCount,
  currentUserEmail,
  initialVotes,
  initialComments,
}: ClipDetailClientProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    () => (versions.length > 0 ? versions[versions.length - 1].id : null),
  );
  const [tab, setTab] = useState<TabId>("versions");

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;
  const activeCuts =
    selectedVersion && Array.isArray(selectedVersion.cutMarks)
      ? (selectedVersion.cutMarks as Array<{ startMs: number; endMs: number }>)
      : [];

  const sharedCollabProps = {
    clipId,
    memberCount,
    currentUserEmail,
    frozen,
    versions,
    initialVotes,
    initialComments,
    activeVersionId: selectedVersionId ?? undefined,
    initialStage,
    canEditStage: canEdit && !frozen,
  } as const;

  return (
    <div className="flex flex-col md:max-w-3xl md:mx-auto">

      {/* ── Player — always visible, always playing ────────────────────── */}
      <div className="px-4 pt-6 pb-2">
        <WaveformPlayer
          clipId={clipId}
          sourceDurationMs={sourceDurationMs}
          activeCuts={activeCuts}
          stamps={stamps}
        />
      </div>

      {/* ── Tab bar — sticky below page header ────────────────────────── */}
      <div
        className="sticky z-20 flex bg-base border-b border-border"
        style={{ top: "calc(var(--upload-banner-h, 0px) + 72px)" }}
      >
        {(
          [
            { id: "versions" as const, label: "Versions" },
            { id: "vote"     as const, label: "Vote" },
            { id: "chat"     as const, label: "Chat", badge: initialComments.length || undefined },
          ] satisfies { id: TabId; label: string; badge?: number }[]
        ).map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 border-b-2 transition-colors",
              "text-xs font-bold uppercase tracking-widest py-3",
              tab === id
                ? "text-primary border-accent"
                : "text-muted border-transparent",
            )}
          >
            {label}
            {badge != null && (
              <span className={cn(
                "text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none",
                tab === id ? "bg-accent/20 text-accent" : "bg-elevated text-muted",
              )}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Versions tab ──────────────────────────────────────────────── */}
      {tab === "versions" && (
        <div className="px-4 pt-6 pb-8 flex flex-col gap-4">

          {/* Version cards */}
          {versions.length > 0 ? (
            <div className="flex flex-col gap-3">
              {versions.map((v) => {
                const isActive = v.id === selectedVersionId;
                const cuts = Array.isArray(v.cutMarks)
                  ? (v.cutMarks as Array<{ startMs: number; endMs: number }>)
                  : [];
                const dur =
                  v.resultDurationMs ?? (cuts.length === 0 ? sourceDurationMs : null);

                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersionId(v.id)}
                    className={cn(
                      "flex items-center gap-4 rounded-2xl px-5 py-5 text-left transition-colors",
                      isActive
                        ? "bg-accent/10 border border-accent/30"
                        : "bg-surface hover:bg-elevated",
                    )}
                  >
                    {/* Version badge */}
                    <span
                      className={cn(
                        "shrink-0 min-w-[3rem] text-center rounded-xl px-2 py-1.5 text-base font-bold tabular-nums",
                        isActive ? "bg-accent/25 text-accent" : "bg-elevated text-secondary",
                      )}
                    >
                      v{v.versionNumber}
                    </span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-lg font-semibold truncate",
                          isActive ? "text-primary" : v.description ? "text-secondary" : "text-muted",
                        )}
                      >
                        {v.description || (v.versionNumber === 1 ? "Original recording" : `Version ${v.versionNumber}`)}
                      </p>
                      <p className="mt-1 flex gap-3 text-sm text-muted">
                        {dur != null && <span className="font-mono">{formatDuration(dur)}</span>}
                        {cuts.length > 0 && (
                          <span>{cuts.length} cut{cuts.length !== 1 ? "s" : ""}</span>
                        )}
                      </p>
                    </div>

                    {isActive && (
                      <svg
                        viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                        className="size-5 text-accent shrink-0" aria-hidden
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted px-1">Recording not yet processed.</p>
          )}

          {/* Edit cuts */}
          {canEdit && !frozen && (
            <Link
              href={editHref}
              className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-5 hover:bg-elevated transition-colors"
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-accent/15 shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round" className="size-6 text-accent" aria-hidden>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-primary">Edit cuts</p>
                <p className="text-sm text-muted">Trim, cut, or split this clip</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" className="size-5 text-muted shrink-0" aria-hidden>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          )}

          {/* Freeze / Share / Cleanup */}
          {(canEdit || frozen) && (
            <ClipActionsClient
              clipId={clipId}
              clipName={clipName}
              frozen={frozen}
              transcodeStatus={transcodeStatus}
              publicToken={publicToken}
              canEdit={canEdit}
              currentUserRole={currentUserRole}
              versions={versions}
              frozenVersionId={frozenVersionId}
              driveFileId={driveFileId}
            />
          )}
        </div>
      )}

      {/* ── Vote tab ──────────────────────────────────────────────────── */}
      {tab === "vote" && (
        <div className="px-4 pt-6 pb-8">
          <CollaborationSection
            {...sharedCollabProps}
            scope="vote-stage"
          />
        </div>
      )}

      {/* ── Chat tab ──────────────────────────────────────────────────── */}
      {tab === "chat" && (
        <div className="px-4 pt-6 pb-8">
          <CollaborationSection
            {...sharedCollabProps}
            scope="comments"
          />
        </div>
      )}
    </div>
  );
}
