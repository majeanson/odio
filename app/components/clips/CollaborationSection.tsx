"use client";
// CollaborationSection — thin coordinator for voting, stage, and comments.
// Mounts the relevant hooks and delegates all rendering to focused sub-components.
// scope="vote-stage" → VotePanel + StageSelector
// scope="comments"   → CommentComposer + CommentThread
// scope="full"       → both sections (Team tab — post-edit collaboration view)

import { useVotes } from "@/hooks/useVotes";
import { useComments } from "@/hooks/useComments";
import { useStage } from "@/hooks/useStage";
import { VotePanel } from "./VotePanel";
import { StageSelector } from "./StageSelector";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";
import type { ClipVersion, Vote, Comment, ClipStage } from "@/types";

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
  initialStage: ClipStage;
  /** True when the current user can change the stage (canEdit && !frozen). */
  canEditStage?: boolean;
  scope: "vote-stage" | "comments" | "full";
}

export function CollaborationSection({
  clipId,
  memberCount,
  currentUserEmail,
  versions,
  initialVotes,
  initialComments,
  activeVersionId,
  initialStage,
  canEditStage = false,
  scope,
}: CollaborationSectionProps) {
  const { votes, castVote, isCasting, voteError } = useVotes(clipId, initialVotes);
  const { comments, addComment, isAdding, addError, editComment, isEditing, editError, deleteComment, deleteError } = useComments(clipId, initialComments);
  const commentError = addError || editError || deleteError;
  const { stage, changeStage } = useStage(clipId, initialStage);

  const voteVersion =
    (activeVersionId ? versions.find((v) => v.id === activeVersionId) : null) ??
    versions[versions.length - 1] ??
    null;

  const showVote = scope === "vote-stage" || scope === "full";
  const showComments = scope === "comments" || scope === "full";

  return (
    <div className="flex flex-col gap-6">
      {showVote && voteVersion && (
        <>
          <VotePanel
            version={voteVersion}
            votes={votes}
            currentUserEmail={currentUserEmail}
            memberCount={memberCount}
            isCasting={isCasting}
            onVote={castVote}
          />
          {voteError && (
            <p className="text-sm text-danger px-1">Vote failed — tap again to retry</p>
          )}
        </>
      )}

      {showVote && (
        <StageSelector
          stage={stage}
          canEdit={canEditStage}
          onChange={changeStage}
        />
      )}

      {scope === "full" && (
        <div className="h-px bg-white/10" />
      )}

      {showComments && (
        <section aria-label="Comments">
          <p className="mb-4 text-sm font-bold text-muted px-1">
            Comments {comments.length > 0 && `(${comments.length})`}
          </p>
          <CommentComposer onSubmit={addComment} isPending={isAdding} />
          {commentError && (
            <p className="text-sm text-danger px-1 mb-3">Action failed — please try again</p>
          )}
          <CommentThread
            comments={comments}
            currentUserEmail={currentUserEmail}
            isEditing={isEditing}
            onEdit={editComment}
            onDelete={deleteComment}
          />
        </section>
      )}
    </div>
  );
}
