// Drive file management page — shows all Drive files managed by Odio for this band.
// Lets editors delete source files and detect broken references.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { PageLayout } from "@/components/layout/PageLayout";
import { DriveFilesClient } from "@/components/bands/DriveFilesClient";

export default async function DriveFilesPage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  const { bandId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: session!.user!.email! } },
    include: { band: { select: { name: true, driveFolderId: true } } },
  });

  if (!membership) notFound();
  if (membership.role === "MEMBER") {
    redirect(`/bands/${bandId}`);
  }

  // Load all clips for this band across all sessions, with Drive file info
  const sessions = await prisma.jamSession.findMany({
    where: { bandId },
    orderBy: { createdAt: "desc" },
    include: {
      clips: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          driveFileId: true,
          finalDriveFileId: true,
          sourceDurationMs: true,
          frozen: true,
          transcodeStatus: true,
        },
      },
    },
  });

  const driveItems = sessions.flatMap((s) =>
    s.clips.map((c) => ({
      clipId: c.id,
      clipName: c.name,
      sessionName: s.name,
      sessionId: s.id,
      driveFileId: c.driveFileId,
      finalDriveFileId: c.finalDriveFileId,
      sourceDurationMs: c.sourceDurationMs,
      frozen: c.frozen,
    })),
  );

  return (
    <PageLayout title="Drive files" backHref={`/bands/${bandId}/settings`}>
      <DriveFilesClient
        bandId={bandId}
        driveFolderId={membership.band.driveFolderId}
        items={driveItems}
      />
    </PageLayout>
  );
}
