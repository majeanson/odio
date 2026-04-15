"use client";
// DriveFilesClient — Drive file management: sync status, per-clip actions, import.
// Thin coordinator: state + mutations here; rendering delegated to DriveFileRow and DriveImportSection.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DriveFileRow } from "./DriveFileRow";
import { DriveImportSection } from "./DriveImportSection";

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

export function DriveFilesClient({ bandId, driveFolderId, items: initialItems }: DriveFilesClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<DriveItem[]>(initialItems);
  const [fileStatus, setFileStatus] = useState<Record<string, FileStatus>>({});
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<{ clipId: string; clipName: string; type: "source" | "clip" } | null>(null);

  // Import state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    unimported: UnimportedFile[];
    total: number;
    tracked: number;
    needsReauth: boolean;
    creatorIsCurrentUser: boolean;
  } | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importedSessionId, setImportedSessionId] = useState<string | null>(null);

  const driveFolderUrl = `https://drive.google.com/drive/folders/${driveFolderId}`;
  const allFileIds = Array.from(new Set(
    items.flatMap((i) => [i.driveFileId, i.finalDriveFileId].filter(Boolean) as string[])
  ));

  // ── Sync ──────────────────────────────────────────────────────────────────

  async function handleSync() {
    setSyncing(true);
    const results: Record<string, FileStatus> = {};
    const BATCH = 5;
    for (let i = 0; i < allFileIds.length; i += BATCH) {
      await Promise.all(
        allFileIds.slice(i, i + BATCH).map(async (fileId) => {
          try {
            const res = await fetch(`/api/drive/check-file?fileId=${encodeURIComponent(fileId)}`);
            results[fileId] = res.ok ? "ok" : "missing";
          } catch { results[fileId] = "missing"; }
        })
      );
    }
    setFileStatus(results);
    setSyncing(false);
  }

  // ── Deletions ─────────────────────────────────────────────────────────────

  async function handleDeleteSource(clipId: string) {
    setDeleting(clipId + ":source");
    try {
      const res = await fetch(`/api/clips/${clipId}/delete-source`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.map((i) => i.clipId === clipId ? { ...i, driveFileId: null } : i));
        setFileStatus((prev) => {
          const next = { ...prev };
          const item = items.find((i) => i.clipId === clipId);
          if (item?.driveFileId) delete next[item.driveFileId];
          return next;
        });
      }
    } finally { setDeleting(null); setConfirmItem(null); }
  }

  async function handleDeleteClip(clipId: string) {
    setDeleting(clipId + ":clip");
    try {
      const res = await fetch(`/api/clips/${clipId}`, { method: "DELETE" });
      if (res.ok) setItems((prev) => prev.filter((i) => i.clipId !== clipId));
    } finally { setDeleting(null); setConfirmItem(null); }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    setSelectedFileIds(new Set());
    setImportedSessionId(null);
    try {
      const res = await fetch(`/api/bands/${bandId}/drive/scan`);
      if (!res.ok) throw new Error("Scan failed");
      setScanResult(await res.json());
    } finally { setScanning(false); }
  }

  function toggleFile(fileId: string) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });
  }

  function toggleAll() {
    if (!scanResult) return;
    setSelectedFileIds(
      selectedFileIds.size === scanResult.unimported.length
        ? new Set()
        : new Set(scanResult.unimported.map((f) => f.fileId))
    );
  }

  async function handleImport() {
    if (!scanResult || selectedFileIds.size === 0) return;
    setImporting(true);
    try {
      const files = scanResult.unimported.filter((f) => selectedFileIds.has(f.fileId)).map((f) => ({ fileId: f.fileId, name: f.name }));
      const res = await fetch(`/api/bands/${bandId}/drive/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) throw new Error("Import failed");
      const data = await res.json() as { imported: { clipId: string; name: string }[]; sessionId: string };
      setImportedSessionId(data.sessionId);
      setScanResult((prev) => prev ? { ...prev, unimported: prev.unimported.filter((f) => !selectedFileIds.has(f.fileId)) } : null);
      setSelectedFileIds(new Set());
      router.refresh();
    } finally { setImporting(false); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const bySession = items.reduce<Record<string, { sessionName: string; sessionId: string; clips: DriveItem[] }>>((acc, item) => {
    if (!acc[item.sessionId]) acc[item.sessionId] = { sessionName: item.sessionName, sessionId: item.sessionId, clips: [] };
    acc[item.sessionId].clips.push(item);
    return acc;
  }, {});
  const sessionGroups = Object.values(bySession);
  const totalFiles = items.filter((i) => i.driveFileId || i.finalDriveFileId).length;
  const missingCount = Object.values(fileStatus).filter((s) => s === "missing").length;

  return (
    <div className="px-5 py-5 space-y-6">

      {/* Header stats + sync */}
      <div className="rounded-2xl bg-surface px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-primary">{totalFiles} file{totalFiles !== 1 ? "s" : ""} in Odio folder</p>
            {missingCount > 0 && (
              <p className="text-sm text-danger mt-0.5">{missingCount} broken reference{missingCount !== 1 ? "s" : ""} detected</p>
            )}
          </div>
          <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-accent underline underline-offset-4 shrink-0">
            Open Drive
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
        <Button onClick={handleSync} disabled={syncing || allFileIds.length === 0} loading={syncing} variant="secondary" fullWidth>
          {syncing ? "Checking Drive…" : "Sync — check all files against Drive"}
        </Button>
        {Object.keys(fileStatus).length > 0 && !syncing && (
          <p className="text-xs text-muted">
            {Object.values(fileStatus).filter((s) => s === "ok").length} of {Object.keys(fileStatus).length} files confirmed in Drive
          </p>
        )}
      </div>

      {/* Import */}
      <DriveImportSection
        bandId={bandId}
        scanning={scanning}
        importing={importing}
        scanResult={scanResult}
        importedSessionId={importedSessionId}
        selectedFileIds={selectedFileIds}
        onScan={handleScan}
        onToggleFile={toggleFile}
        onToggleAll={toggleAll}
        onImport={handleImport}
      />

      {/* File list grouped by session */}
      {sessionGroups.length === 0 ? (
        <p className="text-sm text-muted text-center py-8">No Drive files found for this band.</p>
      ) : (
        <div className="space-y-6">
          {sessionGroups.map(({ sessionName, sessionId, clips }) => (
            <section key={sessionId}>
              <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2 px-1">{sessionName}</p>
              <div className="space-y-2">
                {clips.map((item) => (
                  <DriveFileRow
                    key={item.clipId}
                    item={item}
                    fileStatus={fileStatus}
                    deleting={deleting}
                    onConfirmDelete={setConfirmItem}
                  />
                ))}
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
              onClick={() => confirmItem.type === "clip" ? handleDeleteClip(confirmItem.clipId) : handleDeleteSource(confirmItem.clipId)}
              disabled={deleting !== null}
              loading={deleting !== null}
              variant="danger" fullWidth size="lg"
            >
              {confirmItem.type === "clip" ? "Delete clip + Drive files" : "Delete from Drive"}
            </Button>
            <Button onClick={() => setConfirmItem(null)} variant="ghost" fullWidth>Cancel</Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
