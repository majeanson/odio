"use client";

// Audio input device picker bottom sheet.
// Shown when multiple audio inputs are available before recording starts.
// On iOS Safari, Bluetooth inputs may not enumerate — documented limitation.

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";

export interface AudioDevice {
  deviceId: string;
  label: string;
}

interface DevicePickerProps {
  open: boolean;
  devices: AudioDevice[];
  selectedId: string | null;
  onSelect: (deviceId: string) => void;
  onDismiss: () => void;
}

export function DevicePicker({
  open,
  devices,
  selectedId,
  onSelect,
  onDismiss,
}: DevicePickerProps) {
  return (
    <BottomSheet open={open} onClose={onDismiss} title="Choose microphone">
      <div className="space-y-2">
        {devices.map((device, i) => {
          const isSelected = device.deviceId === selectedId;
          const label = device.label || `Microphone ${i + 1}`;

          return (
            <button
              key={device.deviceId}
              onClick={() => onSelect(device.deviceId)}
              className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                isSelected
                  ? "bg-accent/20 text-accent"
                  : "bg-surface text-primary hover:bg-elevated"
              }`}
            >
              {/* Mic icon */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 shrink-0"
                aria-hidden
              >
                <rect x="9" y="2" width="6" height="11" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>

              <span className="flex-1 text-sm font-medium truncate">{label}</span>

              {isSelected && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 text-accent shrink-0"
                  aria-hidden
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}

        <p className="text-xs text-muted px-1 pt-1">
          Using default if your device isn&apos;t listed. iOS Bluetooth inputs
          may not appear until you connect them.
        </p>

        <Button onClick={onDismiss} variant="ghost" fullWidth>
          Use default
        </Button>
      </div>
    </BottomSheet>
  );
}
