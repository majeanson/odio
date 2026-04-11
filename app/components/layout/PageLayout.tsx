import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageLayoutProps {
  title?: string;
  headerRight?: ReactNode;
  backHref?: string;
  children: ReactNode;
  /** When true, removes bottom padding for the tab bar (used on full-screen pages) */
  fullScreen?: boolean;
  className?: string;
}

/**
 * Standard page wrapper with optional header and back button.
 * Provides consistent padding and tab-bar clearance across all screens.
 */
export function PageLayout({
  title,
  headerRight,
  backHref,
  children,
  fullScreen = false,
  className,
}: PageLayoutProps) {
  return (
    <div
      className={cn(
        "flex min-h-svh flex-col bg-base text-primary",
        !fullScreen && "pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-0",
        className,
      )}
    >
      {/* Header */}
      {(title || headerRight || backHref) && (
        <header
          className="sticky z-30 flex h-[72px] items-center gap-3 border-b border-border bg-base px-5"
          style={{ top: "var(--upload-banner-h, 0px)" }}
        >
          {backHref && (
            <Link
              href={backHref}
              aria-label="Go back"
              className="flex items-center gap-1 text-secondary hover:text-primary transition-colors -ml-1"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-7"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
          )}
          {title && (
            <h1 className="flex-1 truncate font-display text-2xl font-bold text-primary tracking-tight">
              {title}
            </h1>
          )}
          {headerRight && <div className="ml-auto">{headerRight}</div>}
        </header>
      )}

      {/* Content */}
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
