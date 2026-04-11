"use client";

// Session header with inline rename, notes editing, and QR code sheet.
// Shown at the top of the session detail page.
// QR code links to this session's URL so bandmates can scan and jump straight in.

import { useState, useEffect } from "react";
import QRCode from "react-qr-code";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";

interface SessionHeaderClientProps {
  bandId: string;
  sessionId: string;
  initialName: string;
  initialNotes: string | null;
  canEdit: boolean;
}

export function SessionHeaderClient({
  bandId,
  sessionId,
  initialName,
  initialNotes,
  canEdit,
}: SessionHeaderClientProps) {
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [sessionUrl, setSessionUrl] = useState("");

  useEffect(() => {
    setSessionUrl(
      `${window.location.origin}/bands/${bandId}/sessions/${sessionId}`,
    );
  }, [bandId, sessionId]);

  async function patchSession(patch: { name?: string; notes?: string | null }) {
    await fetch(`/api/bands/${bandId}/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function handleRename(newName: string) {
    const optimistic = name;
    setName(newName);
    const res = await fetch(`/api/bands/${bandId}/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) setName(optimistic);
  }

  function openNotesSheet() {
    setNotesDraft(notes);
    setNotesSheetOpen(true);
  }

  async function saveNotes() {
    setSavingNotes(true);
    const trimmed = notesDraft.trim();
    await patchSession({ notes: trimmed || null });
    setNotes(trimmed);
    setNotesSheetOpen(false);
    setSavingNotes(false);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-6 pt-6 pb-2">
        <div className="min-w-0 flex-1">
          {canEdit ? (
            <InlineEdit
              value={name}
              onSave={handleRename}
              className="text-xl font-bold text-primary leading-tight"
              inputClassName="text-xl font-bold"
              placeholder="Session name"
            />
          ) : (
            <h1 className="text-xl font-bold text-primary truncate">{name}</h1>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Notes button */}
          <button
            onClick={openNotesSheet}
            aria-label="Session notes"
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              notes
                ? "bg-accent/20 text-accent"
                : "bg-surface text-secondary hover:text-primary"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </button>

          {/* QR code button */}
          <button
            onClick={() => setQrOpen(true)}
            aria-label="Show QR code"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-secondary hover:text-primary transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="3" height="3" />
              <path d="M17 17h3v3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Notes preview — shown when notes exist */}
      {notes && (
        <button
          onClick={openNotesSheet}
          className="mx-6 mb-2 rounded-xl bg-surface px-4 py-2.5 text-left w-[calc(100%-3rem)]"
        >
          <p className="text-xs text-muted mb-0.5">Session notes</p>
          <p className="text-sm text-secondary line-clamp-2">{notes}</p>
        </button>
      )}

      {/* Notes sheet */}
      <BottomSheet
        open={notesSheetOpen}
        onClose={() => setNotesSheetOpen(false)}
        title="Session notes"
      >
        <div className="space-y-3">
          <textarea
            autoFocus
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="What happened tonight? Key songs, gear, vibe…"
            maxLength={2000}
            rows={5}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-primary placeholder:text-muted focus:border-accent focus:outline-none resize-none"
          />
          {canEdit ? (
            <>
              <Button onClick={saveNotes} disabled={savingNotes} fullWidth>
                {savingNotes ? "Saving…" : "Save notes"}
              </Button>
              <Button onClick={() => setNotesSheetOpen(false)} variant="ghost" fullWidth>
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={() => setNotesSheetOpen(false)} variant="ghost" fullWidth>
              Close
            </Button>
          )}
        </div>
      </BottomSheet>

      {/* QR bottom sheet */}
      <BottomSheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title="Join this session"
      >
        <div className="flex flex-col items-center gap-4 py-4">
          {sessionUrl && (
            <div className="rounded-2xl bg-white p-4">
              <QRCode value={sessionUrl} size={200} />
            </div>
          )}
          <p className="text-center text-sm text-secondary">
            Scan to open this session on another device
          </p>
          <p className="break-all font-mono text-xs text-muted text-center select-all">
            {sessionUrl}
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
