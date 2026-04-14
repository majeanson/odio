"use client";

// Waveform editor — single concern: Cut the clip.
// Only rendered on the /edit page (canEdit is always true here).
// Responsibilities:
//   - Display the source audio with a drag overlay for region creation
//   - Manage the edit cut-mark buffer
//   - Allow loading a previous version's cuts as a starting point
//   - Submit the buffer as a new version
//   - Trim shortcut (pre-seed start/end cuts)
//   - Split mode (create a new clip at a time position)
//
// Interaction model:
//   - Tap overlay → seek
//   - Drag on empty area → create cut region (live visual feedback)
//   - Drag near a cut edge (within 24px) → resize that cut's boundary
//   - Drag horizontally when zoomed (no edge proximity) → pan waveform
//   - Zoom controls: 1×/2×/4×/8×/16×/32×/64× with basePxPerSec scaling
//   - Cut list rows: expandable nudge controls (±100ms, ±1s, ±5s) + zoom-to-cut

import { useEffect, useRef, useState, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { AudioBars } from "@/components/ui/AudioBars";
import {
  formatPosition,
  formatDuration,
  formatDurationDiff,
  calcResultDuration,
} from "@/lib/utils";
import { STAMP_COLORS, STAMP_EMOJI } from "@/types";
import type { ClipVersion, Stamp } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaveformEditorProps {
  clipId: string;
  sourceDurationMs: number;
  frozenVersionId?: string | null;
  initialVersions: ClipVersion[];
  stamps: Stamp[];
  /** URL of the session page — used to navigate after a split so both new clips are visible. */
  sessionHref: string;
}

interface CutMark {
  startMs: number;
  endMs: number;
  regionId: string;
}

// WaveSurfer 7 Region public API uses setOptions(), not update().
interface WsRegion {
  id: string;
  start: number;
  end: number;
  remove(): void;
  setOptions(opts: { start?: number; end?: number; color?: string; drag?: boolean; resize?: boolean }): void;
}

type DragMode = "pending" | "create" | "pan" | "resize";

interface DragState {
  startX: number;
  startY: number;
  startSec: number;
  region: WsRegion | null;
  mode: DragMode;
  resizeRegionId: string | null;
  resizeEdge: "start" | "end" | null;
  panScrollStart: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32, 64] as const;
type ZoomLevel = typeof ZOOM_LEVELS[number];

// Half-width of the edge grab zone in visible pixels. Must be large enough
// for comfortable touch targets (aim for ≥48px total = 24px on each side).
const EDGE_GRAB_PX = 24;

// ─── Draft helpers ────────────────────────────────────────────────────────────

const draftKey = (clipId: string) => `odio:draft:${clipId}`;
function loadDraft(id: string) {
  try { const r = localStorage.getItem(draftKey(id)); if (!r) return null; const p = JSON.parse(r); return Array.isArray(p) ? p as Array<{startMs:number;endMs:number}> : null; } catch { return null; }
}
function saveDraft(id: string, m: Array<{startMs:number;endMs:number}>) {
  try { localStorage.setItem(draftKey(id), JSON.stringify(m)); } catch {}
}
function clearDraft(id: string) { try { localStorage.removeItem(draftKey(id)); } catch {} }

// ─── Component ────────────────────────────────────────────────────────────────

export function WaveformEditor({
  clipId,
  sourceDurationMs,
  frozenVersionId,
  initialVersions,
  stamps,
  sessionHref,
}: WaveformEditorProps) {
  const router = useRouter();

  // Wavesurfer refs
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const cutMarksRef = useRef<CutMark[]>([]);   // kept in sync for timeupdate handler
  const dragStateRef = useRef<DragState | null>(null);
  // WaveSurfer's internal scroll container (wrapper.parentElement).
  // Set on "ready"; used for zoom/scroll position math in all pointer handlers.
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  // Pixels-per-second at zoom 1× (= container width / clip duration). Set on "ready".
  const basePxPerSecRef = useRef(0);

  // Playback + waveform state
  const [wsState, setWsState] = useState<"loading" | "ready" | "error">("loading");
  const [audioErrorStatus, setAudioErrorStatus] = useState<number | null>(null);
  const [audioDurationMismatch, setAudioDurationMismatch] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [detectedDurationMs, setDetectedDurationMs] = useState(0);
  const effectiveDurMsRef = useRef(sourceDurationMs);
  const effectiveDurationMs = sourceDurationMs || detectedDurationMs;
  effectiveDurMsRef.current = effectiveDurationMs;

  // Cut editing state
  const [cutMarks, setCutMarks] = useState<CutMark[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [expandedCutId, setExpandedCutId] = useState<string | null>(null);

  // Zoom + scroll state (tracked in React for re-rendering handle positions)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(1);
  // Current scroll position of the WaveSurfer scroll container (updated via WS scroll event).
  const [waveScrollLeft, setWaveScrollLeft] = useState(0);
  // Total scrollable width at current zoom (updated on ready + zoom changes).
  const [waveTotalWidth, setWaveTotalWidth] = useState(0);
  // Overlay cursor style — changes to ew-resize when near a cut edge.
  const [cursorStyle, setCursorStyle] = useState<string>("crosshair");

  // Submit / split state
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [versions, setVersions] = useState<ClipVersion[]>(initialVersions);
  const [splitMode, setSplitMode] = useState(false);
  const [splitMs, setSplitMs] = useState(0);
  const [splitSheetOpen, setSplitSheetOpen] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  // Keep ref in sync
  useEffect(() => { cutMarksRef.current = cutMarks; }, [cutMarks]);

  // Check for saved draft on mount
  useEffect(() => {
    const draft = loadDraft(clipId);
    if (draft && draft.length > 0) setHasDraft(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save draft on change
  useEffect(() => {
    saveDraft(clipId, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })));
  }, [clipId, cutMarks]);

  // ── Position helpers ──────────────────────────────────────────────────────

  const clipDurationSec = effectiveDurationMs / 1000;

  // Derive waveform position metrics without touching the shadow DOM.
  //
  // WaveSurfer renders inside a shadow root, so sc.scrollWidth can be stale
  // right after ws.zoom() until the browser layout pass completes.
  // Deriving totalWidth mathematically is always correct.
  // ws.getScroll() reads scrollContainer.scrollLeft via the official API.
  function getWaveMetrics(): { rect: DOMRect; scrollLeft: number; totalWidth: number } | null {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const scrollLeft = wsRef.current?.getScroll() ?? 0;
    // basePxPerSec * zoomLevel * clipDurationSec = containerWidth * zoomLevel
    const totalWidth = basePxPerSecRef.current > 0
      ? basePxPerSecRef.current * zoomLevel * clipDurationSec
      : rect.width;
    return { rect, scrollLeft, totalWidth };
  }

  // Convert a client X coordinate to audio seconds, accounting for zoom + scroll.
  function clientXToSec(clientX: number): number {
    const m = getWaveMetrics();
    if (!m) return 0;
    const relX = (clientX - m.rect.left) + m.scrollLeft;
    return Math.max(0, Math.min(clipDurationSec, (relX / m.totalWidth) * clipDurationSec));
  }

  // Returns the cut regionId + edge closest to the pointer, within EDGE_GRAB_PX.
  // Uses nearest-edge-wins across all cuts so a thin trim at the start of a long
  // clip always resolves to the correct edge instead of "start" winning by first-match.
  function findEdgeAt(clientX: number): { regionId: string; edge: "start" | "end" } | null {
    const m = getWaveMetrics();
    if (!m || effectiveDurationMs === 0) return null;
    const visibleX = clientX - m.rect.left;

    let best: { regionId: string; edge: "start" | "end"; dist: number } | null = null;

    for (const cm of cutMarksRef.current) {
      const startPx = (cm.startMs / effectiveDurationMs) * m.totalWidth - m.scrollLeft;
      const endPx   = (cm.endMs   / effectiveDurationMs) * m.totalWidth - m.scrollLeft;

      const ds = Math.abs(visibleX - startPx);
      const de = Math.abs(visibleX - endPx);

      if (ds <= EDGE_GRAB_PX && (!best || ds < best.dist)) {
        best = { regionId: cm.regionId, edge: "start", dist: ds };
      }
      if (de <= EDGE_GRAB_PX && (!best || de < best.dist)) {
        best = { regionId: cm.regionId, edge: "end", dist: de };
      }
    }

    return best ? { regionId: best.regionId, edge: best.edge } : null;
  }

  // ── Region helpers ────────────────────────────────────────────────────────

  function addEditRegion(startSec: number, endSec: number): WsRegion | null {
    if (!regionsRef.current) return null;
    const region = regionsRef.current.addRegion({
      start: startSec, end: endSec,
      color: "rgba(239, 68, 68, 0.3)",
      drag: false, resize: false, // we manage interaction ourselves
    }) as unknown as WsRegion;
    return region;
  }

  function loadCutsIntoEditor(marks: Array<{ startMs: number; endMs: number }>) {
    if (!regionsRef.current) return;
    regionsRef.current.clearRegions();
    const next: CutMark[] = marks.map((m) => {
      const r = addEditRegion(m.startMs / 1000, m.endMs / 1000);
      return { startMs: m.startMs, endMs: m.endMs, regionId: r?.id ?? "" };
    });
    // Sync ref immediately so drag handlers see the new cuts without waiting
    // for the useEffect that syncs cutMarksRef after the next render cycle.
    cutMarksRef.current = next;
    setCutMarks(next);
  }

  // ── Wavesurfer init ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    setWsState("loading");
    setZoomLevel(1);
    setWaveScrollLeft(0);
    setWaveTotalWidth(0);
    basePxPerSecRef.current = 0;
    scrollContainerRef.current = null;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: `/api/audio/${clipId}`,
      waveColor: "#3f3f46",
      progressColor: "#f59e0b",
      cursorColor: "#f59e0b",
      cursorWidth: 2,
      height: 100,
      normalize: true,
      interact: false, // we manage all pointer events via the overlay
      plugins: [regions],
    });

    wsRef.current = ws;

    ws.on("ready", () => {
      setWsState("ready");
      const wsDur = ws.getDuration() * 1000; // ms
      const isWrongFile =
        sourceDurationMs > 0 &&
        wsDur > sourceDurationMs * 1.5 &&
        wsDur - sourceDurationMs > 10_000;

      if (isWrongFile) {
        setAudioDurationMismatch(true);
      } else {
        effectiveDurMsRef.current = wsDur;
        setDetectedDurationMs(wsDur);
        if (sourceDurationMs === 0 || Math.abs(wsDur - sourceDurationMs) > 200) {
          fetch(`/api/clips/${clipId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceDurationMs: wsDur }),
          }).catch(() => {/* non-fatal */});
        }
      }

      // Set up zoom baseline and scroll container reference.
      const containerWidth = containerRef.current?.clientWidth ?? 300;
      const dur = ws.getDuration();
      if (dur > 0) basePxPerSecRef.current = containerWidth / dur;

      const sc = (ws.getWrapper() as HTMLElement)?.parentElement ?? null;
      scrollContainerRef.current = sc;
      if (sc) setWaveTotalWidth(sc.scrollWidth);
    });

    ws.on("error", () => {
      fetch(`/api/audio/${clipId}`, { method: "HEAD" })
        .then((r) => setAudioErrorStatus(r.status))
        .catch(() => setAudioErrorStatus(null))
        .finally(() => setWsState("error"));
    });
    ws.on("play",   () => setIsPlaying(true));
    ws.on("pause",  () => setIsPlaying(false));
    ws.on("finish", () => { setIsPlaying(false); ws.setTime(0); });

    ws.on("timeupdate", (time: number) => {
      const ms = time * 1000;
      const effDur = effectiveDurMsRef.current;
      setCurrentTimeMs(effDur > 0 ? Math.min(ms, effDur) : ms);
      if (!ws.isPlaying()) return;
      if (effDur > 0 && ms >= effDur) { ws.pause(); ws.setTime(0); return; }
      const hit = cutMarksRef.current.find((cm) => ms >= cm.startMs && ms < cm.endMs);
      if (hit && wsRef.current) {
        const targetSec = hit.endMs / 1000;
        if (effDur > 0 && targetSec >= effDur / 1000 - 0.3) {
          ws.pause(); ws.setTime(hit.startMs / 1000);
        } else {
          ws.setTime(targetSec);
        }
      }
    });

    // Track scroll position so edge handles re-render at the correct pixel position.
    ws.on("scroll", (_visStart: number, _visEnd: number) => {
      const sc = scrollContainerRef.current;
      if (sc) setWaveScrollLeft(sc.scrollLeft);
    });

    // region-updated fires from WaveSurfer's own drag system; harmless here since
    // we set drag:false/resize:false. Keep as safety net.
    regions.on("region-updated", (region) => {
      setCutMarks((prev) => prev.map((cm) =>
        cm.regionId === region.id
          ? { ...cm, startMs: Math.round(region.start * 1000), endMs: Math.round(region.end * 1000) }
          : cm,
      ));
    });

    return () => { ws.destroy(); wsRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, retryKey]);

  // ── Zoom ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (wsState !== "ready" || !wsRef.current || basePxPerSecRef.current === 0) return;
    wsRef.current.zoom(basePxPerSecRef.current * zoomLevel);
    // Use rAF to read scrollWidth after WaveSurfer redraws at the new zoom.
    requestAnimationFrame(() => {
      const sc = scrollContainerRef.current;
      if (sc) {
        setWaveTotalWidth(sc.scrollWidth);
        setWaveScrollLeft(sc.scrollLeft);
      }
    });
  }, [zoomLevel, wsState]);

  function zoomIn() {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx < ZOOM_LEVELS.length - 1) setZoomLevel(ZOOM_LEVELS[idx + 1]);
  }
  function zoomOut() {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx > 0) setZoomLevel(ZOOM_LEVELS[idx - 1]);
  }

  function scrollToPlayhead() {
    const sc = scrollContainerRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!sc || !rect || effectiveDurationMs === 0) return;
    const playheadPx = (currentTimeMs / effectiveDurationMs) * sc.scrollWidth;
    sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - rect.width, playheadPx - rect.width / 2));
  }

  function zoomToCut(cm: CutMark) {
    if (!containerRef.current || basePxPerSecRef.current === 0 || !wsRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const cutDurationSec = Math.max(0.1, (cm.endMs - cm.startMs) / 1000);
    const targetPxPerSec = (containerWidth * 0.65) / cutDurationSec;
    const multiplier = targetPxPerSec / basePxPerSecRef.current;
    // Find nearest zoom level ≥ what's needed (round up for better visibility).
    const level = (ZOOM_LEVELS.find((l) => l >= multiplier) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1]) as ZoomLevel;
    setZoomLevel(level);
    wsRef.current.zoom(basePxPerSecRef.current * level);
    requestAnimationFrame(() => {
      const sc = scrollContainerRef.current;
      if (!sc) return;
      setWaveTotalWidth(sc.scrollWidth);
      const cutMidPx = (((cm.startMs + cm.endMs) / 2) / effectiveDurationMs) * sc.scrollWidth;
      sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - containerWidth, cutMidPx - containerWidth / 2));
      setWaveScrollLeft(sc.scrollLeft);
    });
  }

  // ── Nudge ─────────────────────────────────────────────────────────────────

  function nudgeCut(regionId: string, edge: "start" | "end", deltaMs: number) {
    const cm = cutMarksRef.current.find((c) => c.regionId === regionId);
    if (!cm) return;
    const region = regionsRef.current?.getRegions().find((r) => r.id === regionId) as WsRegion | undefined;
    if (edge === "start") {
      const newMs = Math.max(0, Math.min(cm.endMs - 50, cm.startMs + deltaMs));
      region?.setOptions({ start: newMs / 1000 });
      setCutMarks((prev) => prev.map((c) => c.regionId === regionId ? { ...c, startMs: newMs } : c));
    } else {
      const newMs = Math.min(effectiveDurMsRef.current, Math.max(cm.startMs + 50, cm.endMs + deltaMs));
      region?.setOptions({ end: newMs / 1000 });
      setCutMarks((prev) => prev.map((c) => c.regionId === regionId ? { ...c, endMs: newMs } : c));
    }
  }

  // ── Drag overlay handlers ─────────────────────────────────────────────────

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!wsRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const startSec = clientXToSec(e.clientX);
    const edgeHit  = findEdgeAt(e.clientX);

    if (edgeHit) {
      dragStateRef.current = {
        startX: e.clientX, startY: e.clientY, startSec,
        region: null, mode: "resize",
        resizeRegionId: edgeHit.regionId, resizeEdge: edgeHit.edge,
        panScrollStart: 0,
      };
      return;
    }

    dragStateRef.current = {
      startX: e.clientX, startY: e.clientY, startSec,
      region: null, mode: "pending",
      resizeRegionId: null, resizeEdge: null,
      panScrollStart: scrollContainerRef.current?.scrollLeft ?? 0,
    };
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    // Update cursor style on hover (no active drag).
    if (!dragStateRef.current) {
      const edgeHit = findEdgeAt(e.clientX);
      setCursorStyle(edgeHit ? "ew-resize" : "crosshair");
      return;
    }

    const drag = dragStateRef.current;
    if (!wsRef.current) return;

    const deltaX = e.clientX - drag.startX;
    const deltaY = e.clientY - drag.startY;

    // ── Resize mode ───────────────────────────────────────────────────────
    if (drag.mode === "resize" && drag.resizeRegionId && drag.resizeEdge) {
      const sec = clientXToSec(e.clientX);
      const ms  = Math.round(sec * 1000);
      const region = regionsRef.current?.getRegions().find((r) => r.id === drag.resizeRegionId) as WsRegion | undefined;
      if (region) {
        if (drag.resizeEdge === "start") {
          const clampedMs = Math.max(0, Math.min(Math.round(region.end * 1000) - 50, ms));
          region.setOptions({ start: clampedMs / 1000 });
          const next = cutMarksRef.current.map((cm) =>
            cm.regionId === drag.resizeRegionId ? { ...cm, startMs: clampedMs } : cm,
          );
          cutMarksRef.current = next;
          setCutMarks(next);
        } else {
          const clampedMs = Math.min(effectiveDurMsRef.current, Math.max(Math.round(region.start * 1000) + 50, ms));
          region.setOptions({ end: clampedMs / 1000 });
          const next = cutMarksRef.current.map((cm) =>
            cm.regionId === drag.resizeRegionId ? { ...cm, endMs: clampedMs } : cm,
          );
          cutMarksRef.current = next;
          setCutMarks(next);
        }
      }
      return;
    }

    // ── Determine mode if still pending ──────────────────────────────────
    if (drag.mode === "pending") {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      // Horizontal drag when zoomed in → pan the waveform.
      if (zoomLevel > 1 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        dragStateRef.current = { ...drag, mode: "pan" };
      } else {
        dragStateRef.current = { ...drag, mode: "create" };
      }
      return;
    }

    // ── Pan mode ─────────────────────────────────────────────────────────
    if (drag.mode === "pan") {
      const sc = scrollContainerRef.current;
      if (sc) {
        sc.scrollLeft = Math.max(0, drag.panScrollStart - deltaX);
        // Let the WaveSurfer "scroll" event update waveScrollLeft state.
      }
      return;
    }

    // ── Create mode ──────────────────────────────────────────────────────
    if (drag.mode === "create" && regionsRef.current) {
      const sec = clientXToSec(e.clientX);
      const [start, end] = [Math.min(drag.startSec, sec), Math.max(drag.startSec, sec)];
      if (drag.region) {
        // Live resize: use setOptions() — the correct WaveSurfer 7 API.
        drag.region.setOptions({ start, end });
      } else {
        const r = regionsRef.current.addRegion({
          start, end,
          color: "rgba(239, 68, 68, 0.15)",
          drag: false, resize: false,
        }) as unknown as WsRegion;
        dragStateRef.current = { ...drag, region: r };
      }
    }
  }

  function handleDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag || !wsRef.current) return;
    dragStateRef.current = null;

    if (drag.mode === "resize") {
      // If it was just a tap on the edge (no movement), seek there too.
      if (Math.abs(e.clientX - drag.startX) < 6 && Math.abs(e.clientY - drag.startY) < 6) {
        const sec = clientXToSec(e.clientX);
        wsRef.current.setTime(Math.min(sec, wsRef.current.getDuration()));
      }
      return;
    }

    if (drag.mode === "pan") return;

    // Tap (< 8px movement) → seek
    if (Math.abs(e.clientX - drag.startX) < 8) {
      if (drag.region) drag.region.remove();
      const sec = clientXToSec(e.clientX);
      wsRef.current.setTime(Math.min(sec, wsRef.current.getDuration()));
      return;
    }

    // Create mode — finalize the dragged region
    if (drag.region) {
      const { start, end } = drag.region;
      drag.region.remove();
      if (end - start >= 0.05 && regionsRef.current) {
        const r = addEditRegion(start, end);
        if (r) setCutMarks((prev) => [...prev, { startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), regionId: r.id }]);
      }
    }
  }

  // ── Cut mark operations ───────────────────────────────────────────────────

  function removeCut(regionId: string) {
    regionsRef.current?.getRegions().find((r) => r.id === regionId)?.remove();
    setCutMarks((prev) => prev.filter((cm) => cm.regionId !== regionId));
    if (expandedCutId === regionId) setExpandedCutId(null);
  }

  function clearAllCuts() {
    regionsRef.current?.clearRegions();
    setCutMarks([]);
    setExpandedCutId(null);
  }

  // ── Draft ─────────────────────────────────────────────────────────────────

  function resumeDraft() {
    const draft = loadDraft(clipId);
    if (!draft) return;
    setHasDraft(false);
    loadCutsIntoEditor(draft);
  }

  // ── Load version cuts ─────────────────────────────────────────────────────

  const loadFromVersion = useCallback((version: ClipVersion) => {
    const marks = Array.isArray(version.cutMarks)
      ? (version.cutMarks as Array<{ startMs: number; endMs: number }>)
      : [];
    loadCutsIntoEditor(marks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Trim shortcut ─────────────────────────────────────────────────────────

  function enterTrimMode() {
    if (!effectiveDurationMs) return;
    // 20% of clip length per side — large enough to grab comfortably at 1× zoom.
    const t = clipDurationSec * 0.2;
    loadCutsIntoEditor([
      { startMs: 0, endMs: Math.round(t * 1000) },
      { startMs: Math.round((clipDurationSec - t) * 1000), endMs: effectiveDurationMs },
    ]);
  }

  // ── Split mode ────────────────────────────────────────────────────────────

  function enterSplitMode() {
    setSplitMode(true);
    const pos = Math.min(Math.round(currentTimeMs), effectiveDurationMs - 1);
    setSplitMs(pos > 0 ? pos : Math.round(effectiveDurationMs / 2));
  }

  async function handleSplit() {
    setSplitting(true);
    setSplitError(null);
    try {
      const res = await fetch(`/api/clips/${clipId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splitMs }),
      });
      if (res.ok) { setSplitSheetOpen(false); setSplitMode(false); router.push(sessionHref); }
      else { const b = await res.json().catch(() => ({})); setSplitError(b.error ?? "Split failed"); setSplitting(false); }
    } catch { setSplitError("Network error"); setSplitting(false); }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function submitVersion() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const validCuts = cutMarks
        .map(({ startMs, endMs, regionId }) => ({
          startMs: Math.max(0, Math.min(startMs, effectiveDurationMs)),
          endMs:   Math.max(0, Math.min(endMs,   effectiveDurationMs)),
          regionId,
        }))
        .filter(({ startMs, endMs }) => endMs > startMs);
      const res = await fetch(`/api/clips/${clipId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cutMarks: validCuts.map(({ startMs, endMs }) => ({ startMs, endMs })), description: description.trim() || undefined }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setSubmitError(b.error ?? "Failed"); setSubmitting(false); return; }
      const v = await res.json();
      setVersions((prev) => [...prev, v]);
      setSubmitSheetOpen(false);
      setDescription("");
      clearAllCuts();
      clearDraft(clipId);
      router.refresh();
      router.back();
    } catch { setSubmitError("Network error"); setSubmitting(false); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const resultDurationMs = calcResultDuration(effectiveDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })));
  const splitLinePercent = effectiveDurationMs > 0 ? Math.min(99, Math.max(1, (splitMs / effectiveDurationMs) * 100)) : 50;

  // Visible time window in ms at current zoom (shown next to zoom controls).
  const containerWidthPx = containerRef.current?.clientWidth ?? 300;
  const visibleDurationMs = waveTotalWidth > 0
    ? Math.round((containerWidthPx / waveTotalWidth) * effectiveDurationMs)
    : effectiveDurationMs;

  // Cut edge positions in visible pixels (for rendering grab-zone indicators).
  // Recomputed when waveScrollLeft or waveTotalWidth changes.
  const cutEdgePx = (ms: number): number => {
    if (effectiveDurationMs === 0) return 0;
    const totalW = waveTotalWidth > 0 ? waveTotalWidth : containerWidthPx;
    return (ms / effectiveDurationMs) * totalW - waveScrollLeft;
  };

  // Nudge increment labels and values
  const NUDGE_STEPS: [number, string][] = [[-5000, "−5s"], [-1000, "−1s"], [-100, "−0.1s"], [100, "+0.1s"], [1000, "+1s"], [5000, "+5s"]];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">

      {/* Draft restore */}
      {hasDraft && cutMarks.length === 0 && (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 px-5 py-4 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-base font-medium text-primary">Unsaved draft</p>
            <p className="text-sm text-muted">Resume your previous cuts?</p>
          </div>
          <button onClick={resumeDraft} className="shrink-0 text-sm font-semibold text-accent">Resume</button>
          <button onClick={() => { clearDraft(clipId); setHasDraft(false); }} className="shrink-0 text-sm text-muted">Dismiss</button>
        </div>
      )}

      {/* Audio duration mismatch warning */}
      {audioDurationMismatch && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-5 py-4">
          <p className="text-sm font-semibold text-danger">Audio file has wrong duration</p>
          <p className="mt-1 text-sm text-muted leading-snug">
            The waveform shows more audio than this clip should contain. This happens when a
            split clip was created before a storage fix. Cuts are clamped to the correct
            duration, but re-splitting the original clip will produce a clean file.
          </p>
        </div>
      )}

      {/* Player card */}
      <div className="rounded-2xl bg-surface overflow-hidden">

        {/* Clock */}
        <div className="px-5 pt-5 flex items-baseline justify-between">
          <span className="font-mono text-3xl font-semibold text-primary tabular-nums leading-none tracking-tight">
            {formatPosition(currentTimeMs)}
          </span>
          <span className="font-mono text-sm text-muted tabular-nums">
            {cutMarks.length > 0
              ? formatDurationDiff(effectiveDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })))
              : formatPosition(effectiveDurationMs)}
          </span>
        </div>

        {/* Waveform + drag overlay */}
        <div className="px-5 pt-3 pb-0">
          <div className="relative">
            <div ref={containerRef} className="w-full" />

            {/* Drag overlay — tap=seek, drag=create/resize/pan depending on context */}
            {wsState === "ready" && !splitMode && (
              <div
                className="absolute inset-0 touch-none select-none"
                style={{ cursor: cursorStyle }}
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
              />
            )}

            {/* Cut edge handles — interactive drag targets for resizing cut boundaries.
                Each handle is a 48px-wide touch target centered on the edge line.
                They sit above the overlay (z-20) and capture the pointer on pointerdown
                so subsequent move/up events go directly to the handle regardless of
                where the finger travels. stopPropagation prevents the overlay from
                also starting a new drag. handleDragMove/End are reused since they
                don't depend on e.currentTarget. */}
            {wsState === "ready" && !splitMode && cutMarks.map((cm) => {
              const sPx = cutEdgePx(cm.startMs);
              const ePx = cutEdgePx(cm.endMs);
              const HANDLE_W = 48; // px, minimum recommended touch target
              const HALF = HANDLE_W / 2;

              const makeHandleDown = (regionId: string, edge: "start" | "end") =>
                (e: React.PointerEvent<HTMLDivElement>) => {
                  e.stopPropagation(); // don't let the overlay also fire
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragStateRef.current = {
                    startX: e.clientX, startY: e.clientY,
                    startSec: clientXToSec(e.clientX),
                    region: null, mode: "resize",
                    resizeRegionId: regionId, resizeEdge: edge,
                    panScrollStart: 0,
                  };
                };

              return (
                <Fragment key={cm.regionId}>
                  {sPx > -HALF && sPx < containerWidthPx + HALF && (
                    <div
                      className="absolute top-0 bottom-0 z-20 touch-none select-none cursor-ew-resize flex items-center justify-center"
                      style={{ left: sPx - HALF, width: HANDLE_W }}
                      onPointerDown={makeHandleDown(cm.regionId, "start")}
                      onPointerMove={handleDragMove}
                      onPointerUp={handleDragEnd}
                      onPointerCancel={handleDragEnd}
                    >
                      {/* Thin edge line */}
                      <div className="absolute inset-y-0 w-0.5 bg-danger/70" style={{ left: HALF - 1 }} />
                      {/* Grip pill */}
                      <div className="absolute flex flex-col gap-0.5 items-center" style={{ left: HALF - 6, top: "50%", transform: "translateY(-50%)" }}>
                        <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                        <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                        <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                      </div>
                    </div>
                  )}
                  {ePx > -HALF && ePx < containerWidthPx + HALF && (
                    <div
                      className="absolute top-0 bottom-0 z-20 touch-none select-none cursor-ew-resize flex items-center justify-center"
                      style={{ left: ePx - HALF, width: HANDLE_W }}
                      onPointerDown={makeHandleDown(cm.regionId, "end")}
                      onPointerMove={handleDragMove}
                      onPointerUp={handleDragEnd}
                      onPointerCancel={handleDragEnd}
                    >
                      <div className="absolute inset-y-0 w-0.5 bg-danger/70" style={{ left: HALF - 1 }} />
                      <div className="absolute flex flex-col gap-0.5 items-center" style={{ left: HALF - 6, top: "50%", transform: "translateY(-50%)" }}>
                        <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                        <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                        <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}

            {/* Split position marker */}
            {splitMode && wsState === "ready" && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 w-[2px] -translate-x-1/2"
                style={{ left: `${splitLinePercent}%`, background: "#22d3ee", boxShadow: "0 0 8px 3px rgba(34,211,238,0.35)" }}
              >
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 size-3 rotate-45" style={{ background: "#22d3ee" }} />
              </div>
            )}
          </div>

          {wsState === "loading" && (
            <div className="h-[100px] flex items-center justify-center">
              <AudioBars className="size-5 text-accent" />
            </div>
          )}
          {wsState === "error" && (
            <div className="h-[100px] flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-muted text-center leading-snug">
                {audioErrorStatus === 404
                  ? "Audio not yet available — upload may still be processing"
                  : audioErrorStatus === 401 || audioErrorStatus === 503
                    ? "Drive connection needs renewal"
                    : "Audio unavailable"}
              </p>
              <div className="flex items-center gap-3">
                {(audioErrorStatus === 401 || audioErrorStatus === 503) && (
                  <a href="/login" className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-medium text-white">
                    Reconnect Drive
                  </a>
                )}
                <button
                  onClick={() => { setAudioErrorStatus(null); setRetryKey((k) => k + 1); }}
                  className="text-xs text-muted underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Zoom controls ── */}
        {wsState === "ready" && (
          <div className="px-5 py-2.5 flex items-center gap-2">
            {/* Zoom out */}
            <button
              onClick={zoomOut}
              disabled={zoomLevel <= 1}
              aria-label="Zoom out"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-elevated text-muted hover:text-primary active:scale-95 transition-all disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="size-4" aria-hidden>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>

            {/* Zoom level label */}
            <span className="font-mono text-xs text-muted min-w-[2.5rem] text-center select-none">
              {zoomLevel === 1 ? "1×" : `${zoomLevel}×`}
            </span>

            {/* Zoom in */}
            <button
              onClick={zoomIn}
              disabled={zoomLevel >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              aria-label="Zoom in"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-elevated text-muted hover:text-primary active:scale-95 transition-all disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="size-4" aria-hidden>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>

            {/* Visible window info + scroll-to-playhead when zoomed */}
            {zoomLevel > 1 && (
              <>
                <span className="text-muted/40 text-xs mx-1">·</span>
                <span className="text-xs text-muted font-mono">
                  {formatDuration(visibleDurationMs)} visible
                </span>
                <button
                  onClick={scrollToPlayhead}
                  aria-label="Center on playhead"
                  title="Center on playhead"
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-xl bg-elevated text-muted hover:text-accent active:scale-95 transition-all"
                >
                  {/* Target / crosshair icon */}
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

            {/* Pan hint when zoomed */}
            {zoomLevel > 1 && !splitMode && (
              <span className="text-[10px] text-muted/50 ml-auto leading-tight text-right">
                drag to pan
              </span>
            )}
          </div>
        )}

        {/* Stamps */}
        {stamps.length > 0 && wsState === "ready" && (
          <div className="px-5 pb-2 flex gap-2 overflow-x-auto">
            {stamps.map((s) => (
              <button
                key={s.id}
                onClick={() => wsRef.current?.setTime(s.timestampMs / 1000)}
                aria-label={`Jump to ${formatDuration(s.timestampMs)}`}
                className="flex-shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs active:scale-95 transition-transform"
                style={{ backgroundColor: `${STAMP_COLORS[s.type]}20`, color: STAMP_COLORS[s.type] }}
              >
                <span>{STAMP_EMOJI[s.type]}</span>
                <span className="font-mono">{formatDuration(s.timestampMs)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Play + mark-here */}
        <div className="pb-5 pt-2 flex items-center justify-center gap-5">
          <button
            onClick={() => wsRef.current?.playPause()}
            disabled={wsState !== "ready"}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-accent shadow-[0_4px_0_0_#78350f] transition-[transform,box-shadow] duration-75 active:translate-y-[4px] active:shadow-none disabled:opacity-40 disabled:shadow-none"
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-8" aria-hidden><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-8" aria-hidden><polygon points="5,3 19,12 5,21" /></svg>
            )}
          </button>
          {splitMode && (
            <button
              onClick={() => setSplitMs(Math.round(currentTimeMs))}
              className="rounded-full px-4 py-2.5 text-sm font-semibold transition-colors"
              style={{ background: "rgba(34,211,238,0.15)", color: "#22d3ee" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(34,211,238,0.25)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(34,211,238,0.15)")}
            >
              Mark here
            </button>
          )}
        </div>
      </div>

      {/* ── Tool buttons ── */}
      {wsState === "ready" && !splitMode && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={enterTrimMode}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-3 py-4 text-muted hover:bg-elevated hover:text-primary transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
              <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
            <span className="text-xs font-medium">Trim</span>
          </button>
          <button onClick={clearAllCuts} disabled={cutMarks.length === 0}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-3 py-4 text-muted hover:bg-elevated hover:text-danger transition-colors disabled:opacity-30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            <span className="text-xs font-medium">Clear all</span>
          </button>
          <button onClick={enterSplitMode}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-3 py-4 text-muted hover:bg-elevated hover:text-primary transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
              <line x1="12" y1="3" x2="12" y2="10" />
              <path d="M12 10 C12 10 7 12 7 17" /><path d="M12 10 C12 10 17 12 17 17" />
              <circle cx="7" cy="19" r="2" /><circle cx="17" cy="19" r="2" />
            </svg>
            <span className="text-xs font-medium">Split</span>
          </button>
        </div>
      )}

      {/* ── Split panel ── */}
      {splitMode && wsState === "ready" && (
        <div className="rounded-2xl bg-surface px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-primary">Split song</p>
            <span className="font-mono text-sm text-amber-400">{formatPosition(splitMs)}</span>
          </div>
          <div className="flex gap-3 text-sm text-muted font-mono">
            <span>A: 0:00:00 – {formatPosition(splitMs)}</span>
            <span className="text-muted/40">·</span>
            <span>B: {formatPosition(splitMs)} →</span>
          </div>
          <p className="text-xs text-muted">Play to the split point, tap Mark here, then confirm.</p>
          <div className="flex gap-2">
            <Button onClick={() => setSplitSheetOpen(true)} fullWidth size="lg">Split here</Button>
            <Button onClick={() => { setSplitMode(false); setSplitError(null); }} variant="ghost" fullWidth>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Active cut marks list ── */}
      {cutMarks.length > 0 && (
        <div className="rounded-2xl bg-surface px-5 py-4 space-y-1">
          <p className="text-sm font-semibold text-secondary uppercase tracking-wide mb-3">
            Cuts ({cutMarks.length}) · {formatPosition(resultDurationMs)} result
          </p>
          {cutMarks.map((cm) => {
            const isExpanded = expandedCutId === cm.regionId;
            return (
              <div key={cm.regionId} className="rounded-xl overflow-hidden">
                {/* Cut row header */}
                <button
                  className="w-full flex items-center gap-2 py-2 px-1 text-left active:bg-elevated/50 transition-colors rounded-xl"
                  onClick={() => setExpandedCutId(isExpanded ? null : cm.regionId)}
                >
                  {/* Expand chevron */}
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                    className={`size-3.5 text-muted shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span className="font-mono text-sm text-primary flex-1">
                    {formatPosition(cm.startMs)} – {formatPosition(cm.endMs)}
                  </span>
                  <span className="font-mono text-xs text-muted shrink-0">
                    −{formatDuration(cm.endMs - cm.startMs)}
                  </span>
                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCut(cm.regionId); }}
                    aria-label="Remove cut"
                    className="p-1.5 text-muted hover:text-danger transition-colors shrink-0"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </button>

                {/* Expanded nudge controls */}
                {isExpanded && (
                  <div className="pb-3 px-1 space-y-3">
                    {/* Start nudge */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                        Start · <span className="font-mono normal-case tracking-normal">{formatPosition(cm.startMs)}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {NUDGE_STEPS.map(([delta, label]) => (
                          <button
                            key={label}
                            onClick={() => nudgeCut(cm.regionId, "start", delta)}
                            className="rounded-lg bg-elevated px-2.5 py-1.5 font-mono text-xs text-muted hover:bg-elevated/80 hover:text-primary active:scale-95 transition-all"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* End nudge */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                        End · <span className="font-mono normal-case tracking-normal">{formatPosition(cm.endMs)}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {NUDGE_STEPS.map(([delta, label]) => (
                          <button
                            key={label}
                            onClick={() => nudgeCut(cm.regionId, "end", delta)}
                            className="rounded-lg bg-elevated px-2.5 py-1.5 font-mono text-xs text-muted hover:bg-elevated/80 hover:text-primary active:scale-95 transition-all"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => wsRef.current?.setTime(cm.startMs / 1000)}
                        className="flex-1 rounded-xl bg-elevated px-3 py-2 text-xs text-muted hover:text-primary transition-colors"
                      >
                        Jump to start
                      </button>
                      <button
                        onClick={() => zoomToCut(cm)}
                        className="flex-1 rounded-xl bg-elevated px-3 py-2 text-xs text-muted hover:text-primary transition-colors"
                      >
                        Zoom to cut
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Submit button ── */}
      {wsState === "ready" && !splitMode && (
        <Button
          onClick={() => setSubmitSheetOpen(true)}
          disabled={cutMarks.length === 0}
          fullWidth size="lg"
        >
          Submit edit
          {cutMarks.length > 0 && (
            <span className="ml-2 opacity-70 font-mono text-sm">→ {formatPosition(resultDurationMs)}</span>
          )}
        </Button>
      )}

      {cutMarks.length === 0 && wsState === "ready" && !splitMode && (
        <p className="text-center text-sm text-muted">
          Drag on the waveform to mark regions to cut
        </p>
      )}

      {/* ── "Start from version" shortcuts ── */}
      {versions.length > 0 && (
        <div>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted">
            Start from
          </p>
          <div className="flex gap-2 flex-wrap">
            {versions.map((v) => {
              const cuts = Array.isArray(v.cutMarks) ? (v.cutMarks as Array<{startMs:number;endMs:number}>) : [];
              const dur = v.resultDurationMs ?? (cuts.length === 0 ? effectiveDurationMs : null);
              return (
                <button
                  key={v.id}
                  onClick={() => loadFromVersion(v)}
                  className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-sm text-muted hover:bg-elevated hover:text-primary transition-colors"
                >
                  <span className="font-semibold text-secondary">v{v.versionNumber}</span>
                  {dur != null && <span className="font-mono text-xs">{formatDuration(dur)}</span>}
                  {v.description && (
                    <span className="text-xs text-muted/70">{v.description}</span>
                  )}
                  {cuts.length > 0 && <span className="text-xs">{cuts.length}✂</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Submit description sheet ── */}
      <BottomSheet open={submitSheetOpen} onClose={() => setSubmitSheetOpen(false)} title="Submit edit">
        <div className="space-y-4">
          <div className="rounded-2xl bg-elevated px-5 py-4">
            <p className="text-base text-secondary">
              {cutMarks.length} cut{cutMarks.length !== 1 ? "s" : ""} ·{" "}
              <span className="font-mono">{formatDurationDiff(effectiveDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })))}</span>
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted" htmlFor="version-desc">Description (optional)</label>
            <input
              id="version-desc" type="text" value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitVersion()}
              placeholder="Cut the dead air at the start" maxLength={200}
              className="w-full rounded-2xl border border-border bg-surface px-5 py-3.5 text-base text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
          {submitError && <p className="text-sm text-danger">{submitError}</p>}
          <Button onClick={submitVersion} disabled={submitting} fullWidth size="lg">
            {submitting ? "Submitting…" : "Submit version"}
          </Button>
          <Button onClick={() => setSubmitSheetOpen(false)} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </BottomSheet>

      {/* ── Split confirmation sheet ── */}
      <BottomSheet open={splitSheetOpen} onClose={() => setSplitSheetOpen(false)} title="Split into two songs">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="rounded-2xl bg-elevated px-5 py-4 flex items-center gap-4">
              <span className="text-sm font-semibold text-secondary w-14 shrink-0">Part A</span>
              <span className="font-mono text-base text-primary">0:00:00 – {formatPosition(splitMs)}</span>
              <span className="font-mono text-sm text-muted ml-auto">{formatDuration(splitMs)}</span>
            </div>
            <div className="rounded-2xl bg-elevated px-5 py-4 flex items-center gap-4">
              <span className="text-sm font-semibold text-secondary w-14 shrink-0">Part B</span>
              <span className="font-mono text-base text-primary">{formatPosition(splitMs)} →</span>
              <span className="font-mono text-sm text-muted ml-auto">{formatDuration(effectiveDurationMs - splitMs)}</span>
            </div>
          </div>
          <p className="text-sm text-muted">
            Each part gets its own audio file in Drive. Takes a few seconds — hang tight.
          </p>
          {splitError && <p className="text-sm text-danger">{splitError}</p>}
          <Button onClick={handleSplit} disabled={splitting} loading={splitting} fullWidth size="lg">
            {splitting ? "Splitting…" : "Confirm split"}
          </Button>
          <Button onClick={() => setSplitSheetOpen(false)} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </BottomSheet>
    </div>
  );
}
