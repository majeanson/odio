// Join band page — shown when a new member follows an invite link.
// Validates invite code, shows band name, and joins on confirm.
// After joining, redirects to the band home page.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageLayout } from "@/components/layout/PageLayout";
import { JoinBandClient } from "@/components/bands/JoinBandClient";

export default async function JoinBandPage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const session = await auth();
  const userEmail = session!.user!.email!;

  // Look up band by invite code
  const band = await prisma.band.findUnique({
    where: { inviteCode },
    select: { id: true, name: true, createdBy: true },
  });

  if (!band) {
    return (
      <PageLayout title="Invalid invite" backHref="/">
        <div className="px-6 py-12 text-center">
          <p className="text-4xl mb-4">🔗</p>
          <p className="text-base font-medium text-primary">Link not found</p>
          <p className="mt-2 text-sm text-secondary">
            This invite link may have expired or is invalid.
          </p>
        </div>
      </PageLayout>
    );
  }

  // Check if already a member
  const existing = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId: band.id, userEmail } },
  });

  if (existing) {
    // Already a member — go straight to the band
    redirect(`/bands/${band.id}`);
  }

  return (
    <PageLayout title="Join band" backHref="/">
      <JoinBandClient
        bandId={band.id}
        bandName={band.name}
        inviteCode={inviteCode}
        creatorEmail={band.createdBy}
      />
    </PageLayout>
  );
}
