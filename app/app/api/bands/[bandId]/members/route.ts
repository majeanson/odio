// GET    /api/bands/[bandId]/members — list band members
// PATCH  /api/bands/[bandId]/members — update a member's role (recorder only)
// DELETE /api/bands/[bandId]/members — remove a member (recorder only)
//
// PATCH body: { targetEmail: string, role: "EDITOR" | "MEMBER" }
// DELETE body: { targetEmail: string }

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";
import type { BandRole } from "@/types";

const VALID_ROLES: BandRole[] = ["EDITOR", "MEMBER"]; // RECORDER cannot be assigned via API

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { bandId } = await params;

  const members = await prisma.bandMember.findMany({
    where: { bandId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });

  const isMember = members.some((m) => m.userEmail === session.user!.email);
  if (!isMember) return apiError("Forbidden", 403);

  return apiOk(members);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { bandId } = await params;

  // Only RECORDER can change roles
  const caller = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: session.user.email } },
  });
  if (!caller) return apiError("Forbidden", 403);
  if (caller.role !== "RECORDER") return apiError("Forbidden — only the band recorder can change roles", 403);

  const body = await req.json().catch(() => null);
  const { targetEmail, role } = body ?? {};

  if (!targetEmail) return apiError("targetEmail is required");
  if (!VALID_ROLES.includes(role)) {
    return apiError(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);
  }

  // Cannot change own role (recorder is permanent)
  if (targetEmail === session.user.email) {
    return apiError("Cannot change your own role");
  }

  const target = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: targetEmail } },
  });
  if (!target) return apiError("Member not found", 404);
  if (target.role === "RECORDER") return apiError("Cannot change the recorder's role");

  const updated = await prisma.bandMember.update({
    where: { bandId_userEmail: { bandId, userEmail: targetEmail } },
    data: { role },
  });

  return apiOk(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { bandId } = await params;

  const caller = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: session.user.email } },
  });
  if (!caller) return apiError("Forbidden", 403);

  const body = await req.json().catch(() => null);
  const { targetEmail } = body ?? {};

  if (!targetEmail) return apiError("targetEmail is required");

  // Recorder can remove any member; members can only remove themselves (leave)
  if (caller.role !== "RECORDER" && targetEmail !== session.user.email) {
    return apiError("Forbidden — only the recorder can remove other members", 403);
  }

  // Cannot remove the recorder
  const target = await prisma.bandMember.findUnique({
    where: { bandId_userEmail: { bandId, userEmail: targetEmail } },
  });
  if (!target) return apiError("Member not found", 404);
  if (target.role === "RECORDER") return apiError("Cannot remove the band recorder");

  await prisma.bandMember.delete({
    where: { bandId_userEmail: { bandId, userEmail: targetEmail } },
  });

  return apiOk({ removed: true });
}
