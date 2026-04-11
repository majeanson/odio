// POST /api/bands — create a new band
// Creates a Drive folder for audio and a Postgres band record.
// The creator gets the RECORDER role.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorTokens, createBandDriveFolder } from "@/lib/google";
import { apiError, apiOk } from "@/lib/utils";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return apiError("Unauthorized", 401);
  }

  const body = await req.json().catch(() => null);
  const name = (body?.name as string)?.trim();
  if (!name) return apiError("Band name is required");

  // Get the creator's Drive access token to create the folder
  let accessToken: string;
  try {
    const tokens = await getCreatorTokens(session.user.email);
    accessToken = tokens.accessToken;
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "CREATOR_TOKEN_MISSING" || code === "CREATOR_TOKEN_INVALID") {
      return apiError("Google Drive access required. Please sign out and sign in again.", 403);
    }
    throw err;
  }

  // Create the Drive folder
  const driveFolderId = await createBandDriveFolder(accessToken, name);

  // Create band + add creator as RECORDER in a single transaction
  const band = await prisma.$transaction(async (tx) => {
    const b = await tx.band.create({
      data: {
        name,
        createdBy: session.user!.email!,
        driveFolderId,
      },
    });

    await tx.bandMember.create({
      data: {
        bandId: b.id,
        userEmail: session.user!.email!,
        displayName: session.user!.name ?? null,
        role: "RECORDER",
      },
    });

    return b;
  });

  return apiOk(band, 201);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const memberships = await prisma.bandMember.findMany({
    where: { userEmail: session.user.email },
    include: {
      band: {
        include: {
          _count: { select: { sessions: true, members: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return apiOk(memberships.map((m) => ({ ...m.band, role: m.role })));
}
