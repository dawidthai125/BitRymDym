import "server-only";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { expectedUserTakeObjectKey } from "@/lib/takes/object-key";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TakeDeleteResult = {
  takeId: string;
  status: "DELETED";
  deletedAt: string;
};

/**
 * Owner soft-delete: status DELETED + deleted_at. Storage cleanup best-effort
 * and idempotent (janitor also sweeps leftover objects).
 */
export async function softDeleteOwnTakeFor(
  context: AuthContext,
  params: { takeId: string },
): Promise<TakeDeleteResult> {
  const admin = createSupabaseAdminClient();

  const { data: take, error } = await admin
    .from("takes")
    .select(
      "id, owner_id, status, object_key, storage_bucket, deleted_at, expires_at",
    )
    .eq("id", params.takeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!take) throw new AuthError("NOT_FOUND", "Take not found.");

  if (take.owner_id !== context.userId) {
    throw new AuthError("FORBIDDEN", "Not take owner.");
  }

  if (take.status === "DELETED" || take.deleted_at) {
    return {
      takeId: take.id as string,
      status: "DELETED",
      deletedAt: (take.deleted_at as string) ?? new Date().toISOString(),
    };
  }

  if (
    take.storage_bucket === TAKE_AUDIO_BUCKET &&
    typeof take.object_key === "string" &&
    expectedUserTakeObjectKey({
      ownerId: context.userId,
      takeId: take.id as string,
      objectKey: take.object_key,
    })
  ) {
    await admin.storage
      .from(TAKE_AUDIO_BUCKET)
      .remove([take.object_key as string]);
  }

  const deletedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("takes")
    .update({
      status: "DELETED",
      deleted_at: deletedAt,
      failure_reason: null,
    })
    .eq("id", take.id)
    .eq("owner_id", context.userId)
    .is("deleted_at", null)
    .select("id, status, deleted_at")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);

  if (!updated || updated.status !== "DELETED") {
    // Race: another request won — re-read.
    const { data: again } = await admin
      .from("takes")
      .select("id, status, deleted_at")
      .eq("id", take.id)
      .maybeSingle();
    if (again?.status === "DELETED" && again.deleted_at) {
      return {
        takeId: again.id as string,
        status: "DELETED",
        deletedAt: again.deleted_at as string,
      };
    }
    throw new AuthError("FORBIDDEN", "Take could not be deleted.");
  }

  return {
    takeId: updated.id as string,
    status: "DELETED",
    deletedAt: (updated.deleted_at as string) ?? deletedAt,
  };
}

export async function softDeleteOwnTake(params: {
  takeId: string;
}): Promise<TakeDeleteResult> {
  const context = await requireUser();
  return softDeleteOwnTakeFor(context, params);
}
