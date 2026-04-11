// Clip detail page — waveform editor, version history, collaboration.
// Server component for initial data load; client components handle interactivity.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageLayout } from "@/components/layout/PageLayout";
import { WaveformEditor } from "@/components/clips/WaveformEditor";
import { ClipActionsClient } from "@/components/clips/ClipActionsClient";
import { CollaborationSection } from "@/components/clips/CollaborationSection";
import { mapClipVersion, mapStamp, mapVote, mapComment } from "@/lib/mappers";
import type { ClipStage } from "@/types";

export default async function ClipDetailPage({
  params,
}: {
  params: Promise<{ bandId: string; sessionId: string; clipId: string }>;
}) {
  const { bandId, sessionId, clipId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [membership, memberCount] = await Promise.all([
    prisma.bandMember.findUnique({
      where: { bandId_userEmail: { bandId, userEmail: session!.user!.email! } },
    }),
    prisma.bandMember.count({ where: { bandId } }),
  ]);
  if (!membership) notFound();

  const clip = await prisma.clip.findFirst({
    where: { id: clipId, sessionId },
    include: {
      versions: {
        orderBy: { versionNumber: "asc" },
        include: { votes: true },
      },
      stamps: {
        orderBy: { timestampMs: "asc" },
      },
      votes: true,
      comments: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!clip) notFound();

  const canEdit = membership.role !== "MEMBER";
  const currentUserEmail = session!.user!.email!;

  const versions = clip.versions.map(mapClipVersion);
  const stamps = clip.stamps.map(mapStamp);
  const initialVotes = clip.votes.map(mapVote);
  const initialComments = clip.comments.map(mapComment);

  return (
    <PageLayout
      title={clip.name}
      backHref={`/bands/${bandId}/sessions/${sessionId}`}
    >
      <div className="px-4 py-4 space-y-4">
        {/* Waveform — shows H:MM:SS position, version pills, read-only.
            Full editor opens in /edit (full-screen, tab bar hidden). */}
        <WaveformEditor
          clipId={clip.id}
          bandId={bandId}
          sessionId={sessionId}
          sourceDurationMs={clip.sourceDurationMs ?? 0}
          frozen={clip.frozen}
          frozenVersionId={clip.frozenVersionId}
          canEdit={false}
          initialVersions={versions}
          stamps={stamps}
        />

        {/* Edit button — navigates to full-screen editor route */}
        {canEdit && !clip.frozen && (
          <Link
            href={`/bands/${bandId}/sessions/${sessionId}/clips/${clipId}/edit`}
            className="flex w-full items-center justify-center rounded-xl bg-elevated border border-border px-4 py-3 text-sm font-medium text-secondary hover:text-primary hover:border-accent transition-colors"
          >
            Open editor
          </Link>
        )}

        {/* Stage selector, freeze action, public share toggle */}
        <ClipActionsClient
          clipId={clip.id}
          initialStage={clip.stage as ClipStage}
          frozen={clip.frozen}
          transcodeStatus={clip.transcodeStatus as "PENDING" | "DONE" | "FAILED"}
          publicToken={clip.publicToken}
          canEdit={canEdit}
          currentUserRole={membership.role as import("@/types").BandRole}
          versions={versions}
          frozenVersionId={clip.frozenVersionId}
          driveFileId={clip.driveFileId}
        />

        {/* Collaboration — votes + comments */}
        <CollaborationSection
          clipId={clip.id}
          memberCount={memberCount}
          currentUserEmail={currentUserEmail}
          frozen={clip.frozen}
          versions={versions}
          initialVotes={initialVotes}
          initialComments={initialComments}
        />
      </div>
    </PageLayout>
  );
}
