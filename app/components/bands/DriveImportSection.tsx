"use client";
// DriveImportSection — scan Drive folder for unimported audio files and import them.
// Single responsibility: the import sub-flow within Drive management.

import { Button } from "@/components/ui/Button";

interface UnimportedFile {
  fileId: string;
  name: string;
  sizeMb: number | null;
  mimeType: string;
  createdTime: string | null;
}

interface ScanResult {
  unimported: UnimportedFile[];
  total: number;
  tracked: number;
  needsReauth: boolean;
  creatorIsCurrentUser: boolean;
}

interface DriveImportSectionProps {
  bandId: string;
  scanning: boolean;
  importing: boolean;
  scanResult: ScanResult | null;
  importedSessionId: string | null;
  selectedFileIds: Set<string>;
  onScan: () => void;
  onToggleFile: (fileId: string) => void;
  onToggleAll: () => void;
  onImport: () => void;
}

export function DriveImportSection({
  bandId, scanning, importing, scanResult, importedSessionId,
  selectedFileIds, onScan, onToggleFile, onToggleAll, onImport,
}: DriveImportSectionProps) {
  return (
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
        Scan the Drive folder for audio files not yet tracked in Odio — pick up recordings you copied in manually from outside the app.
      </p>

      {importedSessionId && (
        <div className="rounded-xl bg-accent/10 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-accent font-medium">Imported successfully</p>
          <a href={`/bands/${bandId}/sessions/${importedSessionId}`} className="text-sm text-accent underline underline-offset-4 shrink-0">
            View session
          </a>
        </div>
      )}

      <Button onClick={onScan} disabled={scanning || importing} loading={scanning} variant="secondary" fullWidth>
        {scanning ? "Scanning Drive…" : "Scan for unimported files"}
      </Button>

      {scanResult?.needsReauth && (
        <div className="rounded-xl bg-accent/10 px-4 py-3 space-y-2">
          <p className="text-sm font-medium text-accent">Drive access upgrade needed</p>
          <p className="text-sm text-secondary">
            {scanResult.creatorIsCurrentUser
              ? "Odio needs an extra Drive permission to see files you copied in manually. Sign out and sign back in — Google will ask you to approve it."
              : "The band creator needs to sign out and sign back in so Odio can access files they copied into the Drive folder manually."}
          </p>
          {scanResult.creatorIsCurrentUser && (
            <a href="/api/auth/signout" className="inline-block rounded-lg px-4 py-2 text-sm font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors">
              Sign out to reconnect
            </a>
          )}
        </div>
      )}

      {scanResult && !scanResult.needsReauth && (
        scanResult.unimported.length === 0 ? (
          <p className="text-sm text-muted text-center py-1">All Drive files are already tracked in Odio.</p>
        ) : (
          <div className="space-y-2">
            <button onClick={onToggleAll} className="text-xs text-accent underline underline-offset-4">
              {selectedFileIds.size === scanResult.unimported.length ? "Deselect all" : "Select all"}
            </button>

            {scanResult.unimported.map((file) => {
              const checked = selectedFileIds.has(file.fileId);
              return (
                <label
                  key={file.fileId}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-colors ${checked ? "bg-accent/10" : "bg-elevated"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleFile(file.fileId)}
                    className="size-4 accent-[var(--color-accent)] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-primary truncate">
                      {file.name.replace(/\.[^.]+$/, "") || file.fileId}
                    </p>
                    <p className="text-xs text-muted font-mono">
                      {file.mimeType.replace("audio/", "")}
                      {file.sizeMb !== null ? ` · ${file.sizeMb} MB` : ""}
                      {file.createdTime ? ` · ${new Date(file.createdTime).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                </label>
              );
            })}

            <Button
              onClick={onImport}
              disabled={selectedFileIds.size === 0 || importing}
              loading={importing}
              fullWidth
            >
              {importing ? "Importing…" : `Import ${selectedFileIds.size} file${selectedFileIds.size !== 1 ? "s" : ""}`}
            </Button>
          </div>
        )
      )}
    </div>
  );
}
