"use client";
// ActionRow — full-width tappable row: icon + label + optional sub + right element.
// Single responsibility: consistent action row layout.
// Renders as <button> when onClick is provided, <div> otherwise.

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
  right?: React.ReactNode;
  highlight?: boolean;
}

const chevronRight = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5 text-muted shrink-0" aria-hidden>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export function ActionRow({ icon, label, sub, onClick, right, highlight }: ActionRowProps) {
  const classes = `flex items-center gap-4 rounded-2xl px-5 py-5 transition-colors w-full text-left ${
    highlight
      ? "bg-accent/10 border border-accent/30 hover:bg-accent/15"
      : "bg-surface hover:bg-elevated"
  }`;

  const body = (
    <>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-lg font-semibold text-primary">{label}</p>
        {sub && <p className="text-base text-muted mt-1">{sub}</p>}
      </div>
      {right !== undefined ? right : chevronRight}
    </>
  );

  return onClick ? (
    <button onClick={onClick} className={classes}>{body}</button>
  ) : (
    <div className={classes}>{body}</div>
  );
}
