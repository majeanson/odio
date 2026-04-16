"use client";
// CleanupSheet — confirm BottomSheet for post-freeze source audio deletion.
// Single responsibility: cleanup confirmation UI.

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { DriveActionWarning } from "@/components/ui/DriveActionWarning";

interface CleanupSheetProps {
  open: boolean;
  onClose: () => void;
  isDeleting: boolean;
  onConfirm: () => void;
}

export function CleanupSheet({ open, onClose, isDeleting, onConfirm }: CleanupSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Clean up source audio">
      <div className="space-y-3">
        <DriveActionWarning message="The raw source file will be permanently deleted from your Google Drive. The frozen render stays." />
        <div className="rounded-2xl bg-elevated px-5 py-4 space-y-1">
          <p className="text-sm font-medium text-primary">Will be deleted</p>
          <p className="text-sm text-secondary">Raw source .aac from Drive</p>
        </div>
        <div className="rounded-2xl bg-elevated px-5 py-4 space-y-1">
          <p className="text-sm font-medium text-primary">Will remain</p>
          <p className="text-sm text-secondary">Frozen render — clip stays playable</p>
        </div>
        <p className="text-xs text-muted">This cannot be undone.</p>
        <Button onClick={onConfirm} disabled={isDeleting} variant="danger" fullWidth size="lg">
          {isDeleting ? "Deleting…" : "Delete source audio"}
        </Button>
        <Button onClick={onClose} variant="ghost" fullWidth>Cancel</Button>
      </div>
    </BottomSheet>
  );
}
