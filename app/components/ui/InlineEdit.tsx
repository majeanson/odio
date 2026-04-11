"use client";

// Inline editable text field.
// Tap text → becomes an input → blur/Enter saves → Escape discards.
// Used for session names and clip names throughout the app.

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

/**
 * Tap-to-edit text field. Renders as plain text until tapped/clicked.
 * Saves on Enter or blur; discards on Escape.
 */
export function InlineEdit({
  value,
  onSave,
  className,
  inputClassName,
  placeholder,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync if parent updates value (e.g. optimistic rollback)
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function startEdit() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    setEditing(false);
  }

  function discard() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") { e.preventDefault(); discard(); }
        }}
        className={cn(
          "rounded-lg border border-accent bg-surface px-2 py-0.5",
          "text-primary outline-none focus:ring-1 focus:ring-accent",
          inputClassName ?? className,
        )}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={startEdit}
      onKeyDown={(e) => e.key === "Enter" && startEdit()}
      className={cn("cursor-pointer", className)}
      title="Tap to rename"
    >
      {value || placeholder}
    </span>
  );
}
