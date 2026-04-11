// Session detail page — clip list.
// Server component for initial data; ClipCard handles interactivity.
// SessionHeaderClient handles inline rename + QR code for session URL.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { ClipCard } from "@/components/clips/ClipCard";
import { SessionHeaderClient } from "@/components/sessions/SessionHeaderClient";
import type { Clip } from "@/types";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ bandId: string; sessionId: string }>;
}) {
  const { bandId, sessionId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Verify membership
  const membership = await prisma.bandMember.findUnique({
    where: {
      bandId_userEmail: { bandId, userEmail: session!.user!.email! },
    },
  });
  if (!membership) notFound();

  // Load session with clips (verify it belongs to this band via bandId check)
  const jamSession = await prisma.jamSession.findFirst({
    where: { id: sessionId, bandId },
    include: {
      clips: {
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { versions: true } } },
      },
    },
  });

  if (!jamSession) notFound();

  const canRecord = membership.role !== "MEMBER";

  // Map Prisma result to our Clip type
  const clips: Clip[] = jamSession.clips.map((c) => ({
    id: c.id,
    sessionId: c.sessionId,
    name: c.name,
    stage: c.stage as Clip["stage"],
    driveFileId: c.driveFileId,
    finalDriveFileId: c.finalDriveFileId,
    sourceDurationMs: c.sourceDurationMs,
    frozen: c.frozen,
    frozenVersionId: c.frozenVersionId,
    publicToken: c.publicToken,
    transcodeStatus: c.transcodeStatus as Clip["transcodeStatus"],
    createdBy: c.createdBy,
    recordedByEmail: c.recordedByEmail,
    createdAt: c.createdAt.toISOString(),
    _count: { versions: c._count.versions },
  }));

  return (
    <div className="flex min-h-svh flex-col bg-base text-primary pb-safe">
      {/* Session header with inline rename + QR */}
      <SessionHeaderClient
        bandId={bandId}
        sessionId={sessionId}
        initialName={jamSession.name}
        initialNotes={jamSession.notes}
        canEdit={canRecord}
      />

      {/* Record button */}
      {canRecord && (
        <div className="flex justify-end px-6 pb-3">
          <ButtonLink
            href={`/record?bandId=${bandId}&sessionId=${sessionId}`}
            size="sm"
          >
            + Record
          </ButtonLink>
        </div>
      )}

      {/* Clip list */}
      <main className="px-4 py-2">
        {clips.length === 0 ? (
          <EmptyState
            icon="🎵"
            title="No clips yet"
            description={
              canRecord
                ? "Hit Record to capture your first take"
                : "Waiting for someone to start recording"
            }
            action={
              canRecord ? (
                <ButtonLink
                  href={`/record?bandId=${bandId}&sessionId=${sessionId}`}
                >
                  Start recording
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-2" role="list">
            {clips.map((clip) => (
              <li key={clip.id}>
                <ClipCard clip={clip} bandId={bandId} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
