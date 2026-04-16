"use client";
// useSplitInteraction — pointer state machine for selecting a split point.
// Single responsibility: translate raw pointer events into a live splitMs update.
//
// Pointer semantics:
//   tap (no movement past DRAG_THRESHOLD) → set split marker to tapped position + seek there
//   drag                                  → move the split marker in real-time
//   hover (no button down)                → update hoverMs so WaveformCanvas can show a ghost line
//
// Mirrors the pattern of useCutInteraction: no WaveSurfer state, no cuts state —
// only reads positions via refs and calls supplied callbacks.

import { useRef, useState } from "react";

/** Pixels of movement before a tap is treated as a drag. */
const DRAG_THRESHOLD = 8;
/** Minimum distance in ms from either end — prevents zero-length clips. */
const MIN_SPLIT_BUFFER_MS = 500;

interface UseSplitInteractionOptions {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  scrollContainerRef: React.MutableRefObject<HTMLElement | null>;
  basePxPerSecRef: React.MutableRefObject<number>;
  effectiveDurMsRef: React.MutableRefObject<number>;
  onSeek: (sec: number) => void;
  onSetSplitMs: (ms: number) => void;
}

interface UseSplitInteractionReturn {
  pointerHandlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerLeave: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
  cursorStyle: string;
  /** Millisecond position of the hover ghost line. Null when not hovering. */
  hoverMs: number | null;
}

export function useSplitInteraction({
  containerRef,
  scrollContainerRef,
  basePxPerSecRef,
  effectiveDurMsRef,
  onSeek,
  onSetSplitMs,
}: UseSplitInteractionOptions): UseSplitInteractionReturn {
  const dragRef = useRef<{ startX: number; startSec: number; didDrag: boolean } | null>(null);
  const [cursorStyle, setCursorStyle] = useState("crosshair");
  const [hoverMs, setHoverMs] = useState<number | null>(null);

  function clampSplitMs(rawMs: number): number {
    const effDur = effectiveDurMsRef.current;
    return Math.max(MIN_SPLIT_BUFFER_MS, Math.min(effDur - MIN_SPLIT_BUFFER_MS, rawMs));
  }

  function clientXToSec(clientX: number): number {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || effectiveDurMsRef.current === 0) return 0;
    const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0;
    const clipDurSec = effectiveDurMsRef.current / 1000;
    // Split mode resets zoom to 1, so totalWidth ≈ containerWidth.
    const totalWidth = basePxPerSecRef.current > 0
      ? basePxPerSecRef.current * clipDurSec
      : rect.width;
    const relX = (clientX - rect.left) + scrollLeft;
    return Math.max(0, Math.min(clipDurSec, (relX / totalWidth) * clipDurSec));
  }

  const pointerHandlers = {
    onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      e.currentTarget.setPointerCapture(e.pointerId);
      // Clear ghost line while actively interacting.
      setHoverMs(null);
      dragRef.current = {
        startX: e.clientX,
        startSec: clientXToSec(e.clientX),
        didDrag: false,
      };
    },

    onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
      const drag = dragRef.current;

      // No pointer captured — pure hover. Show ghost line at current position.
      if (!drag) {
        setHoverMs(clampSplitMs(Math.round(clientXToSec(e.clientX) * 1000)));
        return;
      }

      if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD) return;
      if (!drag.didDrag) {
        dragRef.current = { ...drag, didDrag: true };
        setCursorStyle("grabbing");
      }
      onSetSplitMs(clampSplitMs(Math.round(clientXToSec(e.clientX) * 1000)));
    },

    onPointerUp(_e: React.PointerEvent<HTMLDivElement>) {
      const drag = dragRef.current;
      dragRef.current = null;
      setCursorStyle("crosshair");
      if (!drag) return;

      if (!drag.didDrag) {
        // Tap → place the split marker at the tapped position AND seek there.
        // This is the primary "click to place" interaction — no listening required.
        const ms = clampSplitMs(Math.round(drag.startSec * 1000));
        onSetSplitMs(ms);
        onSeek(ms / 1000);
      }
      // Drag: onSetSplitMs was already called live in onPointerMove.
    },

    onPointerCancel(_e: React.PointerEvent<HTMLDivElement>) {
      dragRef.current = null;
      setCursorStyle("crosshair");
      setHoverMs(null);
    },

    onPointerLeave(_e: React.PointerEvent<HTMLDivElement>) {
      // Only clear ghost when not dragging — captured pointers suppress pointerleave,
      // so this fires only during genuine hover exits.
      if (!dragRef.current) {
        setHoverMs(null);
      }
    },
  };

  return { pointerHandlers, cursorStyle, hoverMs };
}
