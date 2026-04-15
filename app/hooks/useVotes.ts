"use client";
// useVotes — TanStack Query subscription + vote mutation for a clip version.
// Single responsibility: keep votes fresh, expose castVote.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Vote, VoteValue } from "@/types";

export function useVotes(clipId: string, initialVotes: Vote[]) {
  const qc = useQueryClient();

  const { data: votes = initialVotes } = useQuery<Vote[]>({
    queryKey: ["votes", clipId],
    queryFn: () => fetch(`/api/clips/${clipId}/votes`).then((r) => r.json()),
    initialData: initialVotes,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const { mutate: castVote, isPending: isCasting } = useMutation({
    mutationFn: ({ versionId, value }: { versionId: string; value: VoteValue }) =>
      fetch(`/api/clips/${clipId}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, value }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["votes", clipId] }),
  });

  return { votes, castVote, isCasting };
}
