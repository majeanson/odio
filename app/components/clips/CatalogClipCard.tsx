"use client";

// Catalog clip card — used in the cross-session Catalog tab.
// Two visual modes driven by the `frozen` prop:
//
//   Final (frozen=true):  lock icon · clip name · session · duration · vote tally
//   Raw   (frozen=false): note icon · clip name · session · duration · version count
//
// Stage is shown only in the clip detail collaboration section, not in list views.
// No inline rename — that lives in the clip detail page.
// Click anywhere → navigate to clip detail.

import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/utils";
import { AudioBars } from "@/components/ui/AudioBars";
import type { CatalogClip } from "@/app/api/bands/[bandId]/catalog/route";

interface CatalogClipCardProps {
  clip: CatalogClip;
  bandId: string;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="size-4 text-muted shrink-0" aria-hidden>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function CatalogClipCard({ clip, bandId }: CatalogClipCardProps) {
  const router = useRouter();

  function handleClick() {
    router.push(`/bands/${bandId}/sessions/${clip.sessionId}/clips/${clip.id}`);
  }

  const totalVotes = clip.votes.KEEP + clip.votes.REVISE + clip.votes.PASS;
  const allKeep = totalVotes > 0 && clip.votes.KEEP === totalVotes;

  if (clip.frozen) {
    // ── Final card ──────────────────────────────────────────────────────────
    return (
      <div
        onClick={handleClick}
        className={`flex items-start gap-4 rounded-2xl px-5 py-4 cursor-pointer transition-colors active:opacity-75 ${
          allKeep
            ? "bg-success/8 border border-success/25"
            : "bg-surface"
        }`}
      >
        {/* Lock icon in accent box */}
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
          <LockIcon />
        </div>

        <div className="flex-1 min-w-0">
          {/* Clip name + version badge */}
          <div className="flex items-baseline gap-2 min-w-0">
            <p className="text-lg font-semibold text-primary truncate">{clip.name}</p>
            {clip.frozenVersionNumber != null && (
              <span className="text-xs font-bold text-muted shrink-0">
                v{clip.frozenVersionNumber}
              </span>
            )}
          </div>

          {/* Session + duration */}
          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-sm text-muted truncate">{clip.sessionName}</span>
            {clip.sourceDurationMs != null && (
              <>
                <span className="text-muted/40">·</span>
                <span className="font-mono text-sm text-muted">
                  {formatDuration(clip.sourceDurationMs)}
                </span>
              </>
            )}
          </div>

          {/* Vote tally + comment count */}
          <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
            {totalVotes === 0 ? (
              <span className="text-xs text-muted">No votes yet</span>
            ) : (
              <>
                {clip.votes.KEEP > 0 && (
                  <span className="text-xs font-semibold text-success">
                    ✓ {clip.votes.KEEP} Keep
                  </span>
                )}
                {clip.votes.REVISE > 0 && (
                  <span className="text-xs font-semibold text-orange-400">
                    ↺ {clip.votes.REVISE} Revise
                  </span>
                )}
                {clip.votes.PASS > 0 && (
                  <span className="text-xs font-semibold text-muted">
                    — {clip.votes.PASS} Pass
                  </span>
                )}
              </>
            )}
            {clip.commentCount > 0 && (
              <>
                <span className="text-muted/40">·</span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <CommentIcon />
                  {clip.commentCount}
                </span>
              </>
            )}
            {clip.publicToken && (
              <>
                <span className="text-muted/40">·</span>
                <span className="text-xs text-accent font-medium">Shared</span>
              </>
            )}
          </div>
        </div>

        <ChevronRight />
      </div>
    );
  }

  // ── Raw card ────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={handleClick}
      className="flex items-center gap-4 rounded-2xl bg-surface px-5 py-4 cursor-pointer transition-colors active:opacity-75"
    >
      {/* Music note icon */}
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted">
        <NoteIcon />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-primary truncate">{clip.name}</p>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className="text-sm text-muted truncate">{clip.sessionName}</span>
          {clip.sourceDurationMs != null && (
            <>
              <span className="text-muted/40">·</span>
              <span className="font-mono text-sm text-muted">
                {formatDuration(clip.sourceDurationMs)}
              </span>
            </>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          {clip.versionCount > 0 && (
            <span className="text-xs text-muted">{clip.versionCount}v</span>
          )}
          {clip.transcodeStatus === "PENDING" && (
            <AudioBars className="size-3.5 text-muted" />
          )}
        </div>
      </div>

      <ChevronRight />
    </div>
  );
}
