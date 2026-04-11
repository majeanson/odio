// PATCH  /api/clips/[clipId]/comments/[commentId] — edit own comment
// DELETE /api/clips/[clipId]/comments/[commentId] — delete own comment (or recorder deletes any)

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/utils";

async function getCommentAndMembership(
  clipId: string,
  commentId: string,
  userEmail: string,
) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      clip: {
        include: {
          session: {
            include: {
              band: {
                include: {
                  members: { where: { userEmail }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!comment || comment.clipId !== clipId) return { comment: null, membership: null };
  const membership = comment.clip.session.band.members[0] ?? null;
  return { comment, membership };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clipId: string; commentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId, commentId } = await params;
  const { comment, membership } = await getCommentAndMembership(clipId, commentId, session.user.email);

  if (!comment) return apiError("Comment not found", 404);
  if (!membership) return apiError("Forbidden", 403);

  // Only the author can edit their comment
  if (comment.userEmail !== session.user.email) {
    return apiError("Forbidden — you can only edit your own comments", 403);
  }

  const body = await req.json().catch(() => null);
  const { text } = body ?? {};

  if (!text?.trim()) return apiError("Comment text is required");
  if (text.trim().length > 1000) return apiError("Comment must be under 1000 characters");

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: {
      text: text.trim(),
      editedAt: new Date(),
    },
  });

  return apiOk(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clipId: string; commentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return apiError("Unauthorized", 401);

  const { clipId, commentId } = await params;
  const { comment, membership } = await getCommentAndMembership(clipId, commentId, session.user.email);

  if (!comment) return apiError("Comment not found", 404);
  if (!membership) return apiError("Forbidden", 403);

  // Author can delete own comment; RECORDER can delete any comment
  const isAuthor = comment.userEmail === session.user.email;
  const isRecorder = membership.role === "RECORDER";
  if (!isAuthor && !isRecorder) {
    return apiError("Forbidden — you can only delete your own comments", 403);
  }

  await prisma.comment.delete({ where: { id: commentId } });

  return apiOk({ deleted: true });
}
