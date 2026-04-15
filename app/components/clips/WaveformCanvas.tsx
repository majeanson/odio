"use client";
// WaveformCanvas — renders the waveform container, cut bands, edge indicators,
// drag overlay, split marker, and loading/error states.
//
// Pure presenter: owns no state, no refs, no WaveSurfer access.
// All interaction is forwarded via pointerHandlers from useCutInteraction.
// Cut band positions are computed from props; no DOM queries happen here.

import { Fragment } from "react";
import { AudioBars } from "@/components/ui/AudioBars";

/** Must match EDGE_GRAB_PX in useCutInteraction so hit zones align with visuals. */
const EDGE_GRAB_PX = 24;

export interface CanvasCutMark {
  id: string;
  startMs: number;
  endMs: number;
}

export interface WaveformCanvasProps {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  wsState: "loading" | "ready" | "error";
  audioErrorStatus: number | null;
  onRetry: () => void;

  /**
   * "edit"   (default) — red highlight bands + edge grip handles + preview cut.
   *                      Used by WaveformEditor (trim mode).
   * "player"           — dark masking bands (near-opaque) + no edge handles.
   *                      Used by WaveformPlayer and PublicPlayer.
   */
  variant?: "edit" | "player";

  // Cut band visualization
  cutMarks: CanvasCutMark[];
  previewCut: { startMs: number; endMs: number } | null;
  effectiveDurationMs: number;
  waveScrollLeft: number;
  waveTotalWidth: number;
  containerWidthPx: number;

  // Split marker
  splitMode: boolean;
  splitLinePercent: number;

  // Overlay interaction — all pointer events forwarded from the caller's hook
  pointerHandlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
  cursorStyle: string;
}

export function WaveformCanvas({
  containerRef, wsState, audioErrorStatus, onRetry,
  variant = "edit",
  cutMarks, previewCut, effectiveDurationMs, waveScrollLeft, waveTotalWidth, containerWidthPx,
  splitMode, splitLinePercent,
  pointerHandlers, cursorStyle,
}: WaveformCanvasProps) {
  const isPlayer = variant === "player";
  // Convert audio milliseconds to visible pixels on the canvas.
  // Accounts for scroll offset so bands move with the waveform during zoom/pan.
  function edgePx(ms: number): number {
    if (effectiveDurationMs === 0) return 0;
    const totalW = waveTotalWidth > 0 ? waveTotalWidth : containerWidthPx;
    return (ms / effectiveDurationMs) * totalW - waveScrollLeft;
  }

  return (
    <div className="px-5 pt-3 pb-0">
      <div className="relative">

        {/* WaveSurfer mounts its canvas here. interact:false means the canvas
            itself doesn't handle any pointer events — the overlay div below does. */}
        <div ref={containerRef} className="w-full" />

        {/* Cut bands — overlay showing cut/muted regions.
            "edit"   variant: semi-transparent red (highlights region to cut)
            "player" variant: near-opaque dark (masks the region as unplayable)
            pointer-events:none so all touches fall through to the overlay div. */}
        {wsState === "ready" && !splitMode && (
          <>
            {cutMarks.map((cm) => {
              const sPx = edgePx(cm.startMs);
              const ePx = edgePx(cm.endMs);
              if (ePx <= 0 || sPx >= containerWidthPx) return null;
              return (
                <div
                  key={cm.id}
                  className="pointer-events-none absolute top-0 bottom-0"
                  style={{
                    left: Math.max(0, sPx),
                    width: Math.min(containerWidthPx, ePx) - Math.max(0, sPx),
                    background: isPlayer ? "rgba(8,8,8,0.88)" : "rgba(239,68,68,0.28)",
                    zIndex: 5,
                  }}
                />
              );
            })}

            {/* Preview band — lighter red, shown while dragging to create a new cut (edit only) */}
            {!isPlayer && previewCut && (() => {
              const sPx = edgePx(previewCut.startMs);
              const ePx = edgePx(previewCut.endMs);
              if (ePx <= 0 || sPx >= containerWidthPx) return null;
              return (
                <div
                  className="pointer-events-none absolute top-0 bottom-0"
                  style={{
                    left: Math.max(0, sPx),
                    width: Math.min(containerWidthPx, ePx) - Math.max(0, sPx),
                    background: "rgba(239,68,68,0.15)",
                    zIndex: 5,
                  }}
                />
              );
            })()}
          </>
        )}

        {/* Drag overlay — single div that intercepts all pointer events.
            z-index 20 puts it above cut bands (z-5) but the edge indicators
            are also pointer-events:none (z-30) so there's no capture conflict. */}
        {wsState === "ready" && !splitMode && (
          <div
            className="absolute inset-0 touch-none select-none"
            style={{ cursor: cursorStyle, zIndex: 20 }}
            onPointerDown={pointerHandlers.onPointerDown}
            onPointerMove={pointerHandlers.onPointerMove}
            onPointerUp={pointerHandlers.onPointerUp}
            onPointerCancel={pointerHandlers.onPointerCancel}
          />
        )}

        {/* Cut edge visual indicators — vertical line + grip dots at each boundary.
            Only rendered in edit variant (player has no editable edges).
            Purely decorative (pointer-events:none). z-30 renders them on top. */}
        {wsState === "ready" && !splitMode && !isPlayer && cutMarks.map((cm) => {
          const sPx = edgePx(cm.startMs);
          const ePx = edgePx(cm.endMs);
          return (
            <Fragment key={cm.id}>
              {sPx > -EDGE_GRAB_PX && sPx < containerWidthPx + EDGE_GRAB_PX && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 flex items-center"
                  style={{ left: sPx - EDGE_GRAB_PX, width: EDGE_GRAB_PX * 2, zIndex: 30 }}
                >
                  <div className="absolute inset-y-0 w-0.5 bg-danger/70" style={{ left: EDGE_GRAB_PX - 1 }} />
                  <div
                    className="absolute flex flex-col gap-0.5 items-center"
                    style={{ left: EDGE_GRAB_PX - 6, top: "50%", transform: "translateY(-50%)" }}
                  >
                    <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                    <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                    <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                  </div>
                </div>
              )}
              {ePx > -EDGE_GRAB_PX && ePx < containerWidthPx + EDGE_GRAB_PX && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 flex items-center"
                  style={{ left: ePx - EDGE_GRAB_PX, width: EDGE_GRAB_PX * 2, zIndex: 30 }}
                >
                  <div className="absolute inset-y-0 w-0.5 bg-danger/70" style={{ left: EDGE_GRAB_PX - 1 }} />
                  <div
                    className="absolute flex flex-col gap-0.5 items-center"
                    style={{ left: EDGE_GRAB_PX - 6, top: "50%", transform: "translateY(-50%)" }}
                  >
                    <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                    <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                    <div className="w-1.5 h-1 rounded-full bg-danger/80" />
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}

        {/* Split position marker — cyan vertical line at the selected split point */}
        {splitMode && wsState === "ready" && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-[2px] -translate-x-1/2"
            style={{
              left: `${splitLinePercent}%`,
              background: "#22d3ee",
              boxShadow: "0 0 8px 3px rgba(34,211,238,0.35)",
            }}
          >
            <div
              className="absolute -top-0.5 left-1/2 -translate-x-1/2 size-3 rotate-45"
              style={{ background: "#22d3ee" }}
            />
          </div>
        )}
      </div>

      {/* Loading state */}
      {wsState === "loading" && (
        <div className="h-[100px] flex items-center justify-center">
          <AudioBars className="size-5 text-accent" />
        </div>
      )}

      {/* Error state */}
      {wsState === "error" && (
        <div className="h-[100px] flex flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted text-center leading-snug">
            {audioErrorStatus === 404
              ? "Audio not yet available — upload may still be processing"
              : audioErrorStatus === 401 || audioErrorStatus === 503
                ? "Drive connection needs renewal"
                : "Audio unavailable"}
          </p>
          <div className="flex items-center gap-3">
            {(audioErrorStatus === 401 || audioErrorStatus === 503) && (
              <a
                href="/login"
                className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-medium text-white"
              >
                Reconnect Drive
              </a>
            )}
            <button
              onClick={onRetry}
              className="text-xs text-muted underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
