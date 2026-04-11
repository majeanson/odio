// Catalog page — cross-session view of all band clips, split into Final and Raw.
// Final (frozen) clips are the hub for post-jam collaboration: vote, comment, share.
// Raw clips are in-progress takes, visible here for band-wide awareness.
//
// Server component for initial data; CatalogClient handles tab switching + polling.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { CatalogClient } from "@/components/clips/CatalogClient";
import type { CatalogClip } from "@/app/api/bands/[bandId]/catalog/route";
import type { ClipStage, TranscodeStatus } from "@/types";

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  const { bandId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: session.user.email! } },
  });
  if (!membership) notFound();

  // Same query as the catalog API route — rendered server-side for instant load
  const rawClips = await prisma.clip.findMany({
    where: { session: { bandId } },
    include: {
      session: { select: { id: true, name: true, createdAt: true } },
      _count: { select: { versions: true, comments: true } },
      votes: { select: { versionId: true, value: true } },
      versions: { select: { id: true, versionNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const clips: CatalogClip[] = rawClips.map((c) => {
    const frozenVer = c.frozenVersionId
      ? c.versions.find((v) => v.id === c.frozenVersionId) ?? null
      : null;
    const relevantVotes = c.frozenVersionId
      ? c.votes.filter((v) => v.versionId === c.frozenVersionId)
      : [];
    return {
      id: c.id,
      name: c.name,
      sessionId: c.sessionId,
      sessionName: c.session.name,
      sessionCreatedAt: c.session.createdAt.toISOString(),
      stage: c.stage as ClipStage,
      frozen: c.frozen,
      frozenVersionId: c.frozenVersionId,
      frozenVersionNumber: frozenVer?.versionNumber ?? null,
      finalDriveFileId: c.finalDriveFileId,
      driveFileId: c.driveFileId,
      sourceDurationMs: c.sourceDurationMs,
      publicToken: c.publicToken,
      transcodeStatus: c.transcodeStatus as TranscodeStatus,
      createdAt: c.createdAt.toISOString(),
      versionCount: c._count.versions,
      commentCount: c._count.comments,
      votes: {
        KEEP:   relevantVotes.filter((v) => v.value === "KEEP").length,
        REVISE: relevantVotes.filter((v) => v.value === "REVISE").length,
        PASS:   relevantVotes.filter((v) => v.value === "PASS").length,
      },
    };
  });

  const finalCount = clips.filter((c) => c.frozen).length;
  const rawCount = clips.filter((c) => !c.frozen).length;

  return (
    <div className="flex min-h-svh flex-col bg-base text-primary pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border bg-base/80 backdrop-blur px-5">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-primary">Catalog</h1>
          <p className="text-xs text-muted">
            {finalCount} final · {rawCount} raw
          </p>
        </div>
        {/* Future: Album creation button will live here */}
      </header>

      <main className="py-5">
        <CatalogClient bandId={bandId} initialClips={clips} />
      </main>
    </div>
  );
}
