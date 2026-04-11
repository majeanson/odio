"use client";

// Share button for the band home header.
// Opens a bottom sheet with the band invite QR code + copyable link.
// Replaces the settings gear icon that was moved to the Band tab.

import { useState, useEffect } from "react";
import QRCode from "react-qr-code";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";

interface BandShareButtonProps {
  inviteCode: string;
}

export function BandShareButton({ inviteCode }: BandShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join/${inviteCode}`);
  }, [inviteCode]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available (e.g. non-HTTPS) — ignore silently
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Invite bandmates"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-secondary hover:text-primary transition-colors"
      >
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
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="3" height="3" />
          <path d="M17 17h3v3" />
        </svg>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Invite bandmates">
        <div className="flex flex-col items-center gap-4">
          {joinUrl && (
            <div className="rounded-2xl bg-white p-4 self-center">
              <QRCode value={joinUrl} size={200} />
            </div>
          )}
          <p className="text-center text-sm text-secondary">
            Scan to join the band, or share the link below
          </p>
          <p className="break-all font-mono text-xs text-muted text-center select-all px-2">
            {joinUrl}
          </p>
          <Button onClick={copyLink} fullWidth size="lg">
            {copied ? "Copied!" : "Copy invite link"}
          </Button>
          <Button onClick={() => setOpen(false)} variant="ghost" fullWidth>
            Done
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
