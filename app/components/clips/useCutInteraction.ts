"use client";
// useCutInteraction — drag/tap state machine for the waveform overlay.
// Single responsibility: translate raw pointer events into semantic editor actions.
//
// Pointer semantics:
//   tap (no movement)            → seek
//   drag near a cut edge         → resize that boundary immediately
//   drag inside cut (not edge)   → deferred resize (commits after threshold)
//   drag on empty area           → create new cut (with live preview)
//   pan when zoomed              → ← / → scroll buttons in WaveformZoomControls
//
// No WaveSurfer state, no cut marks state — those are owned by the coordinator.
// This hook only reads positions via refs and calls the supplied callbacks.

import { useRef, useState } from "react";

/** Half-width of the edge grab zone in visible pixels. 24 × 2 = 48px touch target. */
const EDGE_GRAB_PX = 24;
/** Pixels of movement before "pending" commits to a real drag mode. */
const MOVE_THRESHOLD = 8;

export interface InteractionCutMark {
  id: string;
  startMs: number;
  endMs: number;
}

type DragMode = "pending" | "create" | "resize";

interface DragState {
  startX: number;
  startY: number;
  startSec: number;
  mode: DragMode;
  // Active resize — only set once movement crosses the threshold
  resizeCutId: string | null;
  resizeEdge: "start" | "end" | null;
  // Deferred resize — set when pointer starts inside a cut band (not near edge).
  // Committed to resize mode after MOVE_THRESHOLD; treated as seek if lifted sooner.
  deferredResizeCutId: string | null;
  deferredResizeEdge: "start" | "end" | null;
}

export interface UseCutInteractionOptions {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  scrollContainerRef: React.MutableRefObject<HTMLElement | null>;
  basePxPerSecRef: React.MutableRefObject<number>;
  effectiveDurMsRef: React.MutableRefObject<number>;
  cutMarksRef: React.MutableRefObject<InteractionCutMark[]>;
  /** Ref so stale closures always read the current zoom level without re-creating handlers. */
  zoomLevelRef: React.MutableRefObject<number>;
  onSeek: (sec: number) => void;
  onCreateCut: (startMs: number, endMs: number) => void;
  onResizeCutEdge: (cutId: string, edge: "start" | "end", ms: number) => void;
}

export interface UseCutInteractionReturn {
  pointerHandlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
  cursorStyle: string;
  previewCut: { startMs: number; endMs: number } | null;
}

export function useCutInteraction({
  containerRef, scrollContainerRef, basePxPerSecRef, effectiveDurMsRef,
  cutMarksRef, zoomLevelRef,
  onSeek, onCreateCut, onResizeCutEdge,
}: UseCutInteractionOptions): UseCutInteractionReturn {
  const dragStateRef = useRef<DragState | null>(null);
  const [cursorStyle, setCursorStyle] = useState("crosshair");
  const [previewCut, setPreviewCut] = useState<{ startMs: number; endMs: number } | null>(null);

  // ── Position helpers ────────────────────────────────────────────────────────
  // These read refs at call time, so they're always fresh even in stale closures.

  function getMetrics() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0;
    const clipDurSec = effectiveDurMsRef.current / 1000;
    const totalWidth = basePxPerSecRef.current > 0
      ? basePxPerSecRef.current * zoomLevelRef.current * clipDurSec
      : rect.width;
    return { rect, scrollLeft, totalWidth, clipDurSec };
  }

  function clientXToSec(clientX: number): number {
    const m = getMetrics();
    if (!m) return 0;
    const relX = (clientX - m.rect.left) + m.scrollLeft;
    return Math.max(0, Math.min(m.clipDurSec, (relX / m.totalWidth) * m.clipDurSec));
  }

  function findEdgeAt(clientX: number): { cutId: string; edge: "start" | "end" } | null {
    const m = getMetrics();
    if (!m || effectiveDurMsRef.current === 0) return null;
    const visibleX = clientX - m.rect.left;
    let best: { cutId: string; edge: "start" | "end"; dist: number } | null = null;
    for (const cm of cutMarksRef.current) {
      const sPx = (cm.startMs / effectiveDurMsRef.current) * m.totalWidth - m.scrollLeft;
      const ePx = (cm.endMs   / effectiveDurMsRef.current) * m.totalWidth - m.scrollLeft;
      const ds = Math.abs(visibleX - sPx);
      const de = Math.abs(visibleX - ePx);
      if (ds <= EDGE_GRAB_PX && (!best || ds < best.dist)) best = { cutId: cm.id, edge: "start", dist: ds };
      if (de <= EDGE_GRAB_PX && (!best || de < best.dist)) best = { cutId: cm.id, edge: "end",   dist: de };
    }
    return best ? { cutId: best.cutId, edge: best.edge } : null;
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const startSec = clientXToSec(e.clientX);
    const startMs  = startSec * 1000;

    // Near a cut edge → immediate resize mode
    const edgeHit = findEdgeAt(e.clientX);
    if (edgeHit) {
      dragStateRef.current = {
        startX: e.clientX, startY: e.clientY, startSec,
        mode: "resize",
        resizeCutId: edgeHit.cutId, resizeEdge: edgeHit.edge,
        deferredResizeCutId: null, deferredResizeEdge: null,
      };
      return;
    }

    // Inside a cut band but not near an edge → deferred resize.
    // The nearest edge (start vs end) is pre-computed from the tap position.
    // We stay "pending" until movement tells us the user is actually dragging.
    const hitCut = cutMarksRef.current.find((cm) => startMs > cm.startMs && startMs < cm.endMs);
    const deferredEdge: "start" | "end" | null = hitCut
      ? (startMs - hitCut.startMs < hitCut.endMs - startMs ? "start" : "end")
      : null;

    dragStateRef.current = {
      startX: e.clientX, startY: e.clientY, startSec,
      mode: "pending",
      resizeCutId: null, resizeEdge: null,
      deferredResizeCutId: hitCut?.id ?? null,
      deferredResizeEdge: deferredEdge,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // No active drag → update cursor on hover
    if (!dragStateRef.current) {
      setCursorStyle(findEdgeAt(e.clientX) ? "ew-resize" : "crosshair");
      return;
    }

    const drag = dragStateRef.current;
    const deltaX = e.clientX - drag.startX;
    const deltaY = e.clientY - drag.startY;

    // ── Resize ────────────────────────────────────────────────────────────────
    if (drag.mode === "resize" && drag.resizeCutId && drag.resizeEdge) {
      const ms = Math.round(clientXToSec(e.clientX) * 1000);
      onResizeCutEdge(drag.resizeCutId, drag.resizeEdge, ms);
      return;
    }

    // ── Pending → commit to a mode ────────────────────────────────────────────
    if (drag.mode === "pending") {
      if (Math.abs(deltaX) < MOVE_THRESHOLD && Math.abs(deltaY) < MOVE_THRESHOLD) return;

      if (drag.deferredResizeCutId && drag.deferredResizeEdge) {
        // Started inside a cut — commit to resizing the nearest edge
        dragStateRef.current = {
          ...drag, mode: "resize",
          resizeCutId: drag.deferredResizeCutId, resizeEdge: drag.deferredResizeEdge,
        };
      } else {
        // All other drags (including horizontal at any zoom level) create a cut.
        // Panning when zoomed uses the ← / → scroll buttons in WaveformZoomControls.
        dragStateRef.current = { ...drag, mode: "create" };
      }
      return;
    }

    // ── Create (live preview) ─────────────────────────────────────────────────
    if (drag.mode === "create") {
      const sec = clientXToSec(e.clientX);
      setPreviewCut({
        startMs: Math.round(Math.min(drag.startSec, sec) * 1000),
        endMs:   Math.round(Math.max(drag.startSec, sec) * 1000),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag) return;
    dragStateRef.current = null;
    setPreviewCut(null);
    setCursorStyle(findEdgeAt(e.clientX) ? "ew-resize" : "crosshair");

    // Tap with no movement → seek to where the pointer went down.
    // Use startSec (captured at pointerdown), not e.clientX at pointerup —
    // pointerup coordinates can drift or arrive wrong on mobile.
    if (drag.mode === "pending") {
      onSeek(drag.startSec);
      return;
    }

    if (drag.mode === "resize") {
      // Immediate resize mode but no actual movement → treat as tap (seek)
      if (Math.abs(e.clientX - drag.startX) < MOVE_THRESHOLD &&
          Math.abs(e.clientY - drag.startY) < MOVE_THRESHOLD) {
        onSeek(drag.startSec);
      }
      return;
    }

    if (drag.mode === "create") {
      const sec = clientXToSec(e.clientX);
      const startMs = Math.round(Math.min(drag.startSec, sec) * 1000);
      const endMs   = Math.round(Math.max(drag.startSec, sec) * 1000);
      if (endMs - startMs >= 50) onCreateCut(startMs, endMs);
    }
  }

  function onPointerCancel(_e: React.PointerEvent<HTMLDivElement>) {
    // Browser stole the gesture (system scroll, pinch, overlay, etc.).
    // clientX is 0 or garbage on cancel — never seek, just clear drag state.
    dragStateRef.current = null;
    setPreviewCut(null);
    setCursorStyle("crosshair");
  }

  return {
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    cursorStyle,
    previewCut,
  };
}
