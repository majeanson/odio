"use client";

// Fixed top banner shown whenever an upload is in progress or paused.
// Appears on any screen, persists until upload + transcode confirmed complete.

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
      return { text: `Uploading ${upload.clipName}…`, variant: "uploading" };
    case "paused":
      return {
        text: `Upload paused — waiting for connection`,
        variant: "paused",
      };
    case "token-error":
      return {
        text: "Drive connection needs renewal — ask band creator to re-authorize",
        variant: "error",
      };
    case "session-error":
      return {
        text: "Session expired — sign in again to resume upload",
        variant: "error",
      };
    default:
      return { text: `${upload.clipName} pending upload`, variant: "paused" };
  }
}

/**
 * Fixed top banner for active upload states.
 * Shows for all pending uploads; collapses when all are done.
 * Positioned above the page content at top-0 with z-50.
 */
export function UploadBanner({ uploads, onRetry, onDiscard, onSaveToDevice }: UploadBannerProps) {
  if (uploads.length === 0) return null;

  // Show the most actionable upload first
  const primary = uploads.find((u) => u.status === "token-error")
    ?? uploads.find((u) => u.status === "session-error")
    ?? uploads.find((u) => u.status === "paused")
    ?? uploads[0];

  const { text, variant } = statusMessage(primary);
  const moreCount = uploads.length - 1;

  const variantStyles = {
    uploading: "bg-accent text-base",
    paused: "bg-elevated border-b border-border text-secondary",
    error: "bg-danger/10 border-b border-danger/30 text-danger",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed top-0 left-0 right-0 z-50 px-4 py-2",
        variantStyles[variant],
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        {variant === "uploading" && (
          <span className="size-3 rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0" />
        )}
        <span className="flex-1 truncate">{text}</span>
        {moreCount > 0 && (
          <span className="text-xs opacity-70">+{moreCount} more</span>
        )}
        {(variant === "paused" || variant === "error") && onRetry && (
          <button
            onClick={() => onRetry(primary.tempId)}
            className="text-xs font-medium underline underline-offset-2 flex-shrink-0"
          >
            Retry
          </button>
        )}
        {variant === "error" && onSaveToDevice && (
          <button
            onClick={() => onSaveToDevice(primary.tempId)}
            className="text-xs font-medium underline underline-offset-2 flex-shrink-0"
          >
            Save file
          </button>
        )}
      </div>

      {/* Progress bar for active uploads */}
      {variant === "uploading" && primary.byteOffset && primary.blob.size > 0 && (
        <div className="mt-1 h-0.5 rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{
              width: `${Math.round((primary.byteOffset / primary.blob.size) * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
