"use client";
// StageSelector — stage display row + picker BottomSheet.
// Single responsibility: show the current song stage and let the user change it.

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { STAGE_LABELS } from "@/types";
import type { ClipStage } from "@/types";

const STAGE_ORDER: ClipStage[] = ["IDEA", "SKETCH", "DEVELOPING", "DEMO_READY"];

const STAGE_DESCRIPTIONS: Record<ClipStage, string> = {
  IDEA:       "Raw idea — keep recording",
  SKETCH:     "Rough shape — needs work",
  DEVELOPING: "Coming together",
  DEMO_READY: "Ready to share as a demo",
};

const STAGE_DOT: Record<ClipStage, string> = {
  IDEA:       "bg-zinc-500",
  SKETCH:     "bg-orange-400",
  DEVELOPING: "bg-accent",
  DEMO_READY: "bg-success",
};

interface StageSelectorProps {
  stage: ClipStage;
  canEdit: boolean;
  onChange: (stage: ClipStage) => void;
}

export function StageSelector({ stage, canEdit, onChange }: StageSelectorProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  function pick(s: ClipStage) {
    onChange(s);
    setSheetOpen(false);
  }

  return (
    <section aria-label="Song stage">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted px-1">Song stage</p>

      {canEdit ? (
        <button
          onClick={() => setSheetOpen(true)}
          className="flex w-full items-center gap-4 rounded-2xl bg-surface px-5 py-5 hover:bg-elevated transition-colors text-left"
        >
          <span className={`size-3 rounded-full shrink-0 ${STAGE_DOT[stage]}`} />
          <div className="flex-1 min-w-0">
            <span className="text-lg font-semibold text-primary">{STAGE_LABELS[stage]}</span>
            <span className="block text-sm text-muted mt-0.5">{STAGE_DESCRIPTIONS[stage]}</span>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5 text-muted shrink-0" aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      ) : (
        <div className="flex items-start gap-4 rounded-2xl bg-surface px-5 py-5">
          <span className={`size-3 rounded-full shrink-0 mt-1 ${STAGE_DOT[stage]}`} />
          <div>
            <span className="text-lg font-semibold text-primary">{STAGE_LABELS[stage]}</span>
            <span className="block text-sm text-muted mt-0.5">{STAGE_DESCRIPTIONS[stage]}</span>
          </div>
        </div>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Song stage">
        <div className="space-y-2">
          {STAGE_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => pick(s)}
              className={`w-full flex items-center gap-4 rounded-2xl px-5 py-5 text-left transition-colors ${
                s === stage ? "bg-accent/15 border border-accent/30" : "bg-surface hover:bg-elevated"
              }`}
            >
              <span className={`size-3 rounded-full shrink-0 ${STAGE_DOT[s]}`} />
              <div className="flex-1 min-w-0">
                <span className={`text-lg font-semibold ${s === stage ? "text-accent" : "text-primary"}`}>
                  {STAGE_LABELS[s]}
                </span>
                <span className="block text-sm text-muted mt-0.5">{STAGE_DESCRIPTIONS[s]}</span>
              </div>
              {s === stage && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-5 text-accent shrink-0" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
          <Button onClick={() => setSheetOpen(false)} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </BottomSheet>
    </section>
  );
}
