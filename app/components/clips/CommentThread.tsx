"use client";
// CommentThread — comment list with inline edit and delete.
// Single responsibility: render and inline-edit the comment list.
// Editing state (which row is open) lives here; async edit/delete are prop callbacks.

import { useState } from "react";
import { formatRelativeTime } from "@/lib/utils";
import type { Comment } from "@/types";

interface CommentThreadProps {
  comments: Comment[];
  currentUserEmail: string;
  isEditing: boolean;
  onEdit: (args: { commentId: string; text: string }) => void;
  onDelete: (commentId: string) => void;
}

export function CommentThread({ comments, currentUserEmail, isEditing, onEdit, onDelete }: CommentThreadProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  function startEdit(comment: Comment) {
    setEditText(comment.text);
    setEditingId(comment.id);
  }

  function commitEdit(commentId: string) {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setEditingId(null);
    onEdit({ commentId, text: trimmed });
  }

  if (comments.length === 0) {
    return <p className="text-center text-sm text-muted py-6">No comments yet — be the first</p>;
  }

  return (
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

                {editingId === comment.id ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(comment.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 rounded-xl border border-accent bg-elevated px-3 py-2 text-sm text-primary focus:outline-none"
                    />
                    <button
                      onClick={() => commitEdit(comment.id)}
                      disabled={isEditing}
                      className="icon-sm text-sm text-accent font-medium px-1"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <p className="text-base text-primary">{comment.text}</p>
                )}
              </div>

              {isOwn && editingId !== comment.id && (
                <div className="flex gap-1 shrink-0 mt-0.5">
                  <button
                    onClick={() => startEdit(comment)}
                    className="icon-sm p-1.5 text-muted hover:text-secondary"
                    aria-label="Edit"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(comment.id)}
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
  );
}
