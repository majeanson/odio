"use client";
// CommentComposer — single-line text input + Post button.
// Single responsibility: compose and submit a new comment.
// Clears optimistically on submit; parent mutation handles the async result.

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface CommentComposerProps {
  onSubmit: (text: string) => void;
  isPending: boolean;
}

export function CommentComposer({ onSubmit, isPending }: CommentComposerProps) {
  const [text, setText] = useState("");

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    onSubmit(trimmed);
  }

  return (
    <div className="flex gap-2 mb-4">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="Add a comment…"
        maxLength={1000}
        className="flex-1 rounded-2xl border border-border bg-surface px-5 py-4 text-base text-primary placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <Button
        onClick={handleSubmit}
        disabled={!text.trim() || isPending}
        loading={isPending}
        size="md"
      >
        Post
      </Button>
    </div>
  );
}
