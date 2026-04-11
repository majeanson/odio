"use client";

// Fixed top banner shown whenever an upload is in progress or paused.
// Appears on any screen, persists until upload + transcode confirmed complete.
//
// Side-effect: sets --upload-banner-h on <html> so PageLayout's sticky header
// can offset itself below the banner. Cleared when no uploads are active.
//
// Desktop: starts at left-[220px] so the sidebar is never obscured.

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { PendingUpload } from "@/types";

interface UploadBannerProps {
  uploads: PendingUpload[];
  onRetry?: (tempId: string) => void;
  onDiscard?: (tempId: string) => void;
  onSaveToDevice?: (tempId: string) => void;
}

function statusMessage(upload: PendingUpload): {
  text: string;
  variant: "uploading" | "paused" | "error";
} {
  switch (upload.status) {
    case "uploading":
      return { text: `Uploading ${upload.clipName}`, variant: "uploading" };
    case "paused":
      return { text: "Upload paused — waiting for connection", variant: "paused" };
    case "token-error":
      return {
        text: "Drive connection needs renewal",
        variant: "error",
      };
    case "session-error":
      return {
        text: "Session expired — sign in to resume",
        variant: "error",
      };
    default:
      return { text: `${upload.clipName} pending`, variant: "paused" };
  }
}

export function UploadBanner({ uploads, onRetry, onDiscard, onSaveToDevice }: UploadBannerProps) {
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (uploads.length === 0) {
      document.documentElement.style.removeProperty("--upload-banner-h");
      return;
    }
    const el = bannerRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty(
        "--upload-banner-h",
        `${el.offsetHeight}px`,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--upload-banner-h");
    };
  }, [uploads.length]);

  if (uploads.length === 0) return null;

  // Show the most actionable upload first
  const primary = uploads.find((u) => u.status === "token-error")
    ?? uploads.find((u) => u.status === "session-error")
    ?? uploads.find((u) => u.status === "paused")
    ?? uploads[0];

  const { text, variant } = statusMessage(primary);
  const moreCount = uploads.length - 1;

  // Compute progress as a plain number — never use `byteOffset &&` directly in JSX
  // because React renders the number 0 as literal text when the expression short-circuits.
  const progressPercent =
    primary.blob?.size > 0 && primary.byteOffset != null
      ? Math.round((primary.byteOffset / primary.blob.size) * 100)
      : 0;

  const variantStyles = {
    uploading: "bg-accent text-[#080808]",
    paused:    "bg-elevated border-b border-border text-secondary",
    error:     "bg-danger/10 border-b border-danger/30 text-danger",
  };

  return (
    <div
      ref={bannerRef}
      role="status"
      aria-live="polite"
      className={cn(
        // On desktop: start after the 220px sidebar so ODIO wordmark is never covered.
        "fixed top-0 left-0 right-0 z-50 md:left-[220px]",
        "relative overflow-hidden",
        variantStyles[variant],
      )}
    >
      <div className="flex items-center gap-2 px-4 py-2 text-sm">
        {variant === "uploading" && (
          <span className="size-3 rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0" />
        )}
        {variant === "paused" && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5 flex-shrink-0" aria-hidden>
            <path d="M10 9v6m4-6v6" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        )}
        {variant === "error" && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5 flex-shrink-0" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}

        {/* Primary message */}
        <span className="flex-1 truncate min-w-0 font-medium">
          {text}
        </span>

        {/* Progress percentage — only shown when meaningfully > 0 */}
        {variant === "uploading" && progressPercent > 0 && (
          <span className="font-mono text-xs opacity-70 flex-shrink-0 tabular-nums">
            {progressPercent}%
          </span>
        )}

        {/* Overflow count */}
        {moreCount > 0 && (
          <span className="text-xs opacity-60 flex-shrink-0">
            +{moreCount} more
          </span>
        )}

        {/* Action buttons */}
        {(variant === "paused" || variant === "error") && onRetry && (
          <button
            onClick={() => onRetry(primary.tempId)}
            style={{ minHeight: 0, minWidth: 0 }}
            className="text-xs font-semibold underline underline-offset-2 flex-shrink-0 px-1 py-0.5"
          >
            Retry
          </button>
        )}
        {variant === "error" && onSaveToDevice && (
          <button
            onClick={() => onSaveToDevice(primary.tempId)}
            style={{ minHeight: 0, minWidth: 0 }}
            className="text-xs font-semibold underline underline-offset-2 flex-shrink-0 px-1 py-0.5"
          >
            Save file
          </button>
        )}
        {variant === "error" && onDiscard && (
          <button
            onClick={() => onDiscard(primary.tempId)}
            style={{ minHeight: 0, minWidth: 0 }}
            className="text-xs opacity-60 hover:opacity-100 flex-shrink-0 px-1 py-0.5"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>

      {/* Progress bar pinned to the bottom edge of the banner — always rendered
          during upload so the layout height stays stable (no reflow when it appears).
          Width 0% is invisible but holds the DOM node. */}
      {variant === "uploading" && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/10">
          <div
            className="h-full bg-[#080808]/30 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
