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
      <div className="px-5 py-5 space-y-4 md:px-8 md:py-8">
        {/* Band list */}
        <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0" role="list">
          {memberships.map(({ band, role }) => (
            <li key={band.id}>
              <Link
                href={`/bands/${band.id}`}
                className="flex items-center justify-between rounded-2xl bg-surface px-5 py-5 transition-colors active:bg-elevated"
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-primary">{band.name}</p>
                  <p className="mt-1 text-sm text-muted">
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
                  className="size-5 shrink-0 text-muted ml-4"
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
          <ButtonLink href="/setup" variant="secondary" fullWidth size="lg">
            + Create another band
          </ButtonLink>
        </div>

        {/* Sign out */}
        <div className="pt-5 border-t border-border">
          <p className="mb-3 text-sm text-muted">
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
              className="w-full py-4 text-base text-muted underline underline-offset-4 hover:text-secondary"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </PageLayout>
  );
}
