import "server-only";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TakeJanitorResult = {
  scanned: number;
  expiredMarked: number;
  storageRemoved: number;
  storageErrors: number;
  skipped: number;
};

const BATCH_LIMIT = 50;

/**
 * Idempotent retention janitor for take-audio only.
 * - Finds takes past expires_at still in READY / PENDING_UPLOAD
 * - Marks EXPIRED
 * - Best-effort removes Storage object
 * - Also sweeps already EXPIRED/DELETED rows that still have objects
 *
 * Does not touch beat-audio. Safe to re-run.
 */
export async function runTakesRetentionJanitor(options?: {
  now?: Date;
  limit?: number;
}): Promise<TakeJanitorResult> {
  const admin = createSupabaseAdminClient();
  const nowIso = (options?.now ?? new Date()).toISOString();
  const limit = options?.limit ?? BATCH_LIMIT;

  const result: TakeJanitorResult = {
    scanned: 0,
    expiredMarked: 0,
    storageRemoved: 0,
    storageErrors: 0,
    skipped: 0,
  };

  const { data: due, error: dueError } = await admin
    .from("takes")
    .select("id, status, object_key, storage_bucket, deleted_at, expires_at")
    .in("status", ["READY", "PENDING_UPLOAD"])
    .is("deleted_at", null)
    .lte("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (dueError) throw new Error(dueError.message);

  const { data: leftovers, error: leftError } = await admin
    .from("takes")
    .select("id, status, object_key, storage_bucket, deleted_at, expires_at")
    .in("status", ["EXPIRED", "DELETED"])
    .eq("storage_bucket", TAKE_AUDIO_BUCKET)
    .not("object_key", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (leftError) throw new Error(leftError.message);

  const candidates = [...(due ?? []), ...(leftovers ?? [])];
  const seen = new Set<string>();

  for (const row of candidates) {
    const id = row.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    result.scanned += 1;

    if (row.storage_bucket !== TAKE_AUDIO_BUCKET) {
      result.skipped += 1;
      continue;
    }

    const status = row.status as string;
    const needsExpire =
      (status === "READY" || status === "PENDING_UPLOAD") &&
      !row.deleted_at;

    if (needsExpire) {
      const { error: markError } = await admin
        .from("takes")
        .update({
          status: "EXPIRED",
          failure_reason: "EXPIRED",
        })
        .eq("id", id)
        .in("status", ["READY", "PENDING_UPLOAD"])
        .is("deleted_at", null);

      if (!markError) {
        result.expiredMarked += 1;
      }
    }

    const objectKey = row.object_key as string | null;
    if (!objectKey || !objectKey.endsWith(".bin")) {
      result.skipped += 1;
      continue;
    }

    // Canonical take keys only (never beat-audio paths).
    if (
      !objectKey.startsWith("user/") &&
      !objectKey.startsWith("anon/")
    ) {
      result.skipped += 1;
      continue;
    }

    const { error: removeError } = await admin.storage
      .from(TAKE_AUDIO_BUCKET)
      .remove([objectKey]);

    if (removeError) {
      // Missing object is success for idempotency.
      const msg = removeError.message.toLowerCase();
      if (
        msg.includes("not found") ||
        msg.includes("does not exist") ||
        msg.includes("404")
      ) {
        result.storageRemoved += 1;
      } else {
        result.storageErrors += 1;
      }
    } else {
      result.storageRemoved += 1;
    }
  }

  return result;
}
