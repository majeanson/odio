"use client";
// SessionNotesSheet — bottom sheet for viewing and editing session notes.
// Owns the draft text and saving state.
// Calls onSave(trimmedNotes) — caller does the PATCH and updates its own notes state.

import { useState, useEffect } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";

interface SessionNotesSheetProps {
  open: boolean;
  onClose: () => void;
  currentNotes: string;
  canEdit: boolean;
  /** Called with trimmed notes text on save. */
  onSave: (notes: string) => Promise<void>;
}

export function SessionNotesSheet({
  open,
  onClose,
  currentNotes,
  canEdit,
  onSave,
}: SessionNotesSheetProps) {
  const [draft, setDraft] = useState(currentNotes);
  const [saving, setSaving] = useState(false);

  // Sync draft to the latest notes every time the sheet opens.
  useEffect(() => {
    if (open) setDraft(currentNotes);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    await onSave(draft.trim());
    setSaving(false);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Session notes">
      <div className="space-y-3">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What happened tonight? Key songs, gear, vibe…"
          maxLength={2000}
          rows={5}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-primary placeholder:text-muted focus:border-accent focus:outline-none resize-none"
        />
        {canEdit ? (
          <>
            <Button onClick={handleSave} disabled={saving} fullWidth>
              {saving ? "Saving…" : "Save notes"}
            </Button>
            <Button onClick={onClose} variant="ghost" fullWidth>
              Cancel
            </Button>
          </>
        ) : (
          <Button onClick={onClose} variant="ghost" fullWidth>
            Close
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
