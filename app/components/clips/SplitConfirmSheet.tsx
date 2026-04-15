"use client";
// SplitConfirmSheet — bottom sheet to confirm splitting a clip at a chosen point.
// Owns the splitting state and error display.
// Calls onConfirm() — caller does the fetch and throws on error.

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { formatPosition } from "@/lib/utils";

interface SplitConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  splitMs: number;
  /** Called to perform the split. Should throw an Error on failure. */
  onConfirm: () => Promise<void>;
}

export function SplitConfirmSheet({ open, onClose, splitMs, onConfirm }: SplitConfirmSheetProps) {
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSplitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Split failed");
      setSplitting(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Split clip">
      <div className="space-y-4">
        <div className="rounded-2xl bg-elevated px-5 py-4 space-y-1">
          <p className="text-sm text-secondary">
            Split at <span className="font-mono text-primary">{formatPosition(splitMs)}</span>
          </p>
          <p className="text-xs text-muted">Two new clips will be created from this recording.</p>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={handleConfirm} loading={splitting} fullWidth size="lg">
          Confirm split
        </Button>
        <Button onClick={onClose} variant="ghost" fullWidth>
          Cancel
        </Button>
      </div>
    </BottomSheet>
  );
}
