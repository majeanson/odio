"use client";
// EditorToolbar — Trim / Clear all / Split quick-action buttons.
// Single responsibility: display the three editor mode buttons below the waveform card.
// Pure presenter — all action logic lives in WaveformEditor.

interface EditorToolbarProps {
  hasCuts: boolean;
  onTrim: () => void;
  onClearAll: () => void;
  onSplit: () => void;
}

export function EditorToolbar({ hasCuts, onTrim, onClearAll, onSplit }: EditorToolbarProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        onClick={onTrim}
        className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-3 py-4 text-muted hover:bg-elevated hover:text-primary transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
          <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
        <span className="text-xs font-medium">Trim</span>
      </button>

      <button
        onClick={onClearAll}
        disabled={!hasCuts}
        className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-3 py-4 text-muted hover:bg-elevated hover:text-danger transition-colors disabled:opacity-30"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
        <span className="text-xs font-medium">Clear all</span>
      </button>

      <button
        onClick={onSplit}
        className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-3 py-4 text-muted hover:bg-elevated hover:text-primary transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
          <line x1="12" y1="3" x2="12" y2="10" />
          <path d="M12 10 C12 10 7 12 7 17" />
          <path d="M12 10 C12 10 17 12 17 17" />
          <circle cx="7" cy="19" r="2" />
          <circle cx="17" cy="19" r="2" />
        </svg>
        <span className="text-xs font-medium">Split</span>
      </button>
    </div>
  );
}
