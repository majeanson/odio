"use client";

// Recording screen — full-screen takeover, tab bar hidden.
// Designed for one-handed use in a dim room.
// Layout: timer → level meter → (space) → stamps + add note → record button
// Mic picker shown when multiple audio inputs are detected.

import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { useRecorder } from "@/hooks/useRecorder";
import { LiveWaveform } from "@/components/recording/LiveWaveform";
import { StampRow } from "@/components/recording/StampRow";
import { DevicePicker } from "@/components/recording/DevicePicker";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/utils";

function RecordingScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bandId = searchParams.get("bandId") ?? "";
  const sessionId = searchParams.get("sessionId") ?? undefined;

  const {
    state,
    level,
    elapsedMs,
    stamps,
    result,
    error,
    devices,
    selectedDeviceId,
    deviceFallbackWarning,
    analyserRef,
    selectDevice,
    start,
    stop,
    addStamp,
    addAnnotation,
  } = useRecorder({ bandId, sessionId });

  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);

  const isRecording = state === "recording";
  const isStopping = state === "stopping";

  // After stop, navigate to post-record screen
  if (state === "stopped" && result) {
    router.push(
      `/record/post?tempId=${result.tempId}&bandId=${bandId}${sessionId ? `&sessionId=${sessionId}` : ""}`,
    );
  }

  function handleNoteSubmit() {
    if (noteText.trim()) {
      addAnnotation(noteText.trim());
      setNoteText("");
    }
    setNoteSheetOpen(false);
  }

  const hasMultipleDevices = devices.length > 1;

  return (
    <div className="flex min-h-svh flex-col bg-base text-primary px-6 pt-safe md:max-w-lg md:mx-auto">
      {/* Cancel / back — only shown when idle (not mid-recording) */}
      {!isRecording && !isStopping && state !== "stopped" && (
        <div className="flex h-[72px] items-center">
          <button
            onClick={() => router.back()}
            aria-label="Cancel"
            className="flex items-center gap-2 text-secondary hover:text-primary transition-colors"
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
            <span className="text-base font-semibold">Cancel</span>
          </button>
        </div>
      )}

      {/* Status bar area */}
      <div className="flex flex-col gap-2 pt-10">
        {/* Elapsed timer */}
        <div
          className="font-mono text-[clamp(4.5rem,18vw,7rem)] font-bold tabular-nums text-primary leading-none"
          aria-live="polite"
          aria-atomic
        >
          {isRecording || isStopping
            ? formatDuration(elapsedMs)
            : "0:00"}
        </div>

        {/* Recording state label */}
        <p className="text-xl font-semibold tracking-wide text-secondary">
          {isRecording && "Recording…"}
          {isStopping && "Stopping…"}
          {state === "idle" && "Ready to record"}
          {state === "stopped" && "Saving…"}
        </p>
        {isRecording && (
          <p className="text-sm text-muted mt-0.5">Tap the button to stop</p>
        )}

        {/* Waveform / level meter */}
        <div className="mt-3" aria-label="Audio level" role="meter" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
          {isRecording ? (
            <LiveWaveform analyserRef={analyserRef} />
          ) : (
            <div className="h-2 w-full rounded-full bg-elevated overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all duration-75" style={{ width: `${level * 100}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Device fallback toast */}
      {deviceFallbackWarning && (
        <div className="mt-4 rounded-xl bg-elevated px-4 py-2.5 text-sm text-secondary">
          Using built-in mic — selected device unavailable
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stamps row */}
      {isRecording && <StampRow onStamp={addStamp} count={stamps.length} />}

      {/* Add note button */}
      {isRecording && (
        <button
          onClick={() => setNoteSheetOpen(true)}
          className="mb-8 self-center text-base text-secondary underline underline-offset-4 hover:text-primary"
        >
          Add note
        </button>
      )}

      {/* Record / Stop button + mic picker */}
      <div className="flex items-center justify-center gap-8 pb-14">
        {/* Mic input picker — only shown when multiple inputs detected and not recording */}
        {hasMultipleDevices && !isRecording && (
          <button
            onClick={() => setDevicePickerOpen(true)}
            aria-label="Choose microphone"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-secondary hover:text-primary transition-colors border border-border"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-7"
              aria-hidden
            >
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          </button>
        )}

        <button
          onClick={isRecording ? stop : start}
          disabled={isStopping || state === "stopped"}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          className={[
            "relative flex h-32 w-32 items-center justify-center rounded-full transition-all duration-75",
            "focus-visible:outline-4 focus-visible:outline-accent focus-visible:outline-offset-4",
            isRecording
              ? "bg-danger shadow-[0_6px_0_0_rgba(239,68,68,0.4)] active:translate-y-[6px] active:shadow-none"
              : "bg-accent shadow-[0_6px_0_0_#78350f] active:translate-y-[6px] active:shadow-none",
            (isStopping || state === "stopped") && "opacity-50",
          ].filter(Boolean).join(" ")}
        >
          {/* Pulsing ring when recording */}
          {isRecording && (
            <span className="absolute inset-0 animate-ping rounded-full bg-danger/30 pointer-events-none" />
          )}

          {/* Icon: square = stop, circle = record */}
          {isRecording ? (
            <span className="h-10 w-10 rounded-md bg-white" aria-hidden />
          ) : (
            <span className="h-10 w-10 rounded-full bg-[#080808]" aria-hidden />
          )}
        </button>
      </div>

      {/* Add note bottom sheet */}
      <BottomSheet
        open={noteSheetOpen}
        onClose={() => setNoteSheetOpen(false)}
        title="Add note"
      >
        <div className="space-y-3">
          <input
            autoFocus
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNoteSubmit()}
            placeholder="What's happening right now?"
            maxLength={200}
            className="w-full rounded-2xl border border-border bg-surface px-5 py-4 text-base text-primary placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <Button
            onClick={handleNoteSubmit}
            disabled={!noteText.trim()}
            fullWidth
          >
            Add note
          </Button>
        </div>
      </BottomSheet>

      {/* Device picker */}
      <DevicePicker
        open={devicePickerOpen}
        devices={devices}
        selectedId={selectedDeviceId}
        onSelect={(id) => {
          selectDevice(id);
          setDevicePickerOpen(false);
        }}
        onDismiss={() => setDevicePickerOpen(false)}
      />
    </div>
  );
}

export default function RecordPage() {
  return (
    <Suspense>
      <RecordingScreen />
    </Suspense>
  );
}
