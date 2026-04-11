"use client";

// Waveform editor — client component.
// Loads audio via the /api/audio/[clipId] proxy, renders wavesurfer.js 7.x,
// lets the user drag to add cut regions, then submit a new version.
//
// State machine: loading → ready → playing | paused
// Edit mode: user drags on the waveform to mark regions to cut (red).
// Skip-cuts preview: during playback, the cursor automatically skips over
//   cut regions so the preview sounds like the final render.
// localStorage draft: cut marks saved on every change; restored on reopen.
// "Edit from this version": loads an existing version's cuts into the editor.

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  formatDuration,
  formatDurationDiff,
  calcResultDuration,
} from "@/lib/utils";
import { STAMP_COLORS, STAMP_EMOJI } from "@/types";
import type { ClipVersion, Stamp } from "@/types";

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

function draftKey(clipId: string) {
  return `odio:draft:${clipId}`;
}

function loadDraft(clipId: string): Array<{ startMs: number; endMs: number }> | null {
  try {
    const raw = localStorage.getItem(draftKey(clipId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(clipId: string, marks: Array<{ startMs: number; endMs: number }>) {
  try {
    localStorage.setItem(draftKey(clipId), JSON.stringify(marks));
  } catch {
    // Storage quota — silently ignore
  }
}

function clearDraft(clipId: string) {
  try {
    localStorage.removeItem(draftKey(clipId));
  } catch {}
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const editModeRef = useRef(false);
  // Keep cut marks in a ref for the timeupdate handler (avoids stale closure)
  const cutMarksRef = useRef<CutMark[]>([]);

  const [wsState, setWsState] = useState<"loading" | "ready" | "error">("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [cutMarks, setCutMarks] = useState<CutMark[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [versions, setVersions] = useState<ClipVersion[]>(initialVersions);
  const [pruningId, setPruningId] = useState<string | null>(null);
  // Draft restore banner: shown when a localStorage draft exists on first render
  const [hasDraft, setHasDraft] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Check for saved draft on mount
  useEffect(() => {
    if (!frozen && canEdit) {
      const draft = loadDraft(clipId);
      if (draft && draft.length > 0) {
        setHasDraft(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep cutMarksRef in sync for skip-cuts handler
  useEffect(() => {
    cutMarksRef.current = cutMarks;
  }, [cutMarks]);

  // Save draft on cut mark change
  useEffect(() => {
    if (!frozen && canEdit && draftRestored) {
      saveDraft(clipId, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })));
    }
  }, [clipId, cutMarks, frozen, canEdit, draftRestored]);

  function applyDraftToEditor(marks: Array<{ startMs: number; endMs: number }>) {
    if (!wsRef.current || !regionsRef.current) return;
    const duration = wsRef.current.getDuration();
    if (!duration) return;

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

  function resumeDraft() {
    const draft = loadDraft(clipId);
    if (!draft) return;
    setHasDraft(false);
    setDraftRestored(true);
    setEditMode(true);
    // Apply after waveform is ready; if already ready, apply immediately
    if (wsState === "ready") {
      applyDraftToEditor(draft);
    }
  }

  function dismissDraft() {
    clearDraft(clipId);
    setHasDraft(false);
  }

  // Initialize wavesurfer
  useEffect(() => {
    if (!containerRef.current) return;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: `/api/audio/${clipId}`,
      waveColor: "#525252",
      progressColor: "#f59e0b",
      cursorColor: "#f59e0b",
      cursorWidth: 2,
      height: 80,
      normalize: true,
      interact: true,
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

      // Skip-cuts preview: if cursor falls inside a cut region, jump to its end
      const activeCut = cutMarksRef.current.find(
        (cm) => ms >= cm.startMs && ms < cm.endMs,
      );
      if (activeCut && wsRef.current) {
        wsRef.current.setTime(activeCut.endMs / 1000);
      }
    });

    // Enable drag-to-create regions; gate acceptance via editModeRef
    regions.enableDragSelection({ color: "rgba(239, 68, 68, 0.3)" });

    // Region drag-created by user — only accepted in edit mode
    regions.on("region-created", (region) => {
      if (!editModeRef.current) {
        region.remove();
        return;
      }
      setCutMarks((prev) => [
        ...prev,
        {
          startMs: Math.round(region.start * 1000),
          endMs: Math.round(region.end * 1000),
          regionId: region.id,
        },
      ]);
    });

    regions.on("region-updated", (region) => {
      setCutMarks((prev) =>
        prev.map((cm) =>
          cm.regionId === region.id
            ? {
                ...cm,
                startMs: Math.round(region.start * 1000),
                endMs: Math.round(region.end * 1000),
              }
            : cm,
        ),
      );
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [clipId]);

  // Keep editModeRef in sync with state so the region-created handler can check it
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  function togglePlay() {
    wsRef.current?.playPause();
  }

  function removeCut(regionId: string) {
    const region = regionsRef.current
      ?.getRegions()
      .find((r) => r.id === regionId);
    region?.remove();
    setCutMarks((prev) => prev.filter((cm) => cm.regionId !== regionId));
  }

  function clearAllCuts() {
    regionsRef.current?.clearRegions();
    setCutMarks([]);
  }

  // Load an existing version's cuts into the editor ("Edit from this version")
  const editFromVersion = useCallback((version: ClipVersion) => {
    const marks = Array.isArray(version.cutMarks)
      ? (version.cutMarks as Array<{ startMs: number; endMs: number }>)
      : [];
    setHasDraft(false);
    setDraftRestored(true);
    setEditMode(true);
    applyDraftToEditor(marks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitVersion() {
    setSubmitting(true);
    setSubmitError(null);

    const payload = cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs }));

    try {
      const res = await fetch(`/api/clips/${clipId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cutMarks: payload,
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body.error ?? "Failed to submit version");
        setSubmitting(false);
        return;
      }

      const newVersion = await res.json();
      setVersions((prev) => [...prev, newVersion]);
      setSubmitSheetOpen(false);
      setDescription("");
      setEditMode(false);
      setDraftRestored(false);
      clearAllCuts();
      clearDraft(clipId);
      router.refresh();
    } catch {
      setSubmitError("Network error — please try again");
      setSubmitting(false);
    }
  }

  const pruneVersion = useCallback(async (versionId: string) => {
    setPruningId(versionId);
    const res = await fetch(`/api/clips/${clipId}/versions/${versionId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setVersions((prev) => prev.filter((v) => v.id !== versionId));
    }
    setPruningId(null);
  }, [clipId]);

  const resultDurationMs = calcResultDuration(
    sourceDurationMs,
    cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })),
  );

  const durationDisplay =
    cutMarks.length > 0
      ? formatDurationDiff(sourceDurationMs, cutMarks.map(({ startMs, endMs }) => ({ startMs, endMs })))
      : formatDuration(sourceDurationMs);

  return (
    <div className="flex flex-col gap-4">
      {/* Draft restore banner */}
      {hasDraft && !editMode && (
        <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-primary">You have unsaved edits</p>
            <p className="text-xs text-muted">Resume your draft cuts?</p>
          </div>
          <button
            onClick={resumeDraft}
            className="text-xs font-medium text-accent"
          >
            Resume
          </button>
          <button
            onClick={dismissDraft}
            className="text-xs text-muted"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Waveform */}
      <div className="rounded-2xl bg-surface px-4 py-4 overflow-hidden">
        {/* Duration / time display */}
        <div className="flex items-baseline justify-between mb-3">
          <span className="font-mono text-sm text-secondary">
            {formatDuration(currentTimeMs)}
          </span>
          <span className="font-mono text-xs text-muted">{durationDisplay}</span>
        </div>

        {/* Wavesurfer container */}
        <div ref={containerRef} className="w-full" />

        {wsState === "loading" && (
          <div className="flex items-center justify-center h-20">
            <span className="size-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        )}

        {wsState === "error" && (
          <div className="flex items-center justify-center h-20">
            <p className="text-sm text-danger">
              Audio unavailable — Drive connection may need renewal
            </p>
          </div>
        )}

        {/* Stamp markers (visual only — displayed below waveform) */}
        {stamps.length > 0 && wsState === "ready" && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
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

      {/* Playback controls */}
      {wsState === "ready" && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-base shadow-lg shadow-accent/20 transition-transform active:scale-90"
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6 text-base" aria-hidden>
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6 text-base" aria-hidden>
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>

          {cutMarks.length > 0 && isPlaying && (
            <span className="text-xs text-muted">skipping cuts</span>
          )}
        </div>
      )}

      {/* Cut marks list */}
      {cutMarks.length > 0 && (
        <div className="rounded-2xl bg-surface px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-secondary uppercase tracking-wide">
              Cuts ({cutMarks.length})
            </p>
            <button
              onClick={clearAllCuts}
              className="text-xs text-danger underline underline-offset-2"
            >
              Clear all
            </button>
          </div>
          {cutMarks.map((cm) => (
            <div key={cm.regionId} className="flex items-center justify-between">
              <span className="font-mono text-sm text-primary">
                {formatDuration(cm.startMs)} – {formatDuration(cm.endMs)}
              </span>
              <span className="font-mono text-xs text-muted mr-auto ml-3">
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

      {/* Edit / Submit actions */}
      {canEdit && !frozen && wsState === "ready" && (
        <div className="space-y-2">
          {!editMode ? (
            <Button
              onClick={() => { setEditMode(true); setDraftRestored(true); }}
              variant="secondary"
              fullWidth
            >
              Edit — add cuts
            </Button>
          ) : (
            <>
              <Button
                onClick={() => setSubmitSheetOpen(true)}
                disabled={cutMarks.length === 0}
                fullWidth
              >
                Submit edit
                {cutMarks.length > 0 && (
                  <span className="ml-1 opacity-70">
                    ({formatDuration(resultDurationMs)} result)
                  </span>
                )}
              </Button>
              <Button
                onClick={() => {
                  setEditMode(false);
                  setDraftRestored(false);
                  clearAllCuts();
                  clearDraft(clipId);
                }}
                variant="ghost"
                fullWidth
              >
                Cancel
              </Button>
            </>
          )}
          {editMode && cutMarks.length === 0 && (
            <p className="text-center text-xs text-muted">
              Drag on the waveform to mark regions to cut
            </p>
          )}
        </div>
      )}

      {frozen && (
        <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-accent flex-shrink-0" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p className="text-sm text-secondary">
            This clip is frozen — editing is disabled.
          </p>
        </div>
      )}

      {/* Versions list */}
      {versions.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-medium text-secondary uppercase tracking-wide">
            Versions
          </p>
          {versions.map((v) => (
            <VersionRow
              key={v.id}
              version={v}
              allVersions={versions}
              clipId={clipId}
              sourceDurationMs={sourceDurationMs}
              canPrune={canEdit && !frozen && v.versionNumber > 1 && v.id !== frozenVersionId}
              canEditFrom={canEdit && !frozen && wsState === "ready"}
              pruning={pruningId === v.id}
              onPrune={pruneVersion}
              onEditFrom={editFromVersion}
            />
          ))}
        </div>
      )}

      {/* Submit description sheet */}
      <BottomSheet
        open={submitSheetOpen}
        onClose={() => setSubmitSheetOpen(false)}
        title="Submit edit"
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-elevated px-4 py-3">
            <p className="text-sm text-secondary">
              {cutMarks.length} cut{cutMarks.length !== 1 ? "s" : ""} ·{" "}
              <span className="font-mono">{durationDisplay}</span>
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted" htmlFor="version-desc">
              Description (optional)
            </label>
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

          {submitError && (
            <p className="text-sm text-danger">{submitError}</p>
          )}

          <Button onClick={submitVersion} disabled={submitting} fullWidth>
            {submitting ? "Submitting…" : "Submit version"}
          </Button>
          <Button
            onClick={() => setSubmitSheetOpen(false)}
            variant="ghost"
            fullWidth
          >
            Cancel
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

// ─── Version Row ──────────────────────────────────────────────────────────────

function VersionRow({
  version,
  allVersions,
  clipId: _clipId,
  sourceDurationMs,
  canPrune,
  canEditFrom,
  pruning,
  onPrune,
  onEditFrom,
}: {
  version: ClipVersion;
  allVersions: ClipVersion[];
  clipId: string;
  sourceDurationMs: number;
  canPrune: boolean;
  canEditFrom: boolean;
  pruning: boolean;
  onPrune: (versionId: string) => void;
  onEditFrom: (version: ClipVersion) => void;
}) {
  const versionDate = new Date(version.createdAt);
  const cutMarks = Array.isArray(version.cutMarks)
    ? (version.cutMarks as Array<{ startMs: number; endMs: number }>)
    : [];

  // Compute diff vs parent version
  const parentVersion = version.fromVersionId
    ? allVersions.find((v) => v.id === version.fromVersionId)
    : allVersions.find((v) => v.versionNumber === version.versionNumber - 1);

  const parentCuts = parentVersion && Array.isArray(parentVersion.cutMarks)
    ? (parentVersion.cutMarks as Array<{ startMs: number; endMs: number }>)
    : [];

  // Simplified diff: cuts added vs removed vs unchanged
  const addedCuts = cutMarks.filter(
    (cm) => !parentCuts.some((p) => Math.abs(p.startMs - cm.startMs) < 500 && Math.abs(p.endMs - cm.endMs) < 500),
  );
  const removedCuts = parentCuts.filter(
    (p) => !cutMarks.some((cm) => Math.abs(cm.startMs - p.startMs) < 500 && Math.abs(cm.endMs - p.endMs) < 500),
  );

  const hasDiff = (addedCuts.length > 0 || removedCuts.length > 0) && parentVersion != null;

  // Duration diff
  const parentDuration = parentVersion?.resultDurationMs ?? sourceDurationMs;
  const thisDuration = version.resultDurationMs ?? sourceDurationMs;
  const durationDiff = thisDuration - parentDuration;

  return (
    <div className="rounded-xl bg-surface px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="default">v{version.versionNumber}</Badge>
          {version.resultDurationMs != null && (
            <span className="font-mono text-xs text-muted">
              {formatDuration(version.resultDurationMs)}
            </span>
          )}
          {cutMarks.length > 0 && (
            <span className="text-xs text-muted">
              {cutMarks.length} cut{cutMarks.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">
            {versionDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>

          {/* Edit from this version */}
          {canEditFrom && (
            <button
              onClick={() => onEditFrom(version)}
              title="Edit from this version"
              className="p-1 text-muted hover:text-accent transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}

          {/* Prune button */}
          {canPrune && (
            <button
              onClick={() => onPrune(version.id)}
              disabled={pruning}
              aria-label={`Delete version ${version.versionNumber}`}
              className="p-1 text-muted hover:text-danger transition-colors disabled:opacity-40"
            >
              {pruning ? (
                <span className="size-3.5 rounded-full border-2 border-danger border-t-transparent animate-spin inline-block" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {version.description && (
        <p className="mt-1 text-sm text-secondary">{version.description}</p>
      )}

      {/* Version diff vs parent */}
      {hasDiff && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {addedCuts.length > 0 && (
            <span className="text-xs text-success">
              +{addedCuts.length} cut{addedCuts.length !== 1 ? "s" : ""}
            </span>
          )}
          {removedCuts.length > 0 && (
            <span className="text-xs text-danger">
              −{removedCuts.length} cut{removedCuts.length !== 1 ? "s" : ""}
            </span>
          )}
          {durationDiff !== 0 && (
            <span className={`font-mono text-xs ${durationDiff < 0 ? "text-success" : "text-muted"}`}>
              {durationDiff < 0 ? "−" : "+"}{formatDuration(Math.abs(durationDiff))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
