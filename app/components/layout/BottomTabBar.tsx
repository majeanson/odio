"use client";

// Navigation — bottom bar on mobile, left sidebar on desktop (md+).
// 5 tabs (max): Sessions, Catalog, Record, Clips (session-only), Band.
// Record tab shows a pulsing amber ring when recording is in progress.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BandRole } from "@/types";

interface BottomTabBarProps {
  bandId: string;
  sessionId?: string;
  isRecording?: boolean;
  /** Current user's role in this band — MEMBER role hides the Record tab */
  memberRole?: BandRole | null;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-8 md:size-[1.125rem] shrink-0" aria-hidden>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-8 md:size-[1.125rem] shrink-0" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function MusicNoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-8 md:size-[1.125rem] shrink-0" aria-hidden>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function DiscIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-8 md:size-[1.125rem] shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-8 md:size-[1.125rem] shrink-0" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function BottomTabBar({
  bandId,
  sessionId,
  isRecording = false,
  memberRole,
}: BottomTabBarProps) {
  const pathname = usePathname();
  const canRecord = memberRole !== "MEMBER";

  const allTabs = [
    {
      href: `/bands/${bandId}`,
      label: "Sessions",
      icon: <CalendarIcon />,
      match: (p: string) =>
        p.startsWith(`/bands/${bandId}`) &&
        !p.startsWith(`/bands/${bandId}/sessions/`) &&
        !p.includes("/settings") &&
        !p.includes("/catalog"),
    },
    {
      href: `/bands/${bandId}/catalog`,
      label: "Catalog",
      icon: <DiscIcon />,
      match: (p: string) => p.includes("/catalog"),
    },
    {
      href: `/record?bandId=${bandId}${sessionId ? `&sessionId=${sessionId}` : ""}`,
      label: "Record",
      icon: <MicIcon />,
      match: (p: string) => p.startsWith("/record"),
      isRecord: true,
      hidden: !canRecord,
    },
    {
      href: `/bands/${bandId}/sessions/${sessionId}`,
      label: "Clips",
      icon: <MusicNoteIcon />,
      match: (p: string) =>
        p.startsWith(`/bands/${bandId}/sessions/${sessionId}`),
      hidden: !sessionId,
    },
    {
      href: `/bands/${bandId}/settings`,
      label: "Band",
      icon: <UsersIcon />,
      match: (p: string) => p.includes("/settings"),
    },
  ];

  const tabs = allTabs.filter((t) => !t.hidden);

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "fixed z-40 bg-elevated border-border",
        // Mobile: bottom bar
        "bottom-0 left-0 right-0 border-t",
        // Desktop: left sidebar
        "md:bottom-auto md:right-auto md:top-0 md:w-[220px] md:border-t-0 md:border-r md:flex md:flex-col",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Desktop: ODIO wordmark header — aligns with PageLayout header height */}
      <div className="hidden md:flex items-center h-[72px] px-5 border-b border-border/50 shrink-0">
        <span className="font-display text-2xl font-black text-accent tracking-wider uppercase select-none">
          ODIO
        </span>
      </div>

      {/* Nav items */}
      <div
        className={cn(
          // Mobile: horizontal row
          "flex h-[80px] items-stretch",
          // Desktop: vertical list
          "md:flex-col md:h-auto md:flex-1 md:py-3 md:gap-0.5 md:px-2",
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.match ? tab.match(pathname) : pathname.startsWith(tab.href);
          const isRec = tab.isRecord;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative transition-colors",
                // Mobile: stacked icon+label column
                "flex flex-1 flex-col items-center justify-center gap-1.5",
                // Desktop: horizontal row item
                "md:flex-initial md:flex-row md:h-11 md:rounded-xl md:px-3 md:gap-3 md:justify-start md:items-center",
                // Color states
                isActive
                  ? "text-accent md:bg-accent/10"
                  : "text-muted hover:text-secondary md:hover:bg-elevated/60 md:hover:text-primary",
                // Record tab on desktop gets an amber outline when inactive
                isRec && !isActive && "md:border md:border-accent/20",
                isRec && isActive && "md:bg-accent/15 md:border md:border-accent/30",
              )}
            >
              {/* Mobile: active background pill */}
              <span className={cn(
                "md:hidden absolute inset-x-2 inset-y-2 rounded-2xl transition-colors",
                isActive ? "bg-accent/10 border border-accent/20" : "bg-transparent",
              )} />

              {/* Desktop: active left accent bar */}
              {isActive && (
                <span className="hidden md:block absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />
              )}

              {/* Recording pulse */}
              {isRec && isRecording && (
                <span className="absolute inset-0 animate-ping rounded-full bg-accent/20 pointer-events-none" />
              )}

              {/* Icon */}
              <span className="relative">{tab.icon}</span>

              {/* Label */}
              <span className="relative text-sm font-bold leading-none tracking-wide uppercase md:text-sm md:font-semibold md:normal-case md:tracking-normal">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Desktop: bottom area — recording indicator */}
      {isRecording && (
        <div className="hidden md:flex items-center gap-2 px-4 py-3 border-t border-border/50 shrink-0">
          <span className="size-2 rounded-full bg-danger animate-pulse shrink-0" />
          <span className="text-sm font-semibold text-danger">Recording</span>
        </div>
      )}
    </nav>
  );
}
