"use server";

import { revalidatePath } from "next/cache";

import { resolveCommentReports, type ResolveCommentReportsOutcome } from "@/lib/community/comment-moderation";

/** Staff decision on a reported comment: hide it or dismiss the reports. Audited in the lib. */
export async function adminResolveCommentReportsAction(
  commentId: string,
  decision: "hide" | "dismiss",
): Promise<ResolveCommentReportsOutcome> {
  const outcome = await resolveCommentReports(commentId, decision);
  if (outcome.ok) revalidatePath("/admin/moderation");
  return outcome;
}
