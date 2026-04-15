"use client";
// useComments — TanStack Query subscription + CRUD mutations for comments.
// Single responsibility: keep comments fresh, expose add/edit/delete.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Comment } from "@/types";

export function useComments(clipId: string, initialComments: Comment[]) {
  const qc = useQueryClient();

  const { data: comments = initialComments } = useQuery<Comment[]>({
    queryKey: ["comments", clipId],
    queryFn: () => fetch(`/api/clips/${clipId}/comments`).then((r) => r.json()),
    initialData: initialComments,
    staleTime: 7_000,
    refetchInterval: 7_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["comments", clipId] });

  const { mutate: addComment, isPending: isAdding, isError: addError } = useMutation({
    mutationFn: async (text: string) => {
      const r = await fetch(`/api/clips/${clipId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error("Failed to post comment");
      return r.json();
    },
    onSuccess: invalidate,
    onError: invalidate,
  });

  const { mutate: editComment, isPending: isEditing, isError: editError } = useMutation({
    mutationFn: async ({ commentId, text }: { commentId: string; text: string }) => {
      const r = await fetch(`/api/clips/${clipId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error("Failed to save edit");
      return r.json();
    },
    onSuccess: invalidate,
    onError: invalidate,
  });

  const { mutate: deleteComment, isError: deleteError } = useMutation({
    mutationFn: async (commentId: string) => {
      const r = await fetch(`/api/clips/${clipId}/comments/${commentId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete comment");
    },
    onSuccess: invalidate,
    onError: invalidate,
  });

  return { comments, addComment, isAdding, addError, editComment, isEditing, editError, deleteComment, deleteError };
}
