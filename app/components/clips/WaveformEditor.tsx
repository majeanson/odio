"use client";
// WaveformEditor — coordinator for the clip editing experience.
//
// Responsibilities (and ONLY these):
//   ∙ cut marks state (source of truth for all edits)
//   ∙ zoom level management + scroll-to-cut
//   ∙ submit version and split clip async flows
//   ∙ composing the sub-components / hooks below
//
// Everything else lives in a dedicated module:
//   useWaveSurfer        — WaveSurfer lifecycle, seek, playback, scroll tracking
//   useCutInteraction    — drag/tap state machine → seek / create / resize / pan
//   useSplitInteraction  — drag/tap state machine → move split marker
//   useCutDraft          — draft persistence (localStorage auto-save + resume)
//   WaveformCanvas       — waveform container, cut bands, edge indicators, overlay
//   WaveformSplitter     — split-mode controls (Part A/B summary + action buttons)
//   WaveformZoomControls — zoom in/out buttons + visible-duration indicator
//   WaveformPlayButton   — amber circular play/pause button
//   StampJumpRow         — tappable stamp chips that seek to timestamps
//   EditorToolbar        — Trim / Clear all / Split quick-action buttons
//   CutList              — cut list rows with nudge controls and zoom-to-cut
//   DraftRestoreBanner   — banner offering to resume a saved draft
//   VersionStartPicker   — "Start from vN" shortcut buttons
//   SubmitVersionSheet   — bottom sheet: description input + save version
//   SplitConfirmSheet    — bottom sheet: split-at confirmation
//
// Architecture note — one card, always mounted:
//   The card div containing WaveformCanvas (and thus containerRef) is NEVER
//   conditionally unmounted. If split mode unmounted the card, WaveSurfer's
//   canvas element (a child of containerRef) would detach, leaving the new
//   containerRef div at 0 px height and the pointer-event overlay invisible.
//   Instead, we always render one card and swap the controls below the waveform.

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWaveSurfer } from "./useWaveSurfer";
import { useCutInteraction } from "./useCutInteraction";
import { useSplitInteraction } from "./useSplitInteraction";
import { useCutDraft } from "./useCutDraft";
import { WaveformCanvas } from "./WaveformCanvas";
import { WaveformSplitter } from "./WaveformSplitter";
import { WaveformZoomControls } from "./WaveformZoomControls";
import { WaveformPlayButton } from "./WaveformPlayButton";
import { StampJumpRow } from "./StampJumpRow";
import { EditorToolbar } from "./EditorToolbar";
import { CutList } from "./CutList";
import { DraftRestoreBanner } from "./DraftRestoreBanner";
import { VersionStartPicker } from "./VersionStartPicker";
import { SubmitVersionSheet } from "./SubmitVersionSheet";
import { SplitConfirmSheet } from "./SplitConfirmSheet";
import { Button } from "@/components/ui/Button";
import {
  formatPosition,
  formatDurationDiff,
  calcResultDuration,
} from "@/lib/utils";
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

// ─── Component ──────────────────────────────────────────────────────────────────

export function WaveformEditor({
  clipId, sourceDurationMs, frozenVersionId: _frozenVersionId,
  initialVersions, stamps, sessionHref,
}: WaveformEditorProps) {
  const router = useRouter();

  // ── Cut marks state ──────────────────────────────────────────────────────────
  const [cutMarks, setCutMarks] = useState<CutMark[]>([]);
  const cutMarksRef = useRef<CutMark[]>([]);
  useEffect(() => { cutMarksRef.current = cutMarks; }, [cutMarks]);

  const nextCutIdRef = useRef(0);
  function newCutId(): string { return `cut-${++nextCutIdRef.current}`; }

  // ── Zoom ─────────────────────────────────────────────────────────────────────
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

  // ── Draft persistence ─────────────────────────────────────────────────────────
  // Pass the raw state array directly so the auto-save effect only fires when
  // cuts actually change (mapping inline would create a new reference every render).
  const draft = useCutDraft({
    clipId,
    cutMarks,
    onLoadCuts: loadCuts,
  });

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [expandedCutId, setExpandedCutId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ClipVersion[]>(initialVersions);
  const [splitMode, setSplitMode] = useState(false);
  const [splitMs, setSplitMs] = useState(0);
  const [isSplitting, setIsSplitting] = useState(false);
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [splitSheetOpen, setSplitSheetOpen] = useState(false);

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

  // ── Cut interaction hook (trim mode) ─────────────────────────────────────────
  const { pointerHandlers: cutPointerHandlers, cursorStyle: cutCursorStyle, previewCut } = useCutInteraction({
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

  // ── Split interaction hook (split mode) ──────────────────────────────────────
  const { pointerHandlers: splitPointerHandlers, cursorStyle: splitCursorStyle, hoverMs: splitHoverMs } = useSplitInteraction({
    containerRef: ws.containerRef,
    scrollContainerRef: ws.scrollContainerRef,
    basePxPerSecRef: ws.basePxPerSecRef,
    effectiveDurMsRef: ws.effectiveDurMsRef,
    onSeek: ws.seek,
    onSetSplitMs: setSplitMs,
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
    requestAnimationFrame(() => {
      const sc = ws.scrollContainerRef.current;
      if (!sc || ws.effectiveDurationMs === 0) return;
      const cutMidPx = (((cm.startMs + cm.endMs) / 2) / ws.effectiveDurationMs) * sc.scrollWidth;
      sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - containerWidth, cutMidPx - containerWidth / 2));
    });
  }

  // ── Trim shortcut ──────────────────────────────────────────────────────────────

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
    applyZoomLevel(1);
    setSplitMode(true);
    const pos = Math.min(Math.round(ws.currentTimeMs), ws.effectiveDurationMs - 1);
    setSplitMs(pos > 0 ? pos : Math.round(ws.effectiveDurationMs / 2));
  }

  async function doSplit(): Promise<void> {
    setIsSplitting(true);
    try {
      const res = await fetch(`/api/clips/${clipId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splitMs }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Split failed");
      }
      setSplitMode(false);
      router.push(sessionHref);
    } finally {
      setIsSplitting(false);
    }
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
  // Called by SubmitVersionSheet with the description. Throws on error.
  // Side effects on success: update versions list, clear cuts + draft, navigate back.

  async function submitVersion(description: string): Promise<void> {
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
      throw new Error(b.error ?? "Failed");
    }

    const v = await res.json();
    setVersions((prev) => [...prev, v]);
    clearAllCuts();
    draft.clear();
    router.refresh();
    router.back();
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
  const splitHoverPercent = splitHoverMs != null && effectiveDurationMs > 0
    ? Math.min(99, Math.max(1, (splitHoverMs / effectiveDurationMs) * 100))
    : null;
  const visibleDurationMs = ws.waveTotalWidth > 0
    ? Math.round((containerWidthPx / ws.waveTotalWidth) * effectiveDurationMs)
    : effectiveDurationMs;

  // ── Render ──────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">

      {/* ── Draft restore banner ── */}
      <DraftRestoreBanner
        show={draft.hasDraft && cutMarks.length === 0}
        onResume={draft.resume}
        onDismiss={draft.dismiss}
      />

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

      {/* ── Player card — always mounted so WaveSurfer's canvas never detaches ── */}
      <div className="rounded-2xl bg-surface overflow-hidden">

        {/* Clock — current position / split marker (split) or result duration (trim) */}
        <div className="px-5 pt-5 flex items-baseline justify-between">
          <span className="font-mono text-3xl font-semibold text-primary tabular-nums leading-none tracking-tight">
            {formatPosition(currentTimeMs)}
          </span>
          {splitMode
            ? (
              <span className="font-mono text-sm text-cyan-400 tabular-nums">
                ✂ {formatPosition(splitMs)}
              </span>
            ) : (
              <span className="font-mono text-sm text-muted tabular-nums">
                {cutMarks.length > 0
                  ? formatDurationDiff(effectiveDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })))
                  : formatPosition(effectiveDurationMs)}
              </span>
            )
          }
        </div>

        {/* Waveform canvas */}
        <WaveformCanvas
          containerRef={ws.containerRef}
          wsState={wsState}
          audioErrorStatus={ws.audioErrorStatus}
          onRetry={ws.retry}
          cutMarks={splitMode ? [] : cutMarks}
          previewCut={splitMode ? null : previewCut}
          effectiveDurationMs={effectiveDurationMs}
          waveScrollLeft={ws.waveScrollLeft}
          waveTotalWidth={ws.waveTotalWidth}
          containerWidthPx={containerWidthPx}
          splitMode={splitMode}
          splitLinePercent={splitLinePercent}
          splitHoverPercent={splitMode ? splitHoverPercent : null}
          pointerHandlers={splitMode ? splitPointerHandlers : cutPointerHandlers}
          cursorStyle={splitMode ? splitCursorStyle : cutCursorStyle}
        />

        {/* ── Trim mode controls ── */}
        {!splitMode && (
          <>
            {wsState === "ready" && (
              <WaveformZoomControls
                zoomLevel={zoomLevel}
                visibleDurationMs={visibleDurationMs}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
                onScrollToPlayhead={scrollToPlayhead}
              />
            )}
            <StampJumpRow stamps={stamps} wsState={wsState} onSeek={ws.seek} />
            <div className="pb-5 pt-2 flex items-center justify-center">
              <WaveformPlayButton
                isPlaying={isPlaying}
                disabled={wsState !== "ready"}
                onClick={ws.togglePlay}
              />
            </div>
          </>
        )}

        {/* ── Split mode controls ── */}
        {splitMode && (
          <WaveformSplitter
            splitMs={splitMs}
            effectiveDurationMs={effectiveDurationMs}
            isPlaying={isPlaying}
            wsState={wsState}
            onTogglePlay={ws.togglePlay}
            onMarkHere={() => setSplitMs(Math.round(ws.currentTimeMs))}
            onConfirm={() => setSplitSheetOpen(true)}
            onCancel={() => setSplitMode(false)}
            isSplitting={isSplitting}
          />
        )}
      </div>

      {/* ── Tool buttons (trim mode only) ── */}
      {wsState === "ready" && !splitMode && (
        <EditorToolbar
          hasCuts={cutMarks.length > 0}
          onTrim={enterTrimMode}
          onClearAll={clearAllCuts}
          onSplit={enterSplitMode}
        />
      )}

      {/* ── Cut list ── */}
      {!splitMode && (
        <CutList
          cutMarks={cutMarks}
          expandedCutId={expandedCutId}
          resultDurationMs={resultDurationMs}
          onToggleExpand={(id) => setExpandedCutId((prev) => (prev === id ? null : id))}
          onRemove={removeCut}
          onNudge={nudgeCut}
          onJumpToStart={(cm) => ws.seek(cm.startMs / 1000)}
          onZoomToCut={zoomToCut}
        />
      )}

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
      <VersionStartPicker
        versions={versions}
        effectiveDurationMs={effectiveDurationMs}
        onSelect={loadFromVersion}
      />

      {/* ── Submit version sheet ── */}
      <SubmitVersionSheet
        open={submitSheetOpen}
        onClose={() => setSubmitSheetOpen(false)}
        cutCount={cutMarks.length}
        effectiveDurationMs={effectiveDurationMs}
        cutMarks={cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs }))}
        onSubmit={submitVersion}
      />

      {/* ── Split confirm sheet ── */}
      <SplitConfirmSheet
        open={splitSheetOpen}
        onClose={() => setSplitSheetOpen(false)}
        splitMs={splitMs}
        onConfirm={doSplit}
      />

    </div>
  );
}
