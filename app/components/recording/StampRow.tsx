"use client";
// StampRow — row of four stamp buttons shown during recording.
// Single responsibility: let the musician tag moments without stopping.
// Tap fires haptic feedback (via useRecorder.addStamp) and the parent handles persistence.

import { STAMP_EMOJI, STAMP_COLORS } from "@/types";
import type { StampType } from "@/types";

const STAMPS: { type: StampType; label: string }[] = [
  { type: "FIRE",      label: "Fire" },
  { type: "KEEP",      label: "Keep" },
  { type: "UNCERTAIN", label: "Uncertain" },
  { type: "IDEA",      label: "Idea" },
];

interface StampRowProps {
  onStamp: (type: StampType) => void;
  count: number;
}

export function StampRow({ onStamp, count }: StampRowProps) {
  return (
    <>
      <div className="flex justify-around mb-6 gap-2">
        {STAMPS.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => onStamp(type)}
            aria-label={`Stamp: ${label}`}
            className="flex flex-1 flex-col items-center justify-center gap-1 h-24 rounded-2xl bg-surface text-4xl transition-transform active:scale-90"
            style={{ boxShadow: `0 0 0 2px ${STAMP_COLORS[type]}50, 0 4px 0 0 ${STAMP_COLORS[type]}30` }}
          >
            <span>{STAMP_EMOJI[type]}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span>
          </button>
        ))}
      </div>
      {count > 0 && (
        <p className="mb-4 text-center text-base text-muted">
          {count} stamp{count !== 1 ? "s" : ""} recorded
        </p>
      )}
    </>
  );
}
