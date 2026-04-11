"use client";

// Collaboration section — votes, comments.
// Polls for updates using TanStack Query refetchInterval (replaces usePolling).
// Shows an "All voted Keep" banner when every band member has voted KEEP
// on the same version.

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatRelativeTime } from "@/lib/utils";
import type { ClipVersion, Vote, Comment, VoteValue } from "@/types";

interface CollaborationSectionProps {
  clipId: string;
  /** Total number of band members — used for the All Voted Keep threshold */
  memberCount: number;
  currentUserEmail: string;
  /** After freeze, default to comments tab; during versioning, default to versions */
  frozen?: boolean;
  versions: ClipVersion[];
  initialVotes: Vote[];
  initialComments: Comment[];
}

const VOTE_LABELS: Record<VoteValue, string> = {
  KEEP: "Keep ✓",
  REVISE: "Revise ↺",
  PASS: "Pass —",
};


export function CollaborationSection({
  clipId,
  memberCount,
  currentUserEmail,
  frozen = false,
  versions: initialVersions,
  initialVotes,
  initialComments,
}: CollaborationSectionProps) {
  const qc = useQueryClient();

  // After freeze, default to comments; during active versioning, default to versions
  const [activeTab, setActiveTab] = useState<"versions" | "comments">(
    frozen ? "comments" : "versions",
  );
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [voteSheetOpen, setVoteSheetOpen] = useState(false);
  const [selectedVersionForVote, setSelectedVersionForVote] = useState<string | null>(null);

  // ─── Polled queries ─────────────────────────────────────────────────────────

  const { data: versions = initialVersions } = useQuery<ClipVersion[]>({
    queryKey: ["versions", clipId],
    queryFn: () => fetch(`/api/clips/${clipId}/versions`).then((r) => r.json()),
    initialData: initialVersions,
    staleTime: 8_000,
    refetchInterval: 8_000,
  });

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

  // ─── All Voted Keep banner ───────────────────────────────────────────────────
  // Fires when every band member has voted KEEP on the same version.

  const allVotedKeep = (() => {
    if (memberCount === 0) return false;
    for (const version of versions) {
      const keepVoters = votes.filter(
        (v) => v.versionId === version.id && v.value === "KEEP",
      );
      if (keepVoters.length >= memberCount) return true;
    }
    return false;
  })();

  // ─── Votes ─────────────────────────────────────────────────────────────────

  const voteMutation = useMutation({
    mutationFn: ({ versionId, value }: { versionId: string; value: VoteValue }) =>
      fetch(`/api/clips/${clipId}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, value }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["votes", clipId] }),
  });

  function openVoteSheet(versionId: string) {
    setSelectedVersionForVote(versionId);
    setVoteSheetOpen(true);
  }

  function submitVote(value: VoteValue) {
    if (!selectedVersionForVote) return;
    voteMutation.mutate({ versionId: selectedVersionForVote, value });
    setVoteSheetOpen(false);
  }

  function getVotesForVersion(versionId: string) {
    return votes.filter((v) => v.versionId === versionId);
  }

  const myVote = votes.find((v) => v.userEmail === currentUserEmail);

  // ─── Comments ──────────────────────────────────────────────────────────────

  const addCommentMutation = useMutation({
    mutationFn: (text: string) =>
      fetch(`/api/clips/${clipId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", clipId] });
      setCommentText("");
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) =>
      fetch(`/api/clips/${clipId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", clipId] });
      setEditingCommentId(null);
    },
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

  return (
    <div className="space-y-4">
      {/* All-voted-Keep banner */}
      {allVotedKeep && (
        <div className="rounded-xl bg-success/10 border border-success/30 px-4 py-3 flex items-center gap-2">
          <span className="text-success text-base">✓</span>
          <p className="text-sm text-success font-medium">
            Everyone voted Keep — ready to freeze
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex rounded-xl bg-surface overflow-hidden">
        <button
          onClick={() => setActiveTab("versions")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "versions"
              ? "bg-elevated text-primary"
              : "text-muted hover:text-secondary"
          }`}
        >
          Versions
          {versions.length > 0 && (
            <span className="ml-1.5 rounded-full bg-border px-1.5 py-0.5 text-xs">
              {versions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("comments")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "comments"
              ? "bg-elevated text-primary"
              : "text-muted hover:text-secondary"
          }`}
        >
          Comments
          {comments.length > 0 && (
            <span className="ml-1.5 rounded-full bg-border px-1.5 py-0.5 text-xs">
              {comments.length}
            </span>
          )}
        </button>
      </div>

      {/* Versions tab */}
      {activeTab === "versions" && (
        <div className="space-y-3">
          {versions.length === 0 ? (
            <p className="text-center text-sm text-muted py-6">No versions yet</p>
          ) : (
            versions.map((version) => {
              const versionVotes = getVotesForVersion(version.id);
              const keepCount = versionVotes.filter((v) => v.value === "KEEP").length;
              const reviseCount = versionVotes.filter((v) => v.value === "REVISE").length;
              const passCount = versionVotes.filter((v) => v.value === "PASS").length;
              const myVersionVote = myVote?.versionId === version.id ? myVote : null;
              const cutMarks = Array.isArray(version.cutMarks)
                ? (version.cutMarks as Array<{ startMs: number; endMs: number }>)
                : [];

              return (
                <div key={version.id} className="rounded-xl bg-surface px-4 py-3 space-y-2">
                  {/* Version header */}
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">v{version.versionNumber}</Badge>
                      {version.resultDurationMs != null && (
                        <span className="font-mono text-xs text-muted">
                          {Math.floor(version.resultDurationMs / 60000)}:
                          {String(Math.floor((version.resultDurationMs % 60000) / 1000)).padStart(2, "0")}
                        </span>
                      )}
                      {cutMarks.length > 0 && (
                        <span className="text-xs text-muted">
                          {cutMarks.length} cut{cutMarks.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted">
                      {formatRelativeTime(version.createdAt)}
                    </span>
                  </div>

                  {version.description && (
                    <p className="text-sm text-secondary">{version.description}</p>
                  )}

                  {/* Vote tally + vote button */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {keepCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <span>✓</span> {keepCount}
                      </span>
                    )}
                    {reviseCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-orange-400">
                        <span>↺</span> {reviseCount}
                      </span>
                    )}
                    {passCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <span>—</span> {passCount}
                      </span>
                    )}
                    <button
                      onClick={() => openVoteSheet(version.id)}
                      className={`ml-auto rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        myVersionVote
                          ? "bg-elevated text-secondary"
                          : "bg-accent/20 text-accent hover:bg-accent/30"
                      }`}
                    >
                      {myVersionVote ? VOTE_LABELS[myVersionVote.value] : "Vote"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Comments tab */}
      {activeTab === "comments" && (
        <div className="space-y-3">
          {/* Comment list */}
          {comments.length === 0 ? (
            <p className="text-center text-sm text-muted py-4">
              No comments yet — be the first
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => {
                const isOwn = comment.userEmail === currentUserEmail;

                return (
                  <li key={comment.id} className="rounded-xl bg-surface px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted mb-1">
                          {comment.userEmail}{" "}
                          <span>·</span>{" "}
                          {formatRelativeTime(comment.createdAt)}
                          {comment.editedAt && (
                            <span className="ml-1 italic">(edited)</span>
                          )}
                        </p>

                        {editingCommentId === comment.id ? (
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  editCommentMutation.mutate({ commentId: comment.id, text: editText.trim() });
                                if (e.key === "Escape") setEditingCommentId(null);
                              }}
                              className="flex-1 rounded-lg border border-accent bg-elevated px-3 py-1.5 text-sm text-primary focus:outline-none"
                            />
                            <button
                              onClick={() =>
                                editCommentMutation.mutate({ commentId: comment.id, text: editText.trim() })
                              }
                              className="text-xs text-accent"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-primary">{comment.text}</p>
                        )}
                      </div>

                      {isOwn && editingCommentId !== comment.id && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setEditText(comment.text);
                              setEditingCommentId(comment.id);
                            }}
                            className="p-1 text-muted hover:text-secondary"
                            aria-label="Edit comment"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteCommentMutation.mutate(comment.id)}
                            className="p-1 text-muted hover:text-danger"
                            aria-label="Delete comment"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
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

          {/* New comment input */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder="Add a comment…"
              maxLength={1000}
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <Button
              onClick={submitComment}
              disabled={!commentText.trim() || addCommentMutation.isPending}
              size="sm"
              loading={addCommentMutation.isPending}
            >
              Post
            </Button>
          </div>
        </div>
      )}

      {/* Vote sheet */}
      <BottomSheet
        open={voteSheetOpen}
        onClose={() => setVoteSheetOpen(false)}
        title="Cast your vote"
      >
        <div className="space-y-2">
          {(["KEEP", "REVISE", "PASS"] as VoteValue[]).map((value) => (
            <button
              key={value}
              onClick={() => submitVote(value)}
              className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${
                myVote?.versionId === selectedVersionForVote && myVote?.value === value
                  ? "bg-accent/20 text-accent"
                  : "bg-surface text-primary hover:bg-elevated"
              }`}
            >
              {VOTE_LABELS[value]}
              <span className="block text-xs font-normal text-muted mt-0.5">
                {value === "KEEP" && "This is the right cut — ready to freeze"}
                {value === "REVISE" && "Something needs more work"}
                {value === "PASS" && "No strong opinion"}
              </span>
            </button>
          ))}
          <Button onClick={() => setVoteSheetOpen(false)} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
