"use client";
// FreezeSheet — BottomSheet for selecting version + final name, then submitting freeze.
// Single responsibility: freeze confirmation UI with local form state.

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { ClipVersion } from "@/types";

interface FreezeSheetProps {
  open: boolean;
  onClose: () => void;
  clipName: string;
  versions: ClipVersion[];
  initialVersionId: string;
  /** Resolves on success, rejects with an Error message on failure. */
  onFreeze: (versionId: string, finalName: string) => Promise<void>;
}

export function FreezeSheet({ open, onClose, clipName, versions, initialVersionId, onFreeze }: FreezeSheetProps) {
  const [selectedVersionId, setSelectedVersionId] = useState(initialVersionId);
  const [finalName, setFinalName] = useState(clipName);
  const [freezing, setFreezing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFreeze() {
    setFreezing(true);
    setError(null);
    try {
      await onFreeze(selectedVersionId, finalName.trim() || clipName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Freeze failed — please try again");
      setFreezing(false);
    }
  }

  const safeName = (finalName.trim() || clipName).replace(/[/\\?:*"<>|]/g, "-").trim();

  return (
    <BottomSheet open={open} onClose={onClose} title="Freeze clip">
      <div className="space-y-4">

        {/* Final file name */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">Final file name</label>
          <input
            type="text"
            value={finalName}
            onChange={(e) => setFinalName(e.target.value)}
            placeholder={clipName}
            maxLength={100}
            className="w-full rounded-2xl border border-border bg-surface px-5 py-4 text-base text-primary placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <p className="text-xs text-muted">
            Saved to Drive as <span className="font-mono">{safeName}.aac</span>
          </p>
        </div>

        {/* Version picker */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Version to lock</p>
          <div className="space-y-2">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVersionId(v.id)}
                className={`w-full flex items-center gap-3 rounded-2xl px-5 py-4 text-left transition-colors ${
                  selectedVersionId === v.id ? "bg-accent/20 text-accent" : "bg-surface text-primary hover:bg-elevated"
                }`}
              >
                <span className="text-base font-semibold w-8">v{v.versionNumber}</span>
                {v.description && (
                  <span className="flex-1 text-sm text-muted truncate">{v.description}</span>
                )}
                {v.resultDurationMs != null && (
                  <span className="font-mono text-sm text-muted ml-auto">
                    {Math.floor(v.resultDurationMs / 60000)}:
                    {String(Math.floor((v.resultDurationMs % 60000) / 1000)).padStart(2, "0")}
                  </span>
                )}
                {selectedVersionId === v.id && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={handleFreeze} disabled={freezing || !selectedVersionId} fullWidth size="lg">
          {freezing ? "Freezing…" : "Freeze this version"}
        </Button>
        <Button onClick={onClose} variant="ghost" fullWidth>Cancel</Button>
      </div>
    </BottomSheet>
  );
}
