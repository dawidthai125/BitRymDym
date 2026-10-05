/**
 * P4.2 — owner title update for READY takes.
 */

import "server-only";

import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { isTakeExpired } from "@/lib/takes/entitlement";
import { normalizeTakeTitle } from "@/lib/takes/take-title";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function updateOwnTakeTitleFor(
  context: AuthContext,
  params: { takeId: string; title: unknown },
): Promise<{ takeId: string; title: string | null }> {
  let title: string | null;
  try {
    title = normalizeTakeTitle(params.title);
  } catch (e) {
    throw new AuthError(
      "FORBIDDEN",
      e instanceof Error ? e.message : "Invalid title.",
    );
  }

  if (typeof params.takeId !== "string" || params.takeId.length < 8) {
    throw new AuthError("FORBIDDEN", "Invalid takeId.");
  }

  const admin = createSupabaseAdminClient();
  const { data: take, error } = await admin
    .from("takes")
    .select("id, owner_id, status, deleted_at, expires_at")
    .eq("id", params.takeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!take) throw new AuthError("NOT_FOUND", "Take not found.");
  if (take.owner_id !== context.userId) {
    throw new AuthError("FORBIDDEN", "Not take owner.");
  }
  if (take.deleted_at || take.status === "DELETED") {
    throw new AuthError("FORBIDDEN", "Take was deleted.");
  }
  if (
    take.status === "EXPIRED" ||
    isTakeExpired({ expiresAt: take.expires_at as string })
  ) {
    throw new AuthError("FORBIDDEN", "Take session expired.");
  }

  const { error: updateError } = await admin
    .from("takes")
    .update({ title })
    .eq("id", params.takeId)
    .eq("owner_id", context.userId);

  if (updateError) throw new Error(updateError.message);

  return { takeId: params.takeId, title };
}

export async function updateOwnTakeTitle(params: {
  takeId: string;
  title: unknown;
}): Promise<{ takeId: string; title: string | null }> {
  const context = await requireUser();
  return updateOwnTakeTitleFor(context, params);
}
