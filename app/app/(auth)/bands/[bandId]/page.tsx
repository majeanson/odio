// Band home page — session list.
// Server component: fetches sessions directly from Postgres.
// Empty state directs user to record first.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageLayout } from "@/components/layout/PageLayout";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { formatSessionDate, formatRelativeTime } from "@/lib/utils";

export default async function BandHomePage({
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
    include: { band: { select: { name: true } } },
  });

  if (!membership) notFound();

  const sessions = await prisma.jamSession.findMany({
    where: { bandId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { clips: true } } },
  });

  const canRecord = membership.role !== "MEMBER";

  return (
    <PageLayout
      title={membership.band.name}
      headerRight={
        <Link
          href={`/bands/${bandId}/settings`}
          aria-label="Band settings"
          className="text-secondary hover:text-primary transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      }
    >
      <div className="px-4 py-4">
        {sessions.length === 0 ? (
          <EmptyState
            icon="🎸"
            title="No jams yet"
            description={
              canRecord
                ? "Hit Record to start your first session"
                : "Waiting for your band to start recording"
            }
            action={
              canRecord ? (
                <ButtonLink href={`/record?bandId=${bandId}`}>
                  Start recording
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-2" role="list">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/bands/${bandId}/sessions/${s.id}`}
                  className="flex items-center justify-between rounded-xl bg-surface px-4 py-4 transition-colors active:bg-elevated"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-primary">{s.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatSessionDate(s.createdAt)} ·{" "}
                      {s._count.clips} clip{s._count.clips !== 1 ? "s" : ""} ·{" "}
                      {formatRelativeTime(s.createdAt)}
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4 shrink-0 text-muted ml-3"
                    aria-hidden
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}
