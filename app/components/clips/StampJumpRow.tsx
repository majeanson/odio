"use client";
// StampJumpRow — horizontal row of tappable stamp chips that seek to a timestamp.
// Pure presenter: renders nothing when no stamps or waveform not ready.
// Shared by WaveformPlayer, WaveformEditor, and PublicPlayer.

import { formatDuration } from "@/lib/utils";
import { STAMP_COLORS, STAMP_EMOJI } from "@/types";
import type { StampType } from "@/types";

interface Stamp {
  id: string;
  timestampMs: number;
  type: StampType;
}

interface StampJumpRowProps {
  stamps: Stamp[];
  wsState: "loading" | "ready" | "error";
  onSeek: (sec: number) => void;
  /** Wrapper div className. Defaults to the standard padded row used in editor/player. */
  className?: string;
}

export function StampJumpRow({
  stamps,
  wsState,
  onSeek,
  className = "px-5 pb-2 flex gap-2 overflow-x-auto",
}: StampJumpRowProps) {
  if (stamps.length === 0 || wsState !== "ready") return null;

  return (
    <div className={className}>
      {stamps.map((stamp) => (
        <button
          key={stamp.id}
          onClick={() => onSeek(stamp.timestampMs / 1000)}
          aria-label={`Jump to ${formatDuration(stamp.timestampMs)}`}
          className="flex-shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs active:scale-95 transition-transform"
          style={{
            backgroundColor: `${STAMP_COLORS[stamp.type]}20`,
            color: STAMP_COLORS[stamp.type],
          }}
        >
          <span>{STAMP_EMOJI[stamp.type]}</span>
          <span className="font-mono">{formatDuration(stamp.timestampMs)}</span>
        </button>
      ))}
    </div>
  );
}
