"use client";
// DriveFileRow — a single clip's Drive file status row.
// Single responsibility: display source + final file health for one clip, with delete actions.

type FileStatus = "unknown" | "ok" | "missing";

interface DriveItem {
  clipId: string;
  clipName: string;
  driveFileId: string | null;
  finalDriveFileId: string | null;
  sourceDurationMs: number | null;
  frozen: boolean;
}

interface DriveFileRowProps {
  item: DriveItem;
  fileStatus: Record<string, FileStatus>;
  deleting: string | null;
  onConfirmDelete: (payload: { clipId: string; clipName: string; type: "source" | "clip" }) => void;
}

function formatMins(ms: number | null): string {
  if (!ms) return "—";
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function StatusDot({ fileId, fileStatus }: { fileId: string | null; fileStatus: Record<string, FileStatus> }) {
  if (!fileId) return null;
  const s = fileStatus[fileId];
  if (s === "ok")      return <span className="size-2 rounded-full bg-accent inline-block" title="File exists in Drive" />;
  if (s === "missing") return <span className="size-2 rounded-full bg-danger inline-block" title="File missing from Drive" />;
  return <span className="size-2 rounded-full bg-muted/40 inline-block" title="Not checked" />;
}

export function DriveFileRow({ item, fileStatus, deleting, onConfirmDelete }: DriveFileRowProps) {
  const deletingSrc  = deleting === item.clipId + ":source";
  const deletingClip = deleting === item.clipId + ":clip";
  const srcMissing = item.driveFileId && fileStatus[item.driveFileId] === "missing";

  return (
    <div className="rounded-2xl bg-surface px-5 py-4 space-y-3">
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
            onClick={() => onConfirmDelete({ clipId: item.clipId, clipName: item.clipName, type: "clip" })}
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
            <StatusDot fileId={item.driveFileId} fileStatus={fileStatus} />
            <span className={`text-xs font-mono truncate ${
              item.driveFileId
                ? (srcMissing ? "text-danger" : "text-secondary")
                : "text-muted/50 line-through"
            }`}>
              {item.driveFileId
                ? (srcMissing ? "source — missing in Drive" : "source.aac")
                : "source — deleted"}
            </span>
          </div>
          {item.driveFileId && (
            <button
              onClick={() => onConfirmDelete({ clipId: item.clipId, clipName: item.clipName, type: "source" })}
              disabled={deletingSrc}
              className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
            >
              {deletingSrc ? "Deleting…" : srcMissing ? "Remove ref" : "Delete"}
            </button>
          )}
        </div>

        {/* Final file */}
        {item.finalDriveFileId && (
          <div className="flex items-center gap-2 min-h-[24px]">
            <StatusDot fileId={item.finalDriveFileId} fileStatus={fileStatus} />
            <span className={`text-xs font-mono truncate ${
              fileStatus[item.finalDriveFileId] === "missing" ? "text-danger" : "text-secondary"
            }`}>
              {fileStatus[item.finalDriveFileId] === "missing" ? "final — missing in Drive" : "final.aac ✓"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
