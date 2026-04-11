"use client";

// Bottom sheet / modal overlay.
// Used for confirmations, input sheets (Add Note, Delete confirmation, etc.)
// Renders a dark overlay + sliding panel from bottom.

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Accessible bottom sheet. Closes on overlay click or Escape key.
 * Used for: confirmations, note input, device picker, cleanup confirmations.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: BottomSheetProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cn(
          "relative z-10 rounded-t-3xl border-t border-border bg-elevated p-6",
          "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          className,
        )}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />

        {title && (
          <h2 className="mb-4 text-base font-semibold text-primary">{title}</h2>
        )}

        {children}
      </div>
    </div>
  );
}
