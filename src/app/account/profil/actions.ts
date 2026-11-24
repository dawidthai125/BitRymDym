"use server";

import { revalidatePath } from "next/cache";

import { AuthError, requireUser } from "@/lib/auth/session";
import { saveOwnProfile, type SaveProfileResult } from "@/lib/creators/creator-profile-server";
import { createFunnelRateLimiter } from "@/lib/funnel/funnel-request";

export type SaveProfileOutcome = SaveProfileResult | { ok: false; code: "SIGNED_OUT" | "LIMIT" };

/** Per account and server instance. Next checks the origin of every server action. */
const allow = createFunnelRateLimiter(20, 60_000);

export async function savePublicProfileAction(input: unknown): Promise<SaveProfileOutcome> {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, code: "SIGNED_OUT" };
    throw error;
  }
  if (!allow(userId)) return { ok: false, code: "LIMIT" };
  const result = await saveOwnProfile(userId, input);
  if (result.ok) {
    revalidatePath("/account/profil");
    if (result.path) revalidatePath(result.path);
  }
  return result;
}
