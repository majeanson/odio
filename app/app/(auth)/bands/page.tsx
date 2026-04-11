// Multi-band home — /bands
// - Zero bands: redirect to /setup (first-run)
// - One band: fast-path redirect to /bands/[bandId]
// - Multiple bands: show band picker with create-new option

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageLayout } from "@/components/layout/PageLayout";
import { ButtonLink } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { signOut } from "@/lib/auth";

export default async function BandsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const memberships = await prisma.bandMember.findMany({
    where: { userEmail: session!.user!.email! },
    include: {
      band: {
        include: {
          _count: { select: { sessions: true, members: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  if (memberships.length === 0) {
    redirect("/setup");
  }

  // Fast-path: single band → go straight to it
  if (memberships.length === 1) {
    redirect(`/bands/${memberships[0].bandId}`);
  }

  // Multi-band: show picker
  return (
    <PageLayout title="My Bands">
      <div className="px-4 py-4 space-y-4">
        {/* Band list */}
        <ul className="space-y-2" role="list">
          {memberships.map(({ band, role }) => (
            <li key={band.id}>
              <Link
                href={`/bands/${band.id}`}
                className="flex items-center justify-between rounded-2xl bg-surface px-4 py-4 transition-colors active:bg-elevated"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-primary">{band.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {band._count.sessions} session{band._count.sessions !== 1 ? "s" : ""} ·{" "}
                    {band._count.members} member{band._count.members !== 1 ? "s" : ""} ·{" "}
                    {role === "RECORDER" ? "You created this" : role.toLowerCase()}
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

        {/* Create new band */}
        <div className="pt-2">
          <ButtonLink href="/setup" variant="secondary" fullWidth>
            + Create another band
          </ButtonLink>
        </div>

        {/* Sign out */}
        <div className="pt-4 border-t border-border">
          <p className="mb-2 text-xs text-muted">
            Signed in as {session!.user!.email}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="w-full py-3 text-sm text-muted underline underline-offset-4 hover:text-secondary"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </PageLayout>
  );
}
