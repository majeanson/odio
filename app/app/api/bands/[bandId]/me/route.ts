// GET /api/bands/[bandId]/me — current user's membership role in a band.
// Used by AuthShell to gate the Record tab for MEMBER-role users.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { bandId } = await params;

  const membership = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: session.user.email } },
    select: { role: true },
  });

  if (!membership) return apiError("Not a member", 403);

  return apiOk({ role: membership.role });
}
