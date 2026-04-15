"use client";
// SessionQrSheet — bottom sheet showing QR code for the session URL.
// Pure presenter: no state, no side effects beyond rendering.

import QRCode from "react-qr-code";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface SessionQrSheetProps {
  open: boolean;
  onClose: () => void;
  sessionUrl: string;
}

export function SessionQrSheet({ open, onClose, sessionUrl }: SessionQrSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Share session link">
      <div className="flex flex-col items-center gap-4 py-4">
        {sessionUrl && (
          <div className="rounded-2xl bg-white p-4">
            <QRCode value={sessionUrl} size={200} />
          </div>
        )}
        <p className="text-center text-sm text-secondary">
          Scan to open on another device or share with a bandmate
        </p>
        <p className="break-all font-mono text-xs text-muted text-center select-all">
          {sessionUrl}
        </p>
      </div>
    </BottomSheet>
  );
}
