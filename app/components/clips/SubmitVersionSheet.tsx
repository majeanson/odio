"use client";
// SubmitVersionSheet — bottom sheet for submitting a new clip version.
// Owns the description input, submitting state, and error display.
// Calls onSubmit(description) — caller does the fetch and throws on error.

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { formatDurationDiff } from "@/lib/utils";

interface SubmitVersionSheetProps {
  open: boolean;
  onClose: () => void;
  cutCount: number;
  effectiveDurationMs: number;
  cutMarks: Array<{ startMs: number; endMs: number }>;
  /** Called with the description text. Should throw an Error on failure. */
  onSubmit: (description: string) => Promise<void>;
}

export function SubmitVersionSheet({
  open,
  onClose,
  cutCount,
  effectiveDurationMs,
  cutMarks,
  onSubmit,
}: SubmitVersionSheetProps) {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(description);
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSubmitting(false);
    }
  }

  function handleClose() {
    setDescription("");
    setError(null);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title="Submit edit">
      <div className="space-y-4">
        <div className="rounded-2xl bg-elevated px-5 py-4">
          <p className="text-base text-secondary">
            {cutCount} cut{cutCount !== 1 ? "s" : ""} ·{" "}
            <span className="font-mono">
              {formatDurationDiff(effectiveDurationMs, cutMarks)}
            </span>
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted" htmlFor="version-desc">
            Description (optional)
          </label>
          <input
            id="version-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="e.g. cut intro, tighten ending"
            className="w-full rounded-xl bg-elevated px-4 py-3 text-sm text-primary placeholder:text-muted/50 outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={handleSubmit} loading={submitting} fullWidth size="lg">
          Save version
        </Button>
      </div>
    </BottomSheet>
  );
}
