"use client";

// Clip detail page coordinator — single concern: Listen & Decide.
//
// Owns selectedVersionId state so that:
//   - WaveformPlayer knows which cuts to skip
//   - VersionPills can highlight the active version
//   - CollaborationSection knows which version to cast a vote on
//
// Keeps all client state in one place; children receive only what they need.

import { useState } from "react";
import Link from "next/link";
import { WaveformPlayer } from "./WaveformPlayer";
import { ClipActionsClient } from "./ClipActionsClient";
import { CollaborationSection } from "./CollaborationSection";
import { formatDuration } from "@/lib/utils";
import type { ClipVersion, Stamp, Vote, Comment, ClipStage, BandRole } from "@/types";

interface ClipDetailClientProps {
  clipId: string;
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
  // Auto-select latest version on mount
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    () => (versions.length > 0 ? versions[versions.length - 1].id : null),
  );

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;
  const activeCuts =
    selectedVersion && Array.isArray(selectedVersion.cutMarks)
      ? (selectedVersion.cutMarks as Array<{ startMs: number; endMs: number }>)
      : [];

  return (
    <div className="flex flex-col gap-6 px-4 py-6">

      {/* ── 1. PLAYER ─────────────────────────────────────────────────────── */}
      <WaveformPlayer
        clipId={clipId}
        sourceDurationMs={sourceDurationMs}
        activeCuts={activeCuts}
        stamps={stamps}
      />

      {/* ── 2. VERSIONS ───────────────────────────────────────────────────── */}
      {versions.length > 0 && (
        <section aria-label="Versions">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted px-1">
            Versions
          </p>
          <div className="flex flex-col gap-2">
            {versions.map((v) => {
              const isActive = v.id === selectedVersionId;
              const cuts = Array.isArray(v.cutMarks)
                ? (v.cutMarks as Array<{ startMs: number; endMs: number }>)
                : [];
              const dur = v.resultDurationMs ?? (cuts.length === 0 ? sourceDurationMs : null);

              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersionId(isActive ? null : v.id)}
                  className={`flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition-colors ${
                    isActive
                      ? "bg-blue-500/15 border border-blue-500/30"
                      : "bg-surface hover:bg-elevated"
                  }`}
                >
                  {/* Version badge */}
                  <span
                    className={`shrink-0 min-w-[2.5rem] text-center rounded-xl px-2 py-1 text-sm font-bold tabular-nums ${
                      isActive ? "bg-blue-500/30 text-blue-300" : "bg-elevated text-secondary"
                    }`}
                  >
                    v{v.versionNumber}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    {v.description ? (
                      <p className={`text-base font-medium truncate ${isActive ? "text-primary" : "text-secondary"}`}>
                        {v.description}
                      </p>
                    ) : (
                      <p className={`text-base font-medium ${isActive ? "text-primary" : "text-muted"}`}>
                        {v.versionNumber === 1 ? "Original" : `Version ${v.versionNumber}`}
                      </p>
                    )}
                    <p className="mt-0.5 flex gap-2 text-xs text-muted">
                      {dur != null && (
                        <span className="font-mono">{formatDuration(dur)}</span>
                      )}
                      {cuts.length > 0 && (
                        <span>{cuts.length} cut{cuts.length !== 1 ? "s" : ""}</span>
                      )}
                    </p>
                  </div>

                  {/* Active indicator */}
                  {isActive && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-blue-400 shrink-0" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 3. ACTIONS ────────────────────────────────────────────────────── */}
      <section aria-label="Actions">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted px-1">
          Actions
        </p>
        <div className="flex flex-col gap-2">
          {/* Edit cuts — links to full-screen editor */}
          {canEdit && !frozen && (
            <Link
              href={editHref}
              className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-4 hover:bg-elevated transition-colors"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15 shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5 text-accent" aria-hidden>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-primary">Edit cuts</p>
                <p className="text-xs text-muted">Trim, cut, or split this clip</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-muted shrink-0" aria-hidden>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          )}

          {/* Stage / Freeze / Share / Cleanup */}
          <ClipActionsClient
            clipId={clipId}
            initialStage={initialStage}
            frozen={frozen}
            transcodeStatus={transcodeStatus}
            publicToken={publicToken}
            canEdit={canEdit}
            currentUserRole={currentUserRole}
            versions={versions}
            frozenVersionId={frozenVersionId}
            driveFileId={driveFileId}
          />
        </div>
      </section>

      {/* ── 4. VOTE + COMMENTS ────────────────────────────────────────────── */}
      <CollaborationSection
        clipId={clipId}
        memberCount={memberCount}
        currentUserEmail={currentUserEmail}
        frozen={frozen}
        versions={versions}
        initialVotes={initialVotes}
        initialComments={initialComments}
        activeVersionId={selectedVersionId ?? undefined}
      />
    </div>
  );
}
