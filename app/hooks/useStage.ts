"use client";
// useStage — optimistic local stage state + PATCH with rollback on failure.
// Single responsibility: manage clip stage with instant UI response.

import { useState } from "react";
import type { ClipStage } from "@/types";

export function useStage(clipId: string, initial: ClipStage) {
  const [stage, setStage] = useState<ClipStage>(initial);

  async function changeStage(next: ClipStage) {
    const prev = stage;
    setStage(next);
    const res = await fetch(`/api/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: next }),
    });
    if (!res.ok) setStage(prev);
  }

  return { stage, changeStage };
}
