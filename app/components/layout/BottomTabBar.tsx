"use client";

// Bottom tab bar — always visible except on /record and /edit routes.
// 4 tabs: Sessions, Record, Clips, Band.
// Record tab shows a pulsing amber ring when recording is in progress.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BandRole } from "@/types";

interface Tab {
  href: string;
  label: string;
  icon: React.ReactNode;
  match?: (path: string) => boolean; // custom active check
  isRecord?: boolean;
  hidden?: boolean;
}

interface BottomTabBarProps {
  bandId: string;
  sessionId?: string;
  isRecording?: boolean;
  /** Current user's role in this band — MEMBER role hides the Record tab */
  memberRole?: BandRole | null;
}

function MicIcon({ active }: { active: boolean }) {
  return (
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
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function MusicNoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/**
 * App-level bottom tab bar.
 * Hidden automatically by parent layout on /record and /edit routes.
 */
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
      // Active on band home only — not on specific session/clip pages (Clips tab handles those)
      match: (p: string) =>
        p.startsWith(`/bands/${bandId}`) &&
        !p.startsWith(`/bands/${bandId}/sessions/`) &&
        !p.includes("/settings"),
    },
    {
      href: `/record?bandId=${bandId}${sessionId ? `&sessionId=${sessionId}` : ""}`,
      label: "Record",
      icon: <MicIcon active={isRecording} />,
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
      // Only meaningful when inside a session — avoids two tabs going to the same URL
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
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-elevated"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-14 items-stretch">
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
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
                isActive ? "text-accent" : "text-muted",
              )}
            >
              {/* Pulsing ring on Record tab when recording */}
              {isRec && isRecording && (
                <span className="absolute inset-0 animate-ping rounded-full bg-accent/20 pointer-events-none" />
              )}
              {tab.icon}
              <span className="text-[10px] font-medium leading-none">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
