"use client";
// useCutDraft — localStorage persistence for in-progress cut marks.
// Single responsibility: load draft on mount, auto-save on change, expose resume/dismiss/clear.
//
// Draft key: "odio:draft:<clipId>"
// Auto-save runs on every cutMarks change so nothing is lost on page close.

import { useState, useEffect } from "react";

type CutBounds = { startMs: number; endMs: number };

function draftKey(clipId: string) { return `odio:draft:${clipId}`; }

function readDraft(clipId: string): CutBounds[] | null {
  try {
    const raw = localStorage.getItem(draftKey(clipId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(clipId: string, marks: CutBounds[]) {
  try { localStorage.setItem(draftKey(clipId), JSON.stringify(marks)); } catch {}
}

function removeDraft(clipId: string) {
  try { localStorage.removeItem(draftKey(clipId)); } catch {}
}

interface UseCutDraftOptions {
  clipId: string;
  cutMarks: CutBounds[];
  /** Called to populate cuts when the user chooses to resume their draft. */
  onLoadCuts: (marks: CutBounds[]) => void;
}

interface UseCutDraftReturn {
  /** True when a non-empty saved draft exists and no cuts are currently loaded. */
  hasDraft: boolean;
  /** Load the draft into the editor. */
  resume: () => void;
  /** Discard the draft without loading it. */
  dismiss: () => void;
  /** Delete the draft after a successful version submit. */
  clear: () => void;
}

export function useCutDraft({ clipId, cutMarks, onLoadCuts }: UseCutDraftOptions): UseCutDraftReturn {
  const [hasDraft, setHasDraft] = useState(false);

  // On mount: check for a saved draft to offer the resume banner.
  useEffect(() => {
    const draft = readDraft(clipId);
    if (draft && draft.length > 0) setHasDraft(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save: persist current cut marks on every change.
  useEffect(() => {
    writeDraft(clipId, cutMarks);
  }, [clipId, cutMarks]);

  function resume() {
    const draft = readDraft(clipId);
    if (!draft) return;
    setHasDraft(false);
    onLoadCuts(draft);
  }

  function dismiss() {
    removeDraft(clipId);
    setHasDraft(false);
  }

  function clear() {
    removeDraft(clipId);
    setHasDraft(false);
  }

  return { hasDraft, resume, dismiss, clear };
}
