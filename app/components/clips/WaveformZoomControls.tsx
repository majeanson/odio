"use client";
// WaveformZoomControls — zoom in/out buttons, scale label, visible-duration indicator, scroll-to-playhead.
// Single responsibility: display and emit zoom navigation actions.
// Pure presenter — all state lives in WaveformEditor.

import { formatDuration } from "@/lib/utils";

const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32, 64] as const;

interface WaveformZoomControlsProps {
  zoomLevel: (typeof ZOOM_LEVELS)[number];
  visibleDurationMs: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onScrollToPlayhead: () => void;
  onScrollLeft: () => void;
  onScrollRight: () => void;
}

export function WaveformZoomControls({
  zoomLevel,
  visibleDurationMs,
  onZoomIn,
  onZoomOut,
  onScrollToPlayhead,
  onScrollLeft,
  onScrollRight,
}: WaveformZoomControlsProps) {
  const canZoomOut = zoomLevel > 1;
  const canZoomIn = zoomLevel < ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

  return (
    <div className="px-5 py-2.5 flex items-center gap-2">
      <button
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-elevated text-muted hover:text-primary active:scale-95 transition-all disabled:opacity-30"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="size-4" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>

      <span className="font-mono text-xs text-muted min-w-[2.5rem] text-center select-none">
        {zoomLevel === 1 ? "1×" : `${zoomLevel}×`}
      </span>

      <button
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-elevated text-muted hover:text-primary active:scale-95 transition-all disabled:opacity-30"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="size-4" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>

      {zoomLevel > 1 && (
        <>
          <span className="text-muted/40 text-xs mx-1">·</span>
          <span className="text-xs text-muted font-mono">
            {formatDuration(visibleDurationMs)} visible
          </span>
          {/* Scroll left */}
          <button
            onClick={onScrollLeft}
            aria-label="Scroll left"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-xl bg-elevated text-muted hover:text-primary active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          {/* Scroll right */}
          <button
            onClick={onScrollRight}
            aria-label="Scroll right"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-elevated text-muted hover:text-primary active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          {/* Center on playhead */}
          <button
            onClick={onScrollToPlayhead}
            aria-label="Center on playhead"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-elevated text-muted hover:text-accent active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="7" />
              <line x1="12" y1="17" x2="12" y2="22" />
              <line x1="2" y1="12" x2="7" y2="12" />
              <line x1="17" y1="12" x2="22" y2="12" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
