"use client";
// WaveformEditor — coordinator for the clip editing experience.
//
// Responsibilities (and ONLY these):
//   ∙ cut marks state (source of truth for all edits)
//   ∙ draft persistence (localStorage)
//   ∙ zoom level management + scroll-to-cut
//   ∙ submit version and split clip async flows
//   ∙ composing the sub-components / hooks below
//
// Everything else lives in a dedicated module:
//   useWaveSurfer      — WaveSurfer lifecycle, seek, playback, scroll tracking
//   useCutInteraction  — drag/tap state machine → seek / create / resize / pan
//   WaveformCanvas     — waveform container, cut bands, edge indicators, overlay
//   CutList            — cut list rows with nudge controls and zoom-to-cut

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWaveSurfer } from "./useWaveSurfer";
import { useCutInteraction } from "./useCutInteraction";
import { WaveformCanvas } from "./WaveformCanvas";
import { WaveformSplitter } from "./WaveformSplitter";
import { CutList } from "./CutList";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import {
  formatPosition,
  formatDuration,
  formatDurationDiff,
  calcResultDuration,
} from "@/lib/utils";
import { STAMP_COLORS, STAMP_EMOJI } from "@/types";
import type { ClipVersion, Stamp } from "@/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WaveformEditorProps {
  clipId: string;
  sourceDurationMs: number;
  frozenVersionId?: string | null;
  initialVersions: ClipVersion[];
  stamps: Stamp[];
  /** Destination after a split — typically the session page so both new clips appear. */
  sessionHref: string;
}

interface CutMark {
  id: string;
  startMs: number;
  endMs: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32, 64] as const;
type ZoomLevel = (typeof ZOOM_LEVELS)[number];

// ─── Draft helpers ──────────────────────────────────────────────────────────────

const draftKey = (id: string) => `odio:draft:${id}`;

function loadDraft(id: string): Array<{ startMs: number; endMs: number }> | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function saveDraft(id: string, marks: Array<{ startMs: number; endMs: number }>) {
  try { localStorage.setItem(draftKey(id), JSON.stringify(marks)); } catch {}
}
function clearDraft(id: string) {
  try { localStorage.removeItem(draftKey(id)); } catch {}
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function WaveformEditor({
  clipId, sourceDurationMs, frozenVersionId,
  initialVersions, stamps, sessionHref,
}: WaveformEditorProps) {
  const router = useRouter();

  // ── Cut marks state ──────────────────────────────────────────────────────────
  // cutMarks owns the edit buffer. cutMarksRef is kept in sync so WaveSurfer's
  // timeupdate handler and the interaction hook can read current cuts without
  // the stale-closure problems that come with reading React state in callbacks.
  const [cutMarks, setCutMarks] = useState<CutMark[]>([]);
  const cutMarksRef = useRef<CutMark[]>([]);
  useEffect(() => { cutMarksRef.current = cutMarks; }, [cutMarks]);

  // Monotonically increasing counter — never reuses an ID so React key collisions
  // cannot happen even if cuts are added/removed in quick succession.
  const nextCutIdRef = useRef(0);
  function newCutId(): string { return `cut-${++nextCutIdRef.current}`; }

  // ── Zoom ─────────────────────────────────────────────────────────────────────
  // zoomLevelRef lets the interaction hook (useCutInteraction) read the current
  // zoom without being re-created on every zoom change.
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(1);
  const zoomLevelRef = useRef<number>(1);
  useEffect(() => { zoomLevelRef.current = zoomLevel; }, [zoomLevel]);

  // ── WaveSurfer ───────────────────────────────────────────────────────────────
  const ws = useWaveSurfer({
    url: `/api/audio/${clipId}`,
    sourceDurationMs,
    cutMarksRef,
    patchDurationUrl: `/api/clips/${clipId}`,
  });

  // ── Draft ─────────────────────────────────────────────────────────────────────
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    const draft = loadDraft(clipId);
    if (draft && draft.length > 0) setHasDraft(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveDraft(clipId, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })));
  }, [clipId, cutMarks]);

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [expandedCutId, setExpandedCutId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ClipVersion[]>(initialVersions);
  const [splitMode, setSplitMode] = useState(false);
  const [splitMs, setSplitMs] = useState(0);

  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [splitSheetOpen, setSplitSheetOpen] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  // ── Cut operations ────────────────────────────────────────────────────────────

  function loadCuts(marks: Array<{ startMs: number; endMs: number }>) {
    const next: CutMark[] = marks.map((m) => ({ id: newCutId(), startMs: m.startMs, endMs: m.endMs }));
    cutMarksRef.current = next;
    setCutMarks(next);
  }

  function handleCreateCut(startMs: number, endMs: number) {
    const cut: CutMark = { id: newCutId(), startMs, endMs };
    setCutMarks((prev) => {
      const next = [...prev, cut];
      cutMarksRef.current = next;
      return next;
    });
  }

  function handleResizeCutEdge(cutId: string, edge: "start" | "end", ms: number) {
    setCutMarks((prev) => {
      const next = prev.map((cm) => {
        if (cm.id !== cutId) return cm;
        return edge === "start"
          ? { ...cm, startMs: Math.max(0, Math.min(cm.endMs - 50, ms)) }
          : { ...cm, endMs: Math.min(ws.effectiveDurMsRef.current, Math.max(cm.startMs + 50, ms)) };
      });
      cutMarksRef.current = next;
      return next;
    });
  }

  function nudgeCut(cutId: string, edge: "start" | "end", deltaMs: number) {
    setCutMarks((prev) => {
      const next = prev.map((cm) => {
        if (cm.id !== cutId) return cm;
        return edge === "start"
          ? { ...cm, startMs: Math.max(0, Math.min(cm.endMs - 50, cm.startMs + deltaMs)) }
          : { ...cm, endMs: Math.min(ws.effectiveDurMsRef.current, Math.max(cm.startMs + 50, cm.endMs + deltaMs)) };
      });
      cutMarksRef.current = next;
      return next;
    });
  }

  function removeCut(cutId: string) {
    setCutMarks((prev) => {
      const next = prev.filter((cm) => cm.id !== cutId);
      cutMarksRef.current = next;
      return next;
    });
    if (expandedCutId === cutId) setExpandedCutId(null);
  }

  function clearAllCuts() {
    cutMarksRef.current = [];
    setCutMarks([]);
    setExpandedCutId(null);
  }

  // ── Interaction hook ──────────────────────────────────────────────────────────
  const { pointerHandlers, cursorStyle, previewCut } = useCutInteraction({
    containerRef: ws.containerRef,
    scrollContainerRef: ws.scrollContainerRef,
    basePxPerSecRef: ws.basePxPerSecRef,
    effectiveDurMsRef: ws.effectiveDurMsRef,
    cutMarksRef,
    zoomLevelRef,
    onSeek: ws.seek,
    onCreateCut: handleCreateCut,
    onResizeCutEdge: handleResizeCutEdge,
  });

  // ── Zoom helpers ──────────────────────────────────────────────────────────────

  function applyZoomLevel(level: ZoomLevel) {
    setZoomLevel(level);
    zoomLevelRef.current = level;
    if (ws.basePxPerSecRef.current > 0) {
      ws.applyZoom(ws.basePxPerSecRef.current * level);
    }
  }

  function zoomIn() {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx < ZOOM_LEVELS.length - 1) applyZoomLevel(ZOOM_LEVELS[idx + 1]);
  }

  function zoomOut() {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx > 0) applyZoomLevel(ZOOM_LEVELS[idx - 1]);
  }

  function scrollToPlayhead() {
    const sc = ws.scrollContainerRef.current;
    const rect = ws.containerRef.current?.getBoundingClientRect();
    if (!sc || !rect || ws.effectiveDurationMs === 0) return;
    const playheadPx = (ws.currentTimeMs / ws.effectiveDurationMs) * sc.scrollWidth;
    sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - rect.width, playheadPx - rect.width / 2));
  }

  function zoomToCut(cm: CutMark) {
    const containerWidth = ws.containerRef.current?.clientWidth ?? 300;
    if (ws.basePxPerSecRef.current === 0) return;
    const cutDurSec = Math.max(0.1, (cm.endMs - cm.startMs) / 1000);
    const targetPxPerSec = (containerWidth * 0.65) / cutDurSec;
    const multiplier = targetPxPerSec / ws.basePxPerSecRef.current;
    const level = (ZOOM_LEVELS.find((l) => l >= multiplier) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1]) as ZoomLevel;
    applyZoomLevel(level);
    // Scroll to center the cut after the zoom re-renders (rAF gives WaveSurfer time to update scrollWidth)
    requestAnimationFrame(() => {
      const sc = ws.scrollContainerRef.current;
      if (!sc || ws.effectiveDurationMs === 0) return;
      const cutMidPx = (((cm.startMs + cm.endMs) / 2) / ws.effectiveDurationMs) * sc.scrollWidth;
      sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - containerWidth, cutMidPx - containerWidth / 2));
    });
  }

  // ── Trim shortcut ──────────────────────────────────────────────────────────────
  // Pre-seeds two cuts at 20% from each end — gives the user immediate grab handles
  // for trimming without needing to drag from scratch.

  function enterTrimMode() {
    if (!ws.effectiveDurationMs) return;
    const trimSec = (ws.effectiveDurationMs / 1000) * 0.2;
    loadCuts([
      { startMs: 0, endMs: Math.round(trimSec * 1000) },
      { startMs: Math.round((ws.effectiveDurationMs / 1000 - trimSec) * 1000), endMs: ws.effectiveDurationMs },
    ]);
  }

  // ── Split ──────────────────────────────────────────────────────────────────────

  function enterSplitMode() {
    // Reset zoom to 1× so the full waveform is visible when choosing the split point.
    applyZoomLevel(1);
    setSplitMode(true);
    const pos = Math.min(Math.round(ws.currentTimeMs), ws.effectiveDurationMs - 1);
    setSplitMs(pos > 0 ? pos : Math.round(ws.effectiveDurationMs / 2));
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
      if (res.ok) {
        setSplitSheetOpen(false);
        setSplitMode(false);
        router.push(sessionHref);
      } else {
        const b = await res.json().catch(() => ({}));
        setSplitError(b.error ?? "Split failed");
        setSplitting(false);
      }
    } catch {
      setSplitError("Network error");
      setSplitting(false);
    }
  }

  // ── Draft restore ──────────────────────────────────────────────────────────────

  function resumeDraft() {
    const draft = loadDraft(clipId);
    if (!draft) return;
    setHasDraft(false);
    loadCuts(draft);
  }

  // ── Load from a previous version ───────────────────────────────────────────────

  const loadFromVersion = useCallback((version: ClipVersion) => {
    const marks = Array.isArray(version.cutMarks)
      ? (version.cutMarks as Array<{ startMs: number; endMs: number }>)
      : [];
    loadCuts(marks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Submit version ─────────────────────────────────────────────────────────────

  async function submitVersion() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const effDur = ws.effectiveDurationMs;
      const validCuts = cutMarks
        .map(({ startMs, endMs }) => ({
          startMs: Math.max(0, Math.min(startMs, effDur)),
          endMs:   Math.max(0, Math.min(endMs,   effDur)),
        }))
        .filter(({ startMs, endMs }) => endMs > startMs);

      const res = await fetch(`/api/clips/${clipId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cutMarks: validCuts, description: description.trim() || undefined }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setSubmitError(b.error ?? "Failed");
        setSubmitting(false);
        return;
      }

      const v = await res.json();
      setVersions((prev) => [...prev, v]);
      setSubmitSheetOpen(false);
      setDescription("");
      clearAllCuts();
      clearDraft(clipId);
      router.refresh();
      router.back();
    } catch {
      setSubmitError("Network error");
      setSubmitting(false);
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────────

  const { wsState, isPlaying, currentTimeMs, effectiveDurationMs } = ws;
  const resultDurationMs = calcResultDuration(
    effectiveDurationMs,
    cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })),
  );
  const containerWidthPx = ws.containerRef.current?.clientWidth ?? 300;
  const splitLinePercent = effectiveDurationMs > 0
    ? Math.min(99, Math.max(1, (splitMs / effectiveDurationMs) * 100))
    : 50;
  const visibleDurationMs = ws.waveTotalWidth > 0
    ? Math.round((containerWidthPx / ws.waveTotalWidth) * effectiveDurationMs)
    : effectiveDurationMs;

  // ── Render ──────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">

      {/* ── Draft restore banner ── */}
      {hasDraft && cutMarks.length === 0 && (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 px-5 py-4 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-base font-medium text-primary">Unsaved draft</p>
            <p className="text-sm text-muted">Resume your previous cuts?</p>
          </div>
          <button onClick={resumeDraft} className="shrink-0 text-sm font-semibold text-accent">
            Resume
          </button>
          <button
            onClick={() => { clearDraft(clipId); setHasDraft(false); }}
            className="shrink-0 text-sm text-muted"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Audio file mismatch warning ── */}
      {ws.audioDurationMismatch && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-5 py-4">
          <p className="text-sm font-semibold text-danger">Audio file has wrong duration</p>
          <p className="mt-1 text-sm text-muted leading-snug">
            The waveform shows more audio than this clip should contain. This happens when a
            split clip was created before a storage fix. Re-splitting the original clip will
            produce a clean file.
          </p>
        </div>
      )}

      {/* ── Split mode — WaveformSplitter takes over the entire player card ── */}
      {splitMode && (
        <WaveformSplitter
          ws={ws}
          splitMs={splitMs}
          onChangeSplitMs={setSplitMs}
          onCancel={() => { setSplitMode(false); setSplitError(null); }}
          onConfirm={() => setSplitSheetOpen(true)}
        />
      )}

      {/* ── Trim mode — player card with waveform editor ── */}
      {!splitMode && (
      <div className="rounded-2xl bg-surface overflow-hidden">

        {/* Clock — current position / total (or result) duration */}
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

        {/* Waveform canvas — renders the waveform + cut bands + drag overlay */}
        <WaveformCanvas
          containerRef={ws.containerRef}
          wsState={wsState}
          audioErrorStatus={ws.audioErrorStatus}
          onRetry={ws.retry}
          cutMarks={cutMarks}
          previewCut={previewCut}
          effectiveDurationMs={effectiveDurationMs}
          waveScrollLeft={ws.waveScrollLeft}
          waveTotalWidth={ws.waveTotalWidth}
          containerWidthPx={containerWidthPx}
          splitMode={false}
          splitLinePercent={0}
          pointerHandlers={pointerHandlers}
          cursorStyle={cursorStyle}
        />

        {/* ── Zoom controls ── */}
        {wsState === "ready" && (
          <div className="px-5 py-2.5 flex items-center gap-2">
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

            <span className="font-mono text-xs text-muted min-w-[2.5rem] text-center select-none">
              {zoomLevel === 1 ? "1×" : `${zoomLevel}×`}
            </span>

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

            {zoomLevel > 1 && (
              <>
                <span className="text-muted/40 text-xs mx-1">·</span>
                <span className="text-xs text-muted font-mono">
                  {formatDuration(visibleDurationMs)} visible
                </span>
                <button
                  onClick={scrollToPlayhead}
                  aria-label="Center on playhead"
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-xl bg-elevated text-muted hover:text-accent active:scale-95 transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4" aria-hidden>
                    <circle cx="12" cy="12" r="3" />
                    <line x1="12" y1="2" x2="12" y2="7" /><line x1="12" y1="17" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="7" y2="12" /><line x1="17" y1="12" x2="22" y2="12" />
                  </svg>
                </button>
              </>
            )}

            {zoomLevel > 1 && (
              <span className="text-[10px] text-muted/50 ml-auto leading-tight text-right">
                drag to pan
              </span>
            )}
          </div>
        )}

        {/* ── Stamps ── */}
        {stamps.length > 0 && wsState === "ready" && (
          <div className="px-5 pb-2 flex gap-2 overflow-x-auto">
            {stamps.map((s) => (
              <button
                key={s.id}
                onClick={() => ws.seek(s.timestampMs / 1000)}
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

        {/* ── Play button ── */}
        <div className="pb-5 pt-2 flex items-center justify-center">
          <button
            onClick={ws.togglePlay}
            disabled={wsState !== "ready"}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-accent shadow-[0_4px_0_0_#78350f] transition-[transform,box-shadow] duration-75 active:translate-y-[4px] active:shadow-none disabled:opacity-40 disabled:shadow-none"
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-8" aria-hidden>
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-8" aria-hidden>
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
        </div>
      </div>
      )}

      {/* ── Tool buttons (trim mode only) ── */}
      {wsState === "ready" && !splitMode && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={enterTrimMode}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-3 py-4 text-muted hover:bg-elevated hover:text-primary transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
              <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" />
              <line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
            <span className="text-xs font-medium">Trim</span>
          </button>

          <button
            onClick={clearAllCuts}
            disabled={cutMarks.length === 0}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-3 py-4 text-muted hover:bg-elevated hover:text-danger transition-colors disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            <span className="text-xs font-medium">Clear all</span>
          </button>

          <button
            onClick={enterSplitMode}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-3 py-4 text-muted hover:bg-elevated hover:text-primary transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
              <line x1="12" y1="3" x2="12" y2="10" />
              <path d="M12 10 C12 10 7 12 7 17" /><path d="M12 10 C12 10 17 12 17 17" />
              <circle cx="7" cy="19" r="2" /><circle cx="17" cy="19" r="2" />
            </svg>
            <span className="text-xs font-medium">Split</span>
          </button>
        </div>
      )}

      {/* ── Cut list — expandable rows with nudge controls (trim mode only) ── */}
      {!splitMode && <CutList
        cutMarks={cutMarks}
        expandedCutId={expandedCutId}
        resultDurationMs={resultDurationMs}
        onToggleExpand={(id) => setExpandedCutId((prev) => (prev === id ? null : id))}
        onRemove={removeCut}
        onNudge={nudgeCut}
        onJumpToStart={(cm) => ws.seek(cm.startMs / 1000)}
        onZoomToCut={zoomToCut}
      />}

      {/* ── Submit edit button ── */}
      {wsState === "ready" && !splitMode && (
        <Button
          onClick={() => setSubmitSheetOpen(true)}
          disabled={cutMarks.length === 0}
          fullWidth
          size="lg"
        >
          Submit edit
          {cutMarks.length > 0 && (
            <span className="ml-2 opacity-70 font-mono text-sm">
              → {formatPosition(resultDurationMs)}
            </span>
          )}
        </Button>
      )}

      {cutMarks.length === 0 && wsState === "ready" && !splitMode && (
        <p className="text-center text-sm text-muted">
          Drag on the waveform to mark regions to cut
        </p>
      )}

      {/* ── Start from version shortcuts ── */}
      {versions.length > 0 && (
        <div>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted">
            Start from
          </p>
          <div className="flex gap-2 flex-wrap">
            {versions.map((v) => {
              const cuts = Array.isArray(v.cutMarks)
                ? (v.cutMarks as Array<{ startMs: number; endMs: number }>)
                : [];
              const dur = v.resultDurationMs ?? (cuts.length === 0 ? effectiveDurationMs : null);
              return (
                <button
                  key={v.id}
                  onClick={() => loadFromVersion(v)}
                  className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-sm text-muted hover:bg-elevated hover:text-primary transition-colors"
                >
                  <span className="font-semibold text-secondary">v{v.versionNumber}</span>
                  {dur != null && <span className="font-mono text-xs">{formatDuration(dur)}</span>}
                  {v.description && <span className="text-xs text-muted/70">{v.description}</span>}
                  {cuts.length > 0 && <span className="text-xs">{cuts.length}✂</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Submit version sheet ── */}
      <BottomSheet open={submitSheetOpen} onClose={() => setSubmitSheetOpen(false)} title="Submit edit">
        <div className="space-y-4">
          <div className="rounded-2xl bg-elevated px-5 py-4">
            <p className="text-base text-secondary">
              {cutMarks.length} cut{cutMarks.length !== 1 ? "s" : ""} ·{" "}
              <span className="font-mono">
                {formatDurationDiff(effectiveDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })))}
              </span>
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted" htmlFor="version-desc">
              Description (optional)
            </label>
            <input
              id="version-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. cut intro, tighten ending"
              className="w-full rounded-xl bg-elevated px-4 py-3 text-sm text-primary placeholder:text-muted/50 outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
          {submitError && <p className="text-sm text-danger">{submitError}</p>}
          <Button onClick={submitVersion} loading={submitting} fullWidth size="lg">
            Save version
          </Button>
        </div>
      </BottomSheet>

      {/* ── Split confirm sheet ── */}
      <BottomSheet open={splitSheetOpen} onClose={() => setSplitSheetOpen(false)} title="Split clip">
        <div className="space-y-4">
          <div className="rounded-2xl bg-elevated px-5 py-4 space-y-1">
            <p className="text-sm text-secondary">
              Split at <span className="font-mono text-primary">{formatPosition(splitMs)}</span>
            </p>
            <p className="text-xs text-muted">Two new clips will be created from this recording.</p>
          </div>
          {splitError && <p className="text-sm text-danger">{splitError}</p>}
          <Button onClick={handleSplit} loading={splitting} fullWidth size="lg">
            Confirm split
          </Button>
          <Button onClick={() => setSplitSheetOpen(false)} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </BottomSheet>

    </div>
  );
}
