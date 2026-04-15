"use client";
// DraftRestoreBanner — shown when unsaved cut-mark draft is detected on mount.
// Pure presenter: owns no state. Rendered only when the coordinator detects a draft.

interface DraftRestoreBannerProps {
  show: boolean;
  onResume: () => void;
  onDismiss: () => void;
}

export function DraftRestoreBanner({ show, onResume, onDismiss }: DraftRestoreBannerProps) {
  if (!show) return null;

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/10 px-5 py-4 flex items-center gap-3">
      <div className="flex-1">
        <p className="text-base font-medium text-primary">Unsaved draft</p>
        <p className="text-sm text-muted">Resume your previous cuts?</p>
      </div>
      <button onClick={onResume} className="shrink-0 text-sm font-semibold text-accent">
        Resume
      </button>
      <button onClick={onDismiss} className="shrink-0 text-sm text-muted">
        Dismiss
      </button>
    </div>
  );
}
