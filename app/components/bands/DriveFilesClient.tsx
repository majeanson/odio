"use client";

// Drive file management client.
// Shows all clips with their Drive source / final file status.
// Per-file actions: delete source, detect broken references.
// Sync button: checks all file IDs against the Drive metadata API.
// Import section: scans Drive folder for unimported audio files.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface UnimportedFile {
  fileId: string;
  name: string;
  sizeMb: number | null;
  mimeType: string;
  createdTime: string | null;
}

interface DriveItem {
  clipId: string;
  clipName: string;
  sessionName: string;
  sessionId: string;
  driveFileId: string | null;
  finalDriveFileId: string | null;
  sourceDurationMs: number | null;
  frozen: boolean;
}

interface DriveFilesClientProps {
  bandId: string;
  driveFolderId: string;
  items: DriveItem[];
}

type FileStatus = "unknown" | "ok" | "missing";

function formatMins(ms: number | null): string {
  if (!ms) return "—";
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function DriveFilesClient({ bandId, driveFolderId, items: initialItems }: DriveFilesClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<DriveItem[]>(initialItems);
  const [fileStatus, setFileStatus] = useState<Record<string, FileStatus>>({});
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<{ clipId: string; clipName: string; type: "source" | "clip" } | null>(null);

  // Import state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ unimported: UnimportedFile[]; total: number; tracked: number } | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importedSessionId, setImportedSessionId] = useState<string | null>(null);

  const driveFolderUrl = `https://drive.google.com/drive/folders/${driveFolderId}`;

  // Collect all unique file IDs present in DB
  const allFileIds = Array.from(new Set(
    items.flatMap((i) => [i.driveFileId, i.finalDriveFileId].filter(Boolean) as string[])
  ));

  async function handleSync() {
    setSyncing(true);
    const results: Record<string, FileStatus> = {};

    // Check all file IDs in parallel (batched to avoid flooding Drive API)
    const BATCH = 5;
    for (let i = 0; i < allFileIds.length; i += BATCH) {
      const batch = allFileIds.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (fileId) => {
          try {
            const res = await fetch(`/api/drive/check-file?fileId=${encodeURIComponent(fileId)}`);
            results[fileId] = res.ok ? "ok" : "missing";
          } catch {
            results[fileId] = "missing";
          }
        })
      );
    }

    setFileStatus(results);
    setSyncing(false);
  }

  async function handleDeleteSource(clipId: string) {
    setDeleting(clipId + ":source");
    try {
      const res = await fetch(`/api/clips/${clipId}/delete-source`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) => i.clipId === clipId ? { ...i, driveFileId: null } : i)
        );
        setFileStatus((prev) => {
          const next = { ...prev };
          const item = items.find((i) => i.clipId === clipId);
          if (item?.driveFileId) delete next[item.driveFileId];
          return next;
        });
      }
    } finally {
      setDeleting(null);
      setConfirmItem(null);
    }
  }

  async function handleDeleteClip(clipId: string) {
    setDeleting(clipId + ":clip");
    try {
      const res = await fetch(`/api/clips/${clipId}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.clipId !== clipId));
      }
    } finally {
      setDeleting(null);
      setConfirmItem(null);
    }
  }

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    setSelectedFileIds(new Set());
    setImportedSessionId(null);
    try {
      const res = await fetch(`/api/bands/${bandId}/drive/scan`);
      if (!res.ok) throw new Error("Scan failed");
      const data = await res.json() as { unimported: UnimportedFile[]; total: number; tracked: number };
      setScanResult(data);
    } finally {
      setScanning(false);
    }
  }

  function toggleFile(fileId: string) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function toggleAll() {
    if (!scanResult) return;
    if (selectedFileIds.size === scanResult.unimported.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(scanResult.unimported.map((f) => f.fileId)));
    }
  }

  async function handleImport() {
    if (!scanResult || selectedFileIds.size === 0) return;
    setImporting(true);
    try {
      const files = scanResult.unimported
        .filter((f) => selectedFileIds.has(f.fileId))
        .map((f) => ({ fileId: f.fileId, name: f.name }));

      const res = await fetch(`/api/bands/${bandId}/drive/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });

      if (!res.ok) throw new Error("Import failed");
      const data = await res.json() as { imported: { clipId: string; name: string }[]; sessionId: string };
      setImportedSessionId(data.sessionId);
      // Remove imported files from scan results
      setScanResult((prev) =>
        prev
          ? {
              ...prev,
              unimported: prev.unimported.filter((f) => !selectedFileIds.has(f.fileId)),
            }
          : null,
      );
      setSelectedFileIds(new Set());
      router.refresh();
    } finally {
      setImporting(false);
    }
  }

  // Group by session
  const bySession = items.reduce<Record<string, { sessionName: string; sessionId: string; clips: DriveItem[] }>>((acc, item) => {
    if (!acc[item.sessionId]) {
      acc[item.sessionId] = { sessionName: item.sessionName, sessionId: item.sessionId, clips: [] };
    }
    acc[item.sessionId].clips.push(item);
    return acc;
  }, {});

  const sessionGroups = Object.values(bySession);
  const totalFiles = items.filter((i) => i.driveFileId || i.finalDriveFileId).length;
  const missingCount = Object.values(fileStatus).filter((s) => s === "missing").length;

  function statusDot(fileId: string | null) {
    if (!fileId) return null;
    const s = fileStatus[fileId];
    if (s === "ok") return <span className="size-2 rounded-full bg-accent inline-block" title="File exists in Drive" />;
    if (s === "missing") return <span className="size-2 rounded-full bg-danger inline-block" title="File missing from Drive" />;
    return <span className="size-2 rounded-full bg-muted/40 inline-block" title="Not checked" />;
  }

  return (
    <div className="px-5 py-5 space-y-6">
      {/* Header stats + actions */}
      <div className="rounded-2xl bg-surface px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-primary">{totalFiles} file{totalFiles !== 1 ? "s" : ""} in Odio folder</p>
            {missingCount > 0 && (
              <p className="text-sm text-danger mt-0.5">{missingCount} broken reference{missingCount !== 1 ? "s" : ""} detected</p>
            )}
          </div>
          <a
            href={driveFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-accent underline underline-offset-4 shrink-0"
          >
            Open Drive
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncing || allFileIds.length === 0}
          loading={syncing}
          variant="secondary"
          fullWidth
        >
          {syncing ? "Checking Drive…" : "Sync — check all files against Drive"}
        </Button>
        {Object.keys(fileStatus).length > 0 && !syncing && (
          <p className="text-xs text-muted">
            {Object.values(fileStatus).filter((s) => s === "ok").length} of {Object.keys(fileStatus).length} files confirmed in Drive
          </p>
        )}
      </div>

      {/* Import from Drive */}
      <div className="rounded-2xl bg-surface px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-primary">Import from Drive</p>
          {scanResult && (
            <p className="text-xs text-muted">
              {scanResult.total} file{scanResult.total !== 1 ? "s" : ""} in folder
            </p>
          )}
        </div>
        <p className="text-sm text-secondary">
          Scan the Drive folder for audio files that aren&apos;t tracked in Odio yet — useful if recordings were lost from the database.
        </p>

        {importedSessionId && (
          <div className="rounded-xl bg-accent/10 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-accent font-medium">Imported successfully</p>
            <a
              href={`/bands/${bandId}/sessions/${importedSessionId}`}
              className="text-sm text-accent underline underline-offset-4 shrink-0"
            >
              View session
            </a>
          </div>
        )}

        <Button
          onClick={handleScan}
          disabled={scanning || importing}
          loading={scanning}
          variant="secondary"
          fullWidth
        >
          {scanning ? "Scanning Drive…" : "Scan for unimported files"}
        </Button>

        {scanResult && (
          <>
            {scanResult.unimported.length === 0 ? (
              <p className="text-sm text-muted text-center py-1">
                All Drive files are already tracked in Odio.
              </p>
            ) : (
              <div className="space-y-2">
                {/* Select all */}
                <button
                  onClick={toggleAll}
                  className="text-xs text-accent underline underline-offset-4"
                >
                  {selectedFileIds.size === scanResult.unimported.length ? "Deselect all" : "Select all"}
                </button>

                {scanResult.unimported.map((file) => {
                  const checked = selectedFileIds.has(file.fileId);
                  return (
                    <label
                      key={file.fileId}
                      className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-colors ${
                        checked ? "bg-accent/10" : "bg-elevated"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFile(file.fileId)}
                        className="size-4 accent-[var(--color-accent)] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-primary truncate">
                          {file.name.replace(/\.[^.]+$/, "") || file.fileId}
                        </p>
                        <p className="text-xs text-muted font-mono">
                          {file.mimeType.replace("audio/", "")}
                          {file.sizeMb !== null ? ` · ${file.sizeMb} MB` : ""}
                          {file.createdTime
                            ? ` · ${new Date(file.createdTime).toLocaleDateString()}`
                            : ""}
                        </p>
                      </div>
                    </label>
                  );
                })}

                <Button
                  onClick={handleImport}
                  disabled={selectedFileIds.size === 0 || importing}
                  loading={importing}
                  fullWidth
                >
                  {importing
                    ? "Importing…"
                    : `Import ${selectedFileIds.size} file${selectedFileIds.size !== 1 ? "s" : ""}`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* File list grouped by session */}
      {sessionGroups.length === 0 ? (
        <p className="text-sm text-muted text-center py-8">No Drive files found for this band.</p>
      ) : (
        <div className="space-y-6">
          {sessionGroups.map(({ sessionName, sessionId, clips }) => (
            <section key={sessionId}>
              <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2 px-1">{sessionName}</p>
              <div className="space-y-2">
                {clips.map((item) => {
                  const deletingSrc = deleting === item.clipId + ":source";
                  const deletingClip = deleting === item.clipId + ":clip";
                  const srcMissing = item.driveFileId && fileStatus[item.driveFileId] === "missing";

                  return (
                    <div key={item.clipId} className="rounded-2xl bg-surface px-5 py-4 space-y-3">
                      {/* Clip name + duration + delete clip */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-display font-semibold text-primary truncate">{item.clipName}</p>
                          {item.sourceDurationMs && (
                            <p className="text-xs text-muted font-mono mt-0.5">{formatMins(item.sourceDurationMs)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.frozen && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-accent" aria-label="Frozen">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          )}
                          <button
                            onClick={() => setConfirmItem({ clipId: item.clipId, clipName: item.clipName, type: "clip" })}
                            disabled={deletingClip}
                            className="rounded-lg px-2.5 py-1 text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
                          >
                            {deletingClip ? "Deleting…" : "Delete clip"}
                          </button>
                        </div>
                      </div>

                      {/* File rows */}
                      <div className="space-y-1.5">
                        {/* Source file */}
                        <div className="flex items-center justify-between gap-3 min-h-[32px]">
                          <div className="flex items-center gap-2 min-w-0">
                            {statusDot(item.driveFileId)}
                            <span className={`text-xs font-mono truncate ${item.driveFileId ? (srcMissing ? "text-danger" : "text-secondary") : "text-muted/50 line-through"}`}>
                              {item.driveFileId
                                ? (srcMissing ? "source — missing in Drive" : "source.aac")
                                : "source — deleted"}
                            </span>
                          </div>
                          {item.driveFileId && (
                            <button
                              onClick={() => setConfirmItem({ clipId: item.clipId, clipName: item.clipName, type: "source" })}
                              disabled={deletingSrc}
                              className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
                            >
                              {deletingSrc ? "Deleting…" : srcMissing ? "Remove ref" : "Delete"}
                            </button>
                          )}
                        </div>

                        {/* Final file (if exists) */}
                        {item.finalDriveFileId && (
                          <div className="flex items-center gap-2 min-h-[24px]">
                            {statusDot(item.finalDriveFileId)}
                            <span className={`text-xs font-mono truncate ${fileStatus[item.finalDriveFileId] === "missing" ? "text-danger" : "text-secondary"}`}>
                              {fileStatus[item.finalDriveFileId] === "missing" ? "final — missing in Drive" : "final.aac ✓"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Confirmation sheet */}
      <BottomSheet
        open={confirmItem !== null}
        onClose={() => setConfirmItem(null)}
        title={confirmItem?.type === "clip" ? "Delete clip?" : "Delete source audio?"}
      >
        {confirmItem && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-elevated px-5 py-4 space-y-1">
              <p className="text-sm font-semibold text-primary">{confirmItem.clipName}</p>
              <p className="text-sm text-secondary">
                {confirmItem.type === "clip"
                  ? "The clip, all its versions, and both Drive files (source + final) will be permanently deleted. This cannot be undone."
                  : "The raw source file will be deleted from Drive. The clip and all its versions stay in Odio. If the clip is not frozen, audio will no longer be playable."}
              </p>
            </div>
            <Button
              onClick={() =>
                confirmItem.type === "clip"
                  ? handleDeleteClip(confirmItem.clipId)
                  : handleDeleteSource(confirmItem.clipId)
              }
              disabled={deleting !== null}
              loading={deleting !== null}
              variant="danger"
              fullWidth
              size="lg"
            >
              {confirmItem.type === "clip" ? "Delete clip + Drive files" : "Delete from Drive"}
            </Button>
            <Button onClick={() => setConfirmItem(null)} variant="ghost" fullWidth>
              Cancel
            </Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
