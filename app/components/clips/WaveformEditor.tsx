"use client";

// Waveform editor — single component used on both the detail page (canEdit=false)
// and the full-screen editor page (canEdit=true).
//
// Mental model:
//   - One master waveform displays the full source audio at all times.
//   - Version pills below the waveform select which version's cut marks are
//     visualised on the waveform (blue read-only regions) and active for
//     skip-cuts during playback.
//   - In edit mode (canEdit=true), the overlay div captures pointer events so
//     drag-to-create works without fighting wavesurfer's own seek handler.
//     Outside edit mode there is NO overlay → wavesurfer handles click-to-seek.
//
// Fixes vs prior version:
//   - enableDragSelection() removed entirely: it ate click events and broke seek.
//   - Drag-to-create replaced with a transparent overlay present only in editMode.
//   - VersionRow list removed: CollaborationSection owns the full list with votes.
//   - Play button always visible (disabled while loading, not hidden).
//   - Time counter uses H:MM:SS (formatPosition) — prominent, always shown.

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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
  bandId: string;
  sessionId: string;
  sourceDurationMs: number;
  frozen: boolean;
  frozenVersionId?: string | null;
  canEdit: boolean;
  initialVersions: ClipVersion[];
  stamps: Stamp[];
}

interface CutMark {
  startMs: number;
  endMs: number;
  regionId: string;
}

// Minimal shape we need from a wavesurfer Region object
interface WsRegion {
  id: string;
  start: number;
  end: number;
  remove(): void;
  update(opts: { start?: number; end?: number; color?: string; drag?: boolean; resize?: boolean }): void;
}

interface DragState {
  startX: number;
  startSec: number;
  region: WsRegion | null;
}

// ─── Draft helpers ────────────────────────────────────────────────────────────

function draftKey(clipId: string) { return `odio:draft:${clipId}`; }

function loadDraft(clipId: string): Array<{ startMs: number; endMs: number }> | null {
  try {
    const raw = localStorage.getItem(draftKey(clipId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch { return null; }
}
function saveDraft(clipId: string, marks: Array<{ startMs: number; endMs: number }>) {
  try { localStorage.setItem(draftKey(clipId), JSON.stringify(marks)); } catch {}
}
function clearDraft(clipId: string) {
  try { localStorage.removeItem(draftKey(clipId)); } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WaveformEditor({
  clipId,
  bandId: _bandId,
  sessionId: _sessionId,
  sourceDurationMs,
  frozen,
  frozenVersionId,
  canEdit,
  initialVersions,
  stamps,
}: WaveformEditorProps) {
  const router = useRouter();

  // ── Refs ──────────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  // Refs used inside wavesurfer event callbacks to avoid stale closures
  const editModeRef = useRef(false);
  const cutMarksRef = useRef<CutMark[]>([]);                          // edit-mode cuts
  const selectedVersionCutsRef = useRef<Array<{ startMs: number; endMs: number }>>([]);  // view-mode cuts
  const dragStateRef = useRef<DragState | null>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [wsState, setWsState] = useState<"loading" | "ready" | "error">("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // Auto-select the latest version on mount
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    () => initialVersions.length > 0 ? initialVersions[initialVersions.length - 1].id : null,
  );
  const [versions, setVersions] = useState<ClipVersion[]>(initialVersions);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [cutMarks, setCutMarks] = useState<CutMark[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pruningId, setPruningId] = useState<string | null>(null);

  // Split mode
  const [splitMode, setSplitMode] = useState(false);
  const [splitMs, setSplitMs] = useState(0);
  const [splitSheetOpen, setSplitSheetOpen] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  // ── Ref sync effects ──────────────────────────────────────────────────────
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => { cutMarksRef.current = cutMarks; }, [cutMarks]);

  // Draft detection on mount
  useEffect(() => {
    if (!frozen && canEdit) {
      const draft = loadDraft(clipId);
      if (draft && draft.length > 0) setHasDraft(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save draft on cut-mark change
  useEffect(() => {
    if (!frozen && canEdit && draftRestored) {
      saveDraft(clipId, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })));
    }
  }, [clipId, cutMarks, frozen, canEdit, draftRestored]);

  // ── Region helpers ────────────────────────────────────────────────────────

  // Apply a version's cuts as blue, non-draggable regions (view mode)
  function applyVersionRegions(cuts: Array<{ startMs: number; endMs: number }>) {
    if (!regionsRef.current) return;
    regionsRef.current.clearRegions();
    cuts.forEach((m) => {
      regionsRef.current!.addRegion({
        start: m.startMs / 1000,
        end: m.endMs / 1000,
        color: "rgba(59, 130, 246, 0.2)",
        drag: false,
        resize: false,
      });
    });
  }

  // Apply cuts as draggable red regions and load them into edit state
  function applyEditRegions(marks: Array<{ startMs: number; endMs: number }>) {
    if (!wsRef.current || !regionsRef.current) return;
    regionsRef.current.clearRegions();
    const newMarks: CutMark[] = marks.map((m) => {
      const region = regionsRef.current!.addRegion({
        start: m.startMs / 1000,
        end: m.endMs / 1000,
        color: "rgba(239, 68, 68, 0.3)",
        drag: true,
        resize: true,
      });
      return { startMs: m.startMs, endMs: m.endMs, regionId: region.id };
    });
    setCutMarks(newMarks);
  }

  // ── Sync selected-version cuts to waveform (view mode) ───────────────────
  useEffect(() => {
    if (editMode) return; // edit mode manages its own regions
    const version = versions.find((v) => v.id === selectedVersionId);
    const cuts = version && Array.isArray(version.cutMarks)
      ? (version.cutMarks as Array<{ startMs: number; endMs: number }>)
      : [];
    selectedVersionCutsRef.current = cuts;
    if (wsState === "ready") applyVersionRegions(cuts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersionId, versions, wsState, editMode]);

  // ── Wavesurfer init ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: `/api/audio/${clipId}`,
      waveColor: "#3f3f46",
      progressColor: "#f59e0b",
      cursorColor: "#f59e0b",
      cursorWidth: 2,
      height: 88,
      normalize: true,
      interact: true, // click-to-seek; works because we don't use enableDragSelection
      plugins: [regions],
    });

    wsRef.current = ws;
    ws.on("ready", () => setWsState("ready"));
    ws.on("error", () => setWsState("error"));
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    ws.on("timeupdate", (time: number) => {
      const ms = time * 1000;
      setCurrentTimeMs(ms);
      // Skip-cuts: use edit cuts when in edit mode, selected-version cuts otherwise
      const activeCuts = editModeRef.current
        ? cutMarksRef.current
        : selectedVersionCutsRef.current;
      const hit = activeCuts.find((cm) => ms >= cm.startMs && ms < cm.endMs);
      if (hit && wsRef.current) wsRef.current.setTime(hit.endMs / 1000);
    });

    // Update cut marks when user drags/resizes an edit region
    // (NOT called for view-mode regions since they have drag:false, resize:false)
    regions.on("region-updated", (region) => {
      setCutMarks((prev) =>
        prev.map((cm) =>
          cm.regionId === region.id
            ? { ...cm, startMs: Math.round(region.start * 1000), endMs: Math.round(region.end * 1000) }
            : cm,
        ),
      );
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [clipId]);

  // ── Playback ──────────────────────────────────────────────────────────────
  function togglePlay() { wsRef.current?.playPause(); }

  // ── Edit mode: drag-to-create pointer handlers ────────────────────────────

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!wsRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const sec = progress * wsRef.current.getDuration();
    dragStateRef.current = { startX: e.clientX, startSec: sec, region: null };
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag || !wsRef.current || !regionsRef.current) return;
    const moved = Math.abs(e.clientX - drag.startX);
    if (moved < 8) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const currentSec = progress * wsRef.current.getDuration();
    const start = Math.min(drag.startSec, currentSec);
    const end = Math.max(drag.startSec, currentSec);

    if (drag.region) {
      drag.region.update({ start, end });
    } else {
      const region = regionsRef.current.addRegion({
        start, end,
        color: "rgba(239, 68, 68, 0.25)",
        drag: false, resize: false, // temporary; upgraded on dragEnd
      }) as unknown as WsRegion;
      dragStateRef.current = { ...drag, region };
    }
  }

  function handleDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag || !wsRef.current) return;
    dragStateRef.current = null;

    const moved = Math.abs(e.clientX - drag.startX);

    if (moved < 8) {
      // Tap — seek to position (wavesurfer seekTo is 0-1 progress)
      if (drag.region) drag.region.remove();
      const rect = e.currentTarget.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      wsRef.current.seekTo(progress);
    } else if (drag.region) {
      const { start, end } = drag.region;
      drag.region.remove(); // remove temp region

      if (end - start >= 0.05 && regionsRef.current) {
        // Commit as a proper draggable cut region
        const committed = regionsRef.current.addRegion({
          start, end,
          color: "rgba(239, 68, 68, 0.3)",
          drag: true, resize: true,
        }) as unknown as WsRegion;
        setCutMarks((prev) => [
          ...prev,
          { startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), regionId: committed.id },
        ]);
      }
    }
  }

  // ── Enter / exit edit mode ────────────────────────────────────────────────

  function enterEditMode(preseededCuts?: Array<{ startMs: number; endMs: number }>) {
    setSplitMode(false);
    setDraftRestored(true);
    setEditMode(true);

    // Pre-populate from provided cuts or from selected version
    const version = versions.find((v) => v.id === selectedVersionId);
    const baseCuts = preseededCuts ?? (
      version && Array.isArray(version.cutMarks)
        ? (version.cutMarks as Array<{ startMs: number; endMs: number }>)
        : []
    );
    applyEditRegions(baseCuts);
  }

  function exitEditMode() {
    setEditMode(false);
    setDraftRestored(false);
    setCutMarks([]);
    clearDraft(clipId);
    // Restore selected version's view regions (handled by effect when editMode → false)
  }

  function removeCut(regionId: string) {
    const region = regionsRef.current?.getRegions().find((r) => r.id === regionId);
    region?.remove();
    setCutMarks((prev) => prev.filter((cm) => cm.regionId !== regionId));
  }

  function clearAllCuts() {
    regionsRef.current?.clearRegions();
    setCutMarks([]);
  }

  // ── Draft restore ─────────────────────────────────────────────────────────

  function resumeDraft() {
    const draft = loadDraft(clipId);
    if (!draft) return;
    setHasDraft(false);
    enterEditMode(draft);
  }

  function dismissDraft() {
    clearDraft(clipId);
    setHasDraft(false);
  }

  // ── Trim shortcut ─────────────────────────────────────────────────────────

  function enterTrimMode() {
    const duration = wsRef.current?.getDuration();
    if (!duration) return;
    const trimSec = Math.min(5, duration * 0.1);
    enterEditMode([
      { startMs: 0, endMs: Math.round(trimSec * 1000) },
      { startMs: Math.round((duration - trimSec) * 1000), endMs: Math.round(duration * 1000) },
    ]);
  }

  // ── Split mode ────────────────────────────────────────────────────────────

  function enterSplitMode() {
    if (editMode) exitEditMode();
    setSplitMode(true);
    setSplitMs(currentTimeMs > 0 ? Math.round(currentTimeMs) : Math.round(sourceDurationMs / 2));
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
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setSplitError(body.error ?? "Split failed — please try again");
        setSplitting(false);
      }
    } catch {
      setSplitError("Network error — please try again");
      setSplitting(false);
    }
  }

  // ── Submit version ────────────────────────────────────────────────────────

  async function submitVersion() {
    setSubmitting(true);
    setSubmitError(null);
    const payload = cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs }));
    try {
      const res = await fetch(`/api/clips/${clipId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cutMarks: payload, description: description.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body.error ?? "Failed to submit version");
        setSubmitting(false);
        return;
      }
      const newVersion = await res.json();
      const updatedVersions = [...versions, newVersion];
      setVersions(updatedVersions);
      setSelectedVersionId(newVersion.id);
      setSubmitSheetOpen(false);
      setDescription("");
      setEditMode(false);
      setDraftRestored(false);
      setCutMarks([]);
      clearDraft(clipId);
      router.refresh();
    } catch {
      setSubmitError("Network error — please try again");
      setSubmitting(false);
    }
  }

  // ── Prune version ─────────────────────────────────────────────────────────

  const pruneVersion = useCallback(async (versionId: string) => {
    setPruningId(versionId);
    const res = await fetch(`/api/clips/${clipId}/versions/${versionId}`, { method: "DELETE" });
    if (res.ok) {
      setVersions((prev) => {
        const next = prev.filter((v) => v.id !== versionId);
        // If we pruned the selected version, select the new latest
        if (versionId === selectedVersionId) {
          setSelectedVersionId(next.length > 0 ? next[next.length - 1].id : null);
        }
        return next;
      });
    }
    setPruningId(null);
  }, [clipId, selectedVersionId]);

  // ── Derived values ────────────────────────────────────────────────────────

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? null;

  // In edit mode, show the edit buffer's result duration; otherwise selected version's
  const activeDurationMs = editMode
    ? calcResultDuration(sourceDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })))
    : (selectedVersion?.resultDurationMs ?? sourceDurationMs);

  const splitLinePercent = sourceDurationMs > 0
    ? Math.min(99, Math.max(1, (splitMs / sourceDurationMs) * 100))
    : 50;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">

      {/* ── Draft restore banner ── */}
      {hasDraft && !editMode && !splitMode && (
        <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary">You have unsaved edits</p>
            <p className="text-xs text-muted">Resume your draft cuts?</p>
          </div>
          <button onClick={resumeDraft} className="shrink-0 text-xs font-medium text-accent">Resume</button>
          <button onClick={dismissDraft} className="shrink-0 text-xs text-muted">Dismiss</button>
        </div>
      )}

      {/* ── Waveform card ── */}
      <div className="rounded-2xl bg-surface overflow-hidden">
        {/* Time header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <span className="font-mono text-2xl font-semibold text-primary tabular-nums leading-none">
            {formatPosition(currentTimeMs)}
          </span>
          <div className="text-right">
            <span className="font-mono text-sm text-muted tabular-nums">
              {editMode
                ? formatDurationDiff(sourceDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })))
                : selectedVersion
                  ? formatPosition(activeDurationMs)
                  : formatPosition(sourceDurationMs)}
            </span>
            {!editMode && selectedVersion && (
              <span className="ml-1.5 font-mono text-xs text-blue-400">
                v{selectedVersion.versionNumber}
              </span>
            )}
          </div>
        </div>

        {/* Waveform + drag overlay */}
        <div className="px-4 pb-3">
          <div className="relative">
            <div ref={containerRef} className="w-full" />

            {/* Drag-to-create overlay — only present in edit mode. Absence = wavesurfer click-to-seek works. */}
            {editMode && wsState === "ready" && (
              <div
                className="absolute inset-0 cursor-crosshair"
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
              />
            )}

            {/* Split position indicator */}
            {splitMode && wsState === "ready" && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-amber-400/80"
                style={{ left: `${splitLinePercent}%` }}
              />
            )}
          </div>

          {wsState === "loading" && (
            <div className="flex items-center justify-center h-[88px]">
              <span className="size-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            </div>
          )}
          {wsState === "error" && (
            <div className="flex items-center justify-center h-[88px]">
              <p className="text-sm text-danger text-center px-4">
                Audio unavailable — Drive connection may need renewal
              </p>
            </div>
          )}

          {/* Stamps */}
          {stamps.length > 0 && wsState === "ready" && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
              {stamps.map((stamp) => (
                <div
                  key={stamp.id}
                  className="flex-shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                  style={{ backgroundColor: `${STAMP_COLORS[stamp.type]}20`, color: STAMP_COLORS[stamp.type] }}
                >
                  <span>{STAMP_EMOJI[stamp.type]}</span>
                  <span className="font-mono">{formatDuration(stamp.timestampMs)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Play button ── */}
      <div className="flex items-center justify-center gap-5 py-1">
        <button
          onClick={togglePlay}
          disabled={wsState !== "ready"}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-base shadow-lg shadow-accent/25 transition-transform active:scale-90 disabled:opacity-40 disabled:shadow-none"
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" aria-hidden>
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" aria-hidden>
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        {/* "Mark here" in split mode — lives next to the play button */}
        {splitMode && wsState === "ready" && (
          <button
            onClick={() => setSplitMs(Math.round(currentTimeMs))}
            className="rounded-full bg-amber-400/20 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-400/30 transition-colors"
          >
            Mark here
          </button>
        )}

        {(cutMarks.length > 0 || (selectedVersion && (selectedVersion.cutMarks as unknown[]).length > 0)) && isPlaying && !splitMode && (
          <span className="text-xs text-muted absolute">skipping cuts</span>
        )}
      </div>

      {/* ── Version pills ── (always shown — both detail and edit pages) */}
      {versions.length > 0 && !editMode && (
        <div className="flex gap-2 flex-wrap">
          {versions.map((v) => {
            const isSelected = v.id === selectedVersionId;
            const cuts = Array.isArray(v.cutMarks)
              ? (v.cutMarks as Array<{ startMs: number; endMs: number }>)
              : [];
            const dur = v.resultDurationMs ?? (cuts.length === 0 ? sourceDurationMs : null);
            return (
              <button
                key={v.id}
                onClick={() => setSelectedVersionId(isSelected ? null : v.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isSelected
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                    : "bg-surface text-muted hover:text-secondary"
                }`}
              >
                <span>v{v.versionNumber}</span>
                {dur != null && (
                  <span className={`font-mono ${isSelected ? "text-blue-400" : "text-muted"}`}>
                    {formatDuration(dur)}
                  </span>
                )}
                {cuts.length > 0 && (
                  <span className={isSelected ? "text-blue-400/70" : "text-muted/70"}>
                    {cuts.length}✂
                  </span>
                )}
                {/* Prune button — only on non-v1, not frozen, not selected for freeze */}
                {canEdit && !frozen && v.versionNumber > 1 && v.id !== frozenVersionId && (
                  <span
                    role="button"
                    aria-label={`Delete v${v.versionNumber}`}
                    onClick={(e) => { e.stopPropagation(); pruneVersion(v.id); }}
                    className="ml-0.5 text-muted/50 hover:text-danger transition-colors"
                  >
                    {pruningId === v.id ? (
                      <span className="size-2.5 rounded-full border border-danger border-t-transparent animate-spin inline-block" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-2.5" aria-hidden>
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    )}
                  </span>
                )}
              </button>
            );
          })}

          {/* "Raw" pill to deselect all versions */}
          {selectedVersionId !== null && (
            <button
              onClick={() => setSelectedVersionId(null)}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted/60 hover:text-muted transition-colors bg-surface"
            >
              raw
            </button>
          )}
        </div>
      )}

      {/* ── Edit cut marks list ── */}
      {editMode && cutMarks.length > 0 && (
        <div className="rounded-2xl bg-surface px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-secondary uppercase tracking-wide">
              Cuts ({cutMarks.length})
            </p>
            <button onClick={clearAllCuts} className="text-xs text-danger underline underline-offset-2">
              Clear all
            </button>
          </div>
          {cutMarks.map((cm) => (
            <div key={cm.regionId} className="flex items-center">
              <span className="font-mono text-sm text-primary">
                {formatPosition(cm.startMs)} – {formatPosition(cm.endMs)}
              </span>
              <span className="font-mono text-xs text-muted ml-2 mr-auto">
                −{formatDuration(cm.endMs - cm.startMs)}
              </span>
              <button
                onClick={() => removeCut(cm.regionId)}
                aria-label="Remove cut"
                className="p-1.5 text-muted hover:text-danger transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Split controls panel ── */}
      {splitMode && wsState === "ready" && (
        <div className="rounded-2xl bg-surface px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-secondary uppercase tracking-wide">Split song here</p>
            <span className="font-mono text-xs text-amber-400">{formatPosition(splitMs)}</span>
          </div>
          <div className="flex gap-4 text-xs text-muted font-mono">
            <span>A: 0:00:00 – {formatPosition(splitMs)}</span>
            <span className="text-muted/50">·</span>
            <span>B: {formatPosition(splitMs)} – {formatPosition(sourceDurationMs)}</span>
          </div>
          <p className="text-xs text-muted">
            Play to the split point, tap <span className="text-primary">Mark here</span>, then confirm.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setSplitSheetOpen(true)} fullWidth>Split here</Button>
            <Button onClick={() => { setSplitMode(false); setSplitError(null); }} variant="ghost" fullWidth>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Edit / Trim / Split action row ── */}
      {canEdit && !frozen && wsState === "ready" && !splitMode && (
        <div className="space-y-2">
          {!editMode ? (
            <div className="flex gap-2">
              <Button
                onClick={() => enterEditMode()}
                variant="secondary"
                fullWidth
              >
                Edit cuts
              </Button>
              <button
                onClick={enterTrimMode}
                title="Trim start / end"
                aria-label="Trim start and end"
                className="flex items-center justify-center rounded-2xl bg-surface px-4 text-muted hover:text-primary transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
                  <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                  <line x1="20" y1="4" x2="8.12" y2="15.88" />
                  <line x1="14.47" y1="14.48" x2="20" y2="20" />
                  <line x1="8.12" y1="8.12" x2="12" y2="12" />
                </svg>
              </button>
              <button
                onClick={enterSplitMode}
                title="Split into two songs"
                aria-label="Split into two songs"
                className="flex items-center justify-center rounded-2xl bg-surface px-4 text-muted hover:text-primary transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
                  <line x1="12" y1="3" x2="12" y2="10" />
                  <path d="M12 10 C12 10 7 12 7 17" />
                  <path d="M12 10 C12 10 17 12 17 17" />
                  <circle cx="7" cy="19" r="2" /><circle cx="17" cy="19" r="2" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <Button
                onClick={() => setSubmitSheetOpen(true)}
                disabled={cutMarks.length === 0}
                fullWidth
              >
                Submit edit
                {cutMarks.length > 0 && (
                  <span className="ml-1.5 opacity-70 font-mono text-xs">
                    → {formatPosition(calcResultDuration(sourceDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs }))))}
                  </span>
                )}
              </Button>
              <Button onClick={exitEditMode} variant="ghost" fullWidth>Cancel</Button>
              {cutMarks.length === 0 && (
                <p className="text-center text-xs text-muted">
                  Drag on the waveform to mark regions to cut
                </p>
              )}
            </>
          )}
        </div>
      )}

      {frozen && (
        <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-accent flex-shrink-0" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p className="text-sm text-secondary">Frozen — editing disabled.</p>
        </div>
      )}

      {/* ── Submit description sheet ── */}
      <BottomSheet open={submitSheetOpen} onClose={() => setSubmitSheetOpen(false)} title="Submit edit">
        <div className="space-y-4">
          <div className="rounded-xl bg-elevated px-4 py-3">
            <p className="text-sm text-secondary">
              {cutMarks.length} cut{cutMarks.length !== 1 ? "s" : ""} ·{" "}
              <span className="font-mono">
                {formatDurationDiff(sourceDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })))}
              </span>
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted" htmlFor="version-desc">Description (optional)</label>
            <input
              id="version-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitVersion()}
              placeholder="Cut the dead air at the start"
              maxLength={200}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
          {submitError && <p className="text-sm text-danger">{submitError}</p>}
          <Button onClick={submitVersion} disabled={submitting} fullWidth>
            {submitting ? "Submitting…" : "Submit version"}
          </Button>
          <Button onClick={() => setSubmitSheetOpen(false)} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </BottomSheet>

      {/* ── Split confirmation sheet ── */}
      <BottomSheet open={splitSheetOpen} onClose={() => setSplitSheetOpen(false)} title="Split into two songs">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="rounded-xl bg-elevated px-4 py-3 flex items-center gap-3">
              <span className="text-xs font-medium text-secondary w-14 shrink-0">Part A</span>
              <span className="font-mono text-sm text-primary">0:00:00 – {formatPosition(splitMs)}</span>
              <span className="font-mono text-xs text-muted ml-auto">{formatDuration(splitMs)}</span>
            </div>
            <div className="rounded-xl bg-elevated px-4 py-3 flex items-center gap-3">
              <span className="text-xs font-medium text-secondary w-14 shrink-0">Part B</span>
              <span className="font-mono text-sm text-primary">{formatPosition(splitMs)} – {formatPosition(sourceDurationMs)}</span>
              <span className="font-mono text-xs text-muted ml-auto">{formatDuration(sourceDurationMs - splitMs)}</span>
            </div>
          </div>
          <p className="text-xs text-muted">
            Part B becomes a new clip with a death metal name. Both share the same source audio until frozen.
          </p>
          {splitError && <p className="text-sm text-danger">{splitError}</p>}
          <Button onClick={handleSplit} disabled={splitting} fullWidth>
            {splitting ? "Splitting…" : "Confirm split"}
          </Button>
          <Button onClick={() => setSplitSheetOpen(false)} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </BottomSheet>
    </div>
  );
}
