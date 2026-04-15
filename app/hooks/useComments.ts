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

  const { mutate: addComment, isPending: isAdding } = useMutation({
    mutationFn: (text: string) =>
      fetch(`/api/clips/${clipId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json()),
    onSuccess: invalidate,
  });

  const { mutate: editComment, isPending: isEditing } = useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) =>
      fetch(`/api/clips/${clipId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json()),
    onSuccess: invalidate,
  });

  const { mutate: deleteComment } = useMutation({
    mutationFn: (commentId: string) =>
      fetch(`/api/clips/${clipId}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return { comments, addComment, isAdding, editComment, isEditing, deleteComment };
}
