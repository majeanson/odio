// Full-screen clip editor — no nav, no tab bar (AuthShell hides it on /edit routes).
// Server component: loads clip + versions + stamps, then mounts WaveformEditor.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { WaveformEditor } from "@/components/clips/WaveformEditor";
import { formatDuration } from "@/lib/utils";
import { mapClipVersion, mapStamp } from "@/lib/mappers";

export default async function ClipEditPage({
  params,
}: {
  params: Promise<{ bandId: string; sessionId: string; clipId: string }>;
}) {
  const { bandId, sessionId, clipId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [membership, clip] = await Promise.all([
    prisma.bandMember.findUnique({
      where: { bandId_userEmail: { bandId, userEmail: session!.user!.email! } },
    }),
    prisma.clip.findFirst({
      where: { id: clipId, sessionId },
      include: {
        versions: { orderBy: { versionNumber: "asc" } },
        stamps: { orderBy: { timestampMs: "asc" } },
      },
    }),
  ]);

  if (!membership) notFound();
  if (!clip) notFound();

  // MEMBER role cannot edit
  if (membership.role === "MEMBER") {
    redirect(`/bands/${bandId}/sessions/${sessionId}/clips/${clipId}`);
  }

  // Frozen clips cannot be edited
  if (clip.frozen) {
    redirect(`/bands/${bandId}/sessions/${sessionId}/clips/${clipId}`);
  }

  const versions = clip.versions.map(mapClipVersion);
  const stamps = clip.stamps.map(mapStamp);

  const backHref = `/bands/${bandId}/sessions/${sessionId}/clips/${clipId}`;

  return (
    <div className="flex flex-col h-dvh bg-base">
      {/* Compact header — clip name + back link */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Link
          href={backHref}
          aria-label="Back to clip"
          className="flex items-center justify-center size-8 rounded-full text-muted hover:text-primary transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-primary">{clip.name}</p>
          {clip.sourceDurationMs != null && (
            <p className="font-mono text-xs text-muted">
              {formatDuration(clip.sourceDurationMs)}
            </p>
          )}
        </div>
      </header>

      {/* Editor — takes remaining height */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <WaveformEditor
          clipId={clip.id}
          sourceDurationMs={clip.sourceDurationMs ?? 0}
          frozenVersionId={clip.frozenVersionId}
          initialVersions={versions}
          stamps={stamps}
        />
      </div>
    </div>
  );
}
