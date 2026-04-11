"use client";

// Collaboration section — two scopes, one component.
// scope="vote-stage" → Vote + Stage only (Vote tab)
// scope="comments"   → Comments only (Chat tab)
// All hooks run unconditionally; scope gates rendering only.
// Polling keeps both votes and comments fresh during a jam.

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { STAGE_LABELS } from "@/types";
import type { ClipVersion, Vote, Comment, VoteValue, ClipStage } from "@/types";

const STAGE_ORDER: ClipStage[] = ["IDEA", "SKETCH", "DEVELOPING", "DEMO_READY"];

const STAGE_DESCRIPTIONS: Record<ClipStage, string> = {
  IDEA: "Raw idea — keep recording",
  SKETCH: "Rough shape — needs work",
  DEVELOPING: "Coming together",
  DEMO_READY: "Ready to share as a demo",
};

// Colour dot for the current stage
const STAGE_DOT: Record<ClipStage, string> = {
  IDEA:       "bg-zinc-500",
  SKETCH:     "bg-orange-400",
  DEVELOPING: "bg-accent",
  DEMO_READY: "bg-success",
};

interface CollaborationSectionProps {
  clipId: string;
  memberCount: number;
  currentUserEmail: string;
  frozen?: boolean;
  versions: ClipVersion[];
  initialVotes: Vote[];
  initialComments: Comment[];
  /** Which version is currently selected in the player. Defaults to latest. */
  activeVersionId?: string;
  /** Current song development stage — shown and editable here, not in Actions. */
  initialStage: ClipStage;
  /** True when the current user can change the stage (canEdit && !frozen). */
  canEditStage?: boolean;
  /** Which section to render: vote+stage or comments only. */
  scope: "vote-stage" | "comments";
}

const VOTE_OPTIONS: { value: VoteValue; symbol: string; label: string; sub: string; color: string }[] = [
  { value: "KEEP",   symbol: "✓", label: "Keep",   sub: "Freeze it",       color: "bg-success/15 text-success border-success/30" },
  { value: "REVISE", symbol: "↺", label: "Revise", sub: "Needs work",       color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "PASS",   symbol: "—", label: "Pass",   sub: "No opinion",       color: "bg-surface text-secondary border-border" },
];

export function CollaborationSection({
  clipId,
  memberCount,
  currentUserEmail,
  frozen = false,
  versions,
  initialVotes,
  initialComments,
  activeVersionId,
  initialStage,
  canEditStage = false,
  scope,
}: CollaborationSectionProps) {
  const qc = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // ── Stage ─────────────────────────────────────────────────────────────────
  const [stage, setStage] = useState<ClipStage>(initialStage);
  const [stageSheetOpen, setStageSheetOpen] = useState(false);

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

  // ── Polled data ────────────────────────────────────────────────────────────

  const { data: votes = initialVotes } = useQuery<Vote[]>({
    queryKey: ["votes", clipId],
    queryFn: () => fetch(`/api/clips/${clipId}/votes`).then((r) => r.json()),
    initialData: initialVotes,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const { data: comments = initialComments } = useQuery<Comment[]>({
    queryKey: ["comments", clipId],
    queryFn: () => fetch(`/api/clips/${clipId}/comments`).then((r) => r.json()),
    initialData: initialComments,
    staleTime: 7_000,
    refetchInterval: 7_000,
  });

  // ── Vote target — active version or latest ────────────────────────────────

  const voteVersion =
    (activeVersionId ? versions.find((v) => v.id === activeVersionId) : null) ??
    versions[versions.length - 1] ??
    null;

  // ── All-voted-Keep banner ─────────────────────────────────────────────────

  const allVotedKeep = (() => {
    if (memberCount === 0 || !voteVersion) return false;
    const keeps = votes.filter((v) => v.versionId === voteVersion.id && v.value === "KEEP");
    return keeps.length >= memberCount;
  })();

  // ── Vote mutation ─────────────────────────────────────────────────────────

  const voteMutation = useMutation({
    mutationFn: ({ versionId, value }: { versionId: string; value: VoteValue }) =>
      fetch(`/api/clips/${clipId}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, value }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["votes", clipId] }),
  });

  const myVote = voteVersion
    ? votes.find((v) => v.userEmail === currentUserEmail && v.versionId === voteVersion.id)
    : null;

  const voteCountsForVersion = voteVersion
    ? {
        KEEP:   votes.filter((v) => v.versionId === voteVersion.id && v.value === "KEEP").length,
        REVISE: votes.filter((v) => v.versionId === voteVersion.id && v.value === "REVISE").length,
        PASS:   votes.filter((v) => v.versionId === voteVersion.id && v.value === "PASS").length,
      }
    : null;

  // ── Comment mutations ─────────────────────────────────────────────────────

  const addCommentMutation = useMutation({
    mutationFn: (text: string) =>
      fetch(`/api/clips/${clipId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["comments", clipId] }); setCommentText(""); },
  });

  const editCommentMutation = useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) =>
      fetch(`/api/clips/${clipId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["comments", clipId] }); setEditingCommentId(null); },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      fetch(`/api/clips/${clipId}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", clipId] }),
  });

  const submitComment = useCallback(() => {
    const text = commentText.trim();
    if (!text) return;
    addCommentMutation.mutate(text);
  }, [commentText, addCommentMutation]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* ── VOTE ─────────────────────────────────────── scope="vote-stage" ── */}
      {scope === "vote-stage" && voteVersion && (
        <section aria-label="Vote">
          <div className="flex items-baseline gap-2 mb-4 px-1">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">
              Vote
            </p>
            <span className="text-xs text-muted">
              on v{voteVersion.versionNumber}
              {voteVersion.description && ` · ${voteVersion.description}`}
            </span>
          </div>

          {/* All voted Keep banner */}
          {allVotedKeep && (
            <div className="mb-4 rounded-2xl bg-success/10 border border-success/30 px-5 py-4 flex items-center gap-3">
              <span className="text-success text-xl">✓</span>
              <p className="text-base font-semibold text-success">Everyone voted Keep — ready to freeze</p>
            </div>
          )}

          {/* Big vote buttons — symbol + label + sub + tally */}
          <div className="grid grid-cols-3 gap-3">
            {VOTE_OPTIONS.map(({ value, symbol, label, sub, color }) => {
              const isMyVote = myVote?.value === value;
              const count = voteCountsForVersion?.[value] ?? 0;
              return (
                <button
                  key={value}
                  onClick={() => voteVersion && voteMutation.mutate({ versionId: voteVersion.id, value })}
                  disabled={voteMutation.isPending}
                  className={`flex flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-7 transition-colors ${
                    isMyVote
                      ? color
                      : "bg-surface border-border text-muted hover:bg-elevated"
                  }`}
                >
                  <span className={`text-4xl leading-none ${isMyVote ? "" : "opacity-40"}`}>
                    {symbol}
                  </span>
                  <span className={`text-base font-bold ${isMyVote ? "" : "text-secondary"}`}>
                    {label}
                  </span>
                  <span className="text-xs text-muted leading-snug text-center">{sub}</span>
                  {count > 0 && (
                    <span className="text-sm font-semibold tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── STAGE ─────────────────────────────────────── scope="vote-stage" ── */}
      {scope === "vote-stage" && (
        <>
          <section aria-label="Song stage">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted px-1">
              Song stage
            </p>
            {canEditStage ? (
              <button
                onClick={() => setStageSheetOpen(true)}
                className="flex w-full items-center gap-4 rounded-2xl bg-surface px-5 py-5 hover:bg-elevated transition-colors text-left"
              >
                <span className={`size-3 rounded-full shrink-0 ${STAGE_DOT[stage]}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-lg font-semibold text-primary">{STAGE_LABELS[stage]}</span>
                  <span className="block text-sm text-muted mt-0.5">{STAGE_DESCRIPTIONS[stage]}</span>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5 text-muted shrink-0" aria-hidden>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <div className="flex items-start gap-4 rounded-2xl bg-surface px-5 py-5">
                <span className={`size-3 rounded-full shrink-0 mt-1 ${STAGE_DOT[stage]}`} />
                <div>
                  <span className="text-lg font-semibold text-primary">{STAGE_LABELS[stage]}</span>
                  <span className="block text-sm text-muted mt-0.5">{STAGE_DESCRIPTIONS[stage]}</span>
                </div>
              </div>
            )}
          </section>

          {/* Stage picker sheet */}
          <BottomSheet open={stageSheetOpen} onClose={() => setStageSheetOpen(false)} title="Song stage">
            <div className="space-y-2">
              {STAGE_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStageChange(s)}
                  className={`w-full flex items-center gap-4 rounded-2xl px-5 py-5 text-left transition-colors ${
                    s === stage ? "bg-accent/15 border border-accent/30" : "bg-surface hover:bg-elevated"
                  }`}
                >
                  <span className={`size-3 rounded-full shrink-0 ${STAGE_DOT[s]}`} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-lg font-semibold ${s === stage ? "text-accent" : "text-primary"}`}>
                      {STAGE_LABELS[s]}
                    </span>
                    <span className="block text-sm text-muted mt-0.5">{STAGE_DESCRIPTIONS[s]}</span>
                  </div>
                  {s === stage && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-5 text-accent shrink-0" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
              <Button onClick={() => setStageSheetOpen(false)} variant="ghost" fullWidth>Cancel</Button>
            </div>
          </BottomSheet>
        </>
      )}

      {/* ── COMMENTS ────────────────────────────────────── scope="comments" ── */}
      {scope === "comments" && (
        <section aria-label="Comments">
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-muted px-1">
            Comments {comments.length > 0 && `(${comments.length})`}
          </p>

          {/* Input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder="Add a comment…"
              maxLength={1000}
              className="flex-1 rounded-2xl border border-border bg-surface px-5 py-4 text-base text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <Button
              onClick={submitComment}
              disabled={!commentText.trim() || addCommentMutation.isPending}
              loading={addCommentMutation.isPending}
              size="md"
            >
              Post
            </Button>
          </div>

          {/* Comment list */}
          {comments.length === 0 ? (
            <p className="text-center text-sm text-muted py-6">
              No comments yet — be the first
            </p>
          ) : (
            <ul className="space-y-2">
              {comments.map((comment) => {
                const isOwn = comment.userEmail === currentUserEmail;
                return (
                  <li key={comment.id} className="rounded-2xl bg-surface px-5 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted mb-1.5">
                          {comment.userEmail.split("@")[0]}
                          <span className="mx-1.5 text-muted/40">·</span>
                          {formatRelativeTime(comment.createdAt)}
                          {comment.editedAt && <span className="ml-1 italic"> (edited)</span>}
                        </p>

                        {editingCommentId === comment.id ? (
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") editCommentMutation.mutate({ commentId: comment.id, text: editText.trim() });
                                if (e.key === "Escape") setEditingCommentId(null);
                              }}
                              className="flex-1 rounded-xl border border-accent bg-elevated px-3 py-2 text-sm text-primary focus:outline-none"
                            />
                            <button
                              onClick={() => editCommentMutation.mutate({ commentId: comment.id, text: editText.trim() })}
                              className="icon-sm text-sm text-accent font-medium px-1"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <p className="text-base text-primary">{comment.text}</p>
                        )}
                      </div>

                      {isOwn && editingCommentId !== comment.id && (
                        <div className="flex gap-1 shrink-0 mt-0.5">
                          <button
                            onClick={() => { setEditText(comment.text); setEditingCommentId(comment.id); }}
                            className="icon-sm p-1.5 text-muted hover:text-secondary"
                            aria-label="Edit"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteCommentMutation.mutate(comment.id)}
                            className="icon-sm p-1.5 text-muted hover:text-danger"
                            aria-label="Delete"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
