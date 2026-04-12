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
// Click-to-seek works outside drag interactions because we use a manual
// pointer overlay instead of wavesurfer's enableDragSelection().

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
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

  // State
  const [wsState, setWsState] = useState<"loading" | "ready" | "error">("loading");
  const [audioErrorStatus, setAudioErrorStatus] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [cutMarks, setCutMarks] = useState<CutMark[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
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

  // ── Region helpers ────────────────────────────────────────────────────────

  function addEditRegion(startSec: number, endSec: number): WsRegion | null {
    if (!regionsRef.current) return null;
    const region = regionsRef.current.addRegion({
      start: startSec, end: endSec,
      color: "rgba(239, 68, 68, 0.3)",
      drag: true, resize: true,
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
    setCutMarks(next);
  }

  // ── Wavesurfer init ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    setWsState("loading");
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
      interact: true,
      plugins: [regions],
    });

    wsRef.current = ws;
    ws.on("ready", () => setWsState("ready"));
    ws.on("error", () => {
      fetch(`/api/audio/${clipId}`, { method: "HEAD" })
        .then((r) => setAudioErrorStatus(r.status))
        .catch(() => setAudioErrorStatus(null))
        .finally(() => setWsState("error"));
    });
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => {
      setIsPlaying(false);
      // Reset cursor to the beginning so the waveform looks clean at rest.
      ws.setTime(0);
    });
    ws.on("timeupdate", (time: number) => {
      const ms = time * 1000;
      setCurrentTimeMs(Math.min(ms, sourceDurationMs));
      // Only skip cut-preview during active playback — not during seeks while paused.
      if (!ws.isPlaying()) return;
      // Stop if playback reaches the DB-recorded clip boundary (Drive file may be longer)
      if (ms >= sourceDurationMs) {
        ws.pause();
        ws.setTime(0);
        return;
      }
      const hit = cutMarksRef.current.find((cm) => ms >= cm.startMs && ms < cm.endMs);
      if (hit && wsRef.current) {
        const targetSec = hit.endMs / 1000;
        if (targetSec >= sourceDurationMs / 1000 - 0.3) {
          ws.pause();
          ws.setTime(hit.startMs / 1000);
        } else {
          ws.setTime(targetSec);
        }
      }
    });

    regions.on("region-updated", (region) => {
      setCutMarks((prev) => prev.map((cm) =>
        cm.regionId === region.id
          ? { ...cm, startMs: Math.round(region.start * 1000), endMs: Math.round(region.end * 1000) }
          : cm,
      ));
    });

    return () => { ws.destroy(); wsRef.current = null; };
  }, [clipId, retryKey]);

  // ── Drag-to-create overlay ────────────────────────────────────────────────

  // Use sourceDurationMs as the authoritative clip length for all position maths.
  // ws.getDuration() can return the wrong value if the Drive file has stale/wrong
  // content (e.g. from a pre-fix split upload). The DB value is always correct.
  const clipDurationSec = sourceDurationMs / 1000;

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!wsRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const sec = Math.max(0, Math.min(clipDurationSec, (e.clientX - rect.left) / rect.width * clipDurationSec));
    dragStateRef.current = { startX: e.clientX, startSec: sec, region: null };
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag || !wsRef.current || !regionsRef.current) return;
    if (Math.abs(e.clientX - drag.startX) < 8) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const sec = Math.max(0, Math.min(clipDurationSec, (e.clientX - rect.left) / rect.width * clipDurationSec));
    const [start, end] = [Math.min(drag.startSec, sec), Math.max(drag.startSec, sec)];

    if (drag.region) {
      drag.region.update({ start, end });
    } else {
      const r = regionsRef.current.addRegion({ start, end, color: "rgba(239, 68, 68, 0.2)", drag: false, resize: false }) as unknown as WsRegion;
      dragStateRef.current = { ...drag, region: r };
    }
  }

  function handleDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag || !wsRef.current) return;
    dragStateRef.current = null;

    if (Math.abs(e.clientX - drag.startX) < 8) {
      // Tap — seek (clamped to actual clip duration so we never seek past the end)
      if (drag.region) drag.region.remove();
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const wsDur = wsRef.current.getDuration();
      // If ws duration is longer than sourceDurationMs, clamp the seek position
      const targetSec = fraction * clipDurationSec;
      wsRef.current.setTime(Math.min(targetSec, wsDur));
    } else if (drag.region) {
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
  }

  function clearAllCuts() {
    regionsRef.current?.clearRegions();
    setCutMarks([]);
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
    if (!sourceDurationMs) return;
    const t = Math.min(5, clipDurationSec * 0.1);
    loadCutsIntoEditor([
      { startMs: 0, endMs: Math.round(t * 1000) },
      { startMs: Math.round((clipDurationSec - t) * 1000), endMs: sourceDurationMs },
    ]);
  }

  // ── Split mode ────────────────────────────────────────────────────────────

  function enterSplitMode() {
    setSplitMode(true);
    const pos = Math.min(Math.round(currentTimeMs), sourceDurationMs - 1);
    setSplitMs(pos > 0 ? pos : Math.round(sourceDurationMs / 2));
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
      // Clamp any stale draft cuts that exceed the clip's actual duration (e.g. from
      // a split clip whose Drive file had wrong content before the upload fix).
      const validCuts = cutMarks
        .map(({ startMs, endMs, regionId }) => ({
          startMs: Math.max(0, Math.min(startMs, sourceDurationMs)),
          endMs: Math.max(0, Math.min(endMs, sourceDurationMs)),
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

  const resultDurationMs = calcResultDuration(sourceDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })));
  const splitLinePercent = sourceDurationMs > 0 ? Math.min(99, Math.max(1, (splitMs / sourceDurationMs) * 100)) : 50;

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

      {/* Player card */}
      <div className="rounded-2xl bg-surface overflow-hidden">
        {/* Clock */}
        <div className="px-5 pt-5 flex items-baseline justify-between">
          <span className="font-mono text-3xl font-semibold text-primary tabular-nums leading-none tracking-tight">
            {formatPosition(currentTimeMs)}
          </span>
          <span className="font-mono text-sm text-muted tabular-nums">
            {cutMarks.length > 0
              ? formatDurationDiff(sourceDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })))
              : formatPosition(sourceDurationMs)}
          </span>
        </div>

        {/* Waveform + drag overlay */}
        <div className="px-5 pt-3 pb-1">
          <div className="relative">
            <div ref={containerRef} className="w-full" />

            {/* Drag overlay — captures pointer events; tap = seek, drag = create region */}
            {wsState === "ready" && !splitMode && (
              <div
                className="absolute inset-0 cursor-crosshair touch-none"
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
              />
            )}

            {/* Split position line */}
            {splitMode && wsState === "ready" && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-amber-400/80"
                style={{ left: `${splitLinePercent}%` }}
              />
            )}
          </div>

          {wsState === "loading" && (
            <div className="h-[88px] flex items-center justify-center">
              <span className="size-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            </div>
          )}
          {wsState === "error" && (
            <div className="h-[88px] flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-muted text-center leading-snug">
                {audioErrorStatus === 404
                  ? "Audio not yet available — upload may still be processing"
                  : audioErrorStatus === 401 || audioErrorStatus === 503
                    ? "Drive connection needs renewal"
                    : "Audio unavailable"}
              </p>
              <div className="flex items-center gap-3">
                {(audioErrorStatus === 401 || audioErrorStatus === 503) && (
                  <a
                    href="/login"
                    className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-medium text-white"
                  >
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

        {/* Stamps — tappable to seek, same as WaveformPlayer */}
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
            <button onClick={() => setSplitMs(Math.round(currentTimeMs))}
              className="rounded-full bg-amber-400/20 px-4 py-2.5 text-sm font-semibold text-amber-400 hover:bg-amber-400/30 transition-colors">
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
        <div className="rounded-2xl bg-surface px-5 py-4 space-y-3">
          <p className="text-sm font-semibold text-secondary uppercase tracking-wide">
            Cuts ({cutMarks.length}) · {formatPosition(resultDurationMs)} result
          </p>
          {cutMarks.map((cm) => (
            <div key={cm.regionId} className="flex items-center gap-2">
              <span className="font-mono text-sm text-primary flex-1">
                {formatPosition(cm.startMs)} – {formatPosition(cm.endMs)}
              </span>
              <span className="font-mono text-xs text-muted">
                −{formatDuration(cm.endMs - cm.startMs)}
              </span>
              <button onClick={() => removeCut(cm.regionId)} aria-label="Remove cut"
                className="p-1.5 text-muted hover:text-danger transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
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
              const dur = v.resultDurationMs ?? (cuts.length === 0 ? sourceDurationMs : null);
              const canPrune = v.versionNumber > 1 && v.id !== frozenVersionId;
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
              <span className="font-mono">{formatDurationDiff(sourceDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })))}</span>
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
              <span className="font-mono text-sm text-muted ml-auto">{formatDuration(sourceDurationMs - splitMs)}</span>
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
