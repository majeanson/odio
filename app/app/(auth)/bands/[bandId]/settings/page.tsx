// Band settings page — members list, roles, invite link, Drive folder link.
// Server component for data; client interactions for copy/share.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { PageLayout } from "@/components/layout/PageLayout";
import { BandSettingsClient } from "@/components/bands/BandSettingsClient";
import type { BandMember } from "@/types";

export default async function BandSettingsPage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  const { bandId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await prisma.bandMember.findUnique({
    where: {
      bandId_userEmail: { bandId, userEmail: session!.user!.email! },
    },
    include: {
      band: {
        include: {
          members: {
            orderBy: { joinedAt: "asc" },
          },
        },
      },
    },
  });

  if (!membership) notFound();

  const { band } = membership;

  const members: BandMember[] = band.members.map((m) => ({
    bandId: m.bandId,
    userEmail: m.userEmail,
    displayName: m.displayName,
    role: m.role as BandMember["role"],
    joinedAt: m.joinedAt.toISOString(),
  }));

  return (
    <PageLayout title="Band Settings" backHref={`/bands/${bandId}`}>
      <BandSettingsClient
        bandId={bandId}
        bandName={band.name}
        members={members}
        currentUserEmail={session!.user!.email!}
        currentUserRole={membership.role as BandMember["role"]}
        inviteCode={band.inviteCode}
        driveFolderId={band.driveFolderId}
      />
    </PageLayout>
  );
}
