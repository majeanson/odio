"use client";
// WaveformPlayButton — the amber circular play/pause button.
// Pure presenter: no audio state, just renders the button.
// Shared by WaveformPlayer, WaveformEditor, and PublicPlayer.

interface WaveformPlayButtonProps {
  isPlaying: boolean;
  disabled: boolean;
  onClick: () => void;
}

export function WaveformPlayButton({ isPlaying, disabled, onClick }: WaveformPlayButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={isPlaying ? "Pause" : "Play"}
      className="flex h-20 w-20 items-center justify-center rounded-full bg-accent shadow-[0_4px_0_0_#78350f] transition-[transform,box-shadow] duration-75 active:translate-y-[4px] active:shadow-none disabled:opacity-40 disabled:shadow-none"
    >
      {isPlaying ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-8" aria-hidden>
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-8" aria-hidden>
          <polygon points="5,3 19,12 5,21" />
        </svg>
      )}
    </button>
  );
}
