// Clip detail page — server component.
// Single concern: load data, hand off to ClipDetailClient.
// The client component owns all interactive state (selected version, player, votes, comments).

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { PageLayout } from "@/components/layout/PageLayout";
import { ClipDetailClient } from "@/components/clips/ClipDetailClient";
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
      versions: { orderBy: { versionNumber: "asc" }, include: { votes: true } },
      stamps:   { orderBy: { timestampMs: "asc" } },
      votes:    true,
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!clip) notFound();

  const canEdit = membership.role !== "MEMBER";

  return (
    <PageLayout
      title={clip.name}
      backHref={`/bands/${bandId}/sessions/${sessionId}`}
    >
      <ClipDetailClient
        clipId={clip.id}
        clipName={clip.name}
        bandId={bandId}
        sessionId={sessionId}
        sourceDurationMs={clip.sourceDurationMs ?? 0}
        frozen={clip.frozen}
        frozenVersionId={clip.frozenVersionId}
        versions={clip.versions.map(mapClipVersion)}
        stamps={clip.stamps.map(mapStamp)}
        canEdit={canEdit}
        currentUserRole={membership.role as import("@/types").BandRole}
        editHref={`/bands/${bandId}/sessions/${sessionId}/clips/${clipId}/edit`}
        initialStage={clip.stage as ClipStage}
        transcodeStatus={clip.transcodeStatus as "PENDING" | "DONE" | "FAILED"}
        publicToken={clip.publicToken}
        driveFileId={clip.driveFileId}
        memberCount={memberCount}
        currentUserEmail={session!.user!.email!}
        initialVotes={clip.votes.map(mapVote)}
        initialComments={clip.comments.map(mapComment)}
      />
    </PageLayout>
  );
}
