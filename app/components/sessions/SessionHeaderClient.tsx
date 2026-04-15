"use client";

// Session header with inline rename, notes editing, and QR code sheet.
// Shown at the top of the session detail page.
// QR code links to this session's URL so bandmates can scan and jump straight in.

import { useState, useEffect } from "react";
import Link from "next/link";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { SessionNotesSheet } from "./SessionNotesSheet";
import { SessionQrSheet } from "./SessionQrSheet";

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
  const [qrOpen, setQrOpen] = useState(false);
  const [sessionUrl, setSessionUrl] = useState("");

  useEffect(() => {
    setSessionUrl(
      `${window.location.origin}/bands/${bandId}/sessions/${sessionId}`,
    );
  }, [bandId, sessionId]);

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

  async function handleSaveNotes(trimmed: string) {
    await fetch(`/api/bands/${bandId}/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: trimmed || null }),
    });
    setNotes(trimmed);
  }

  return (
    <>
      {/* Sticky header — offsets below the upload banner when active */}
      <div
        className="sticky z-20 flex min-h-[72px] items-center gap-3 px-5 py-3 bg-base border-b border-border"
        style={{ top: "var(--upload-banner-h, 0px)" }}
      >
        {/* Back to band */}
        <Link
          href={`/bands/${bandId}`}
          aria-label="Back to band"
          className="flex items-center justify-center shrink-0 text-secondary hover:text-primary transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-7"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>

        <div className="min-w-0 flex-1">
          {canEdit ? (
            <InlineEdit
              value={name}
              onSave={handleRename}
              className="font-display text-3xl font-bold text-primary leading-tight"
              inputClassName="font-display text-3xl font-bold"
              placeholder="Session name"
            />
          ) : (
            <h1 className="font-display text-3xl font-bold text-primary truncate">{name}</h1>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Notes button */}
          <button
            onClick={() => setNotesSheetOpen(true)}
            aria-label="Session notes"
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
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
              className="size-6"
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
            className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-secondary hover:text-primary transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6"
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
          onClick={() => setNotesSheetOpen(true)}
          className="mx-5 mb-3 rounded-2xl bg-surface px-5 py-3 text-left w-[calc(100%-2.5rem)]"
        >
          <p className="text-sm font-semibold text-muted mb-1">Session notes</p>
          <p className="text-base text-secondary line-clamp-2">{notes}</p>
        </button>
      )}

      <SessionNotesSheet
        open={notesSheetOpen}
        onClose={() => setNotesSheetOpen(false)}
        currentNotes={notes}
        canEdit={canEdit}
        onSave={handleSaveNotes}
      />

      <SessionQrSheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        sessionUrl={sessionUrl}
      />
    </>
  );
}
