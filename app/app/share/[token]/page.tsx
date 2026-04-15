// Public frozen clip page — /share/[token]
// No auth required. Only shows publicly shared, frozen clips.
// Provides a simple audio player + clip info + download link.

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatDuration, remapStampsForCuts } from "@/lib/utils";
import { STAMP_EMOJI, STAMP_COLORS, STAGE_LABELS } from "@/types";
import type { ClipStage, StampType, CutMark } from "@/types";
import { PublicPlayer } from "@/components/share/PublicPlayer";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const clip = await prisma.clip.findUnique({
    where: { publicToken: token },
    include: {
      session: {
        include: {
          band: { select: { name: true } },
        },
      },
      versions: {
        select: { id: true, resultDurationMs: true, cutMarks: true },
      },
      stamps: { orderBy: { timestampMs: "asc" } },
    },
  });

  if (!clip || !clip.frozen || !clip.publicToken) notFound();

  const frozenVersion = clip.frozenVersionId
    ? (clip.versions.find((v) => v.id === clip.frozenVersionId) ?? null)
    : null;

  const frozenCuts = Array.isArray(frozenVersion?.cutMarks)
    ? (frozenVersion!.cutMarks as unknown as CutMark[])
    : [];

  const remappedStamps = remapStampsForCuts(
    clip.stamps.map((s) => ({ id: s.id, timestampMs: s.timestampMs, type: s.type as StampType })),
    frozenCuts,
  );

  return (
    <div className="flex min-h-svh flex-col bg-base text-primary">
      {/* Header */}
      <header className="px-6 pt-safe pt-10 pb-6">
        <p className="text-xs font-bold text-muted uppercase tracking-wider">
          {clip.session.band.name} · {clip.session.name}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-primary">{clip.name}</h1>

        <div className="mt-3 flex items-center gap-3">
          {clip.sourceDurationMs != null && (
            <span className="font-mono text-base text-secondary">
              {formatDuration(
                frozenVersion?.resultDurationMs ?? clip.sourceDurationMs,
              )}
            </span>
          )}
          <span className="rounded-full bg-elevated px-2.5 py-1 text-xs text-secondary">
            {STAGE_LABELS[clip.stage as ClipStage]}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-1 text-xs text-accent">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
              aria-hidden
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Final
          </span>
        </div>
      </header>

      {/* Public audio player */}
      <main className="flex-1 px-5">
        <PublicPlayer
          token={token}
          sourceDurationMs={frozenVersion?.resultDurationMs ?? clip.sourceDurationMs ?? 0}
          stamps={remappedStamps}
        />
      </main>

      {/* Footer */}
      <footer className="px-6 py-8 text-center">
        <p className="text-xs text-muted">
          Made with{" "}
          <a
            href="/"
            className="text-accent underline underline-offset-2"
          >
            Odio
          </a>{" "}
          — Jam. Cut. Keep.
        </p>
      </footer>
    </div>
  );
}
