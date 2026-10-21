/**
 * PREMIUM-03/09 — Local retention cleanup executor.
 * Reuses pure planner; deletes only known audio_artifacts object keys for the work.
 * Scope: premium_works + linked READY/EXPIRED artifacts for domain_ref — no mass delete.
 */

import "server-only";

import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";
import {
  planPremiumWorkExpiry,
  type PremiumCleanupWork,
} from "@/lib/premium/premium-retention-cleanup";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PremiumRetentionCleanupResult = {
  workId: string;
  markedExpired: boolean;
  alreadyExpired: boolean;
  skippedReason: string | null;
  deletedObjectKeys: string[];
  storageErrors: string[];
};

function mapWorkRow(row: {
  id: string;
  owner_id: string;
  domain: string;
  domain_ref: string;
  status: string;
  retention_expires_at: string | null;
}): PremiumCleanupWork {
  return {
    id: row.id,
    ownerId: row.owner_id,
    domain: row.domain as "TAKE" | "STUDIO_PROJECT",
    domainRef: row.domain_ref,
    status: row.status as PremiumCleanupWork["status"],
    retentionExpiresAtMs: row.retention_expires_at
      ? new Date(row.retention_expires_at).getTime()
      : null,
  };
}

async function listLinkedArtifactKeys(params: {
  ownerId: string;
  domain: "TAKE" | "STUDIO_PROJECT";
  domainRef: string;
}): Promise<{ bucket: string; key: string }[]> {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("audio_artifacts")
    .select("storage_bucket, object_key, deleted_at")
    .eq("owner_id", params.ownerId)
    .is("deleted_at", null);
  if (params.domain === "TAKE") {
    query = query.eq("take_id", params.domainRef);
  } else {
    query = query.eq("project_id", params.domainRef);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const out: { bucket: string; key: string }[] = [];
  for (const row of data ?? []) {
    const key = row.object_key as string | null;
    const bucket = (row.storage_bucket as string | null) ?? AUDIO_ARTIFACTS_BUCKET;
    if (key) out.push({ bucket, key });
  }
  return out;
}

/**
 * Run cleanup for one premium_works id (service_role). Idempotent.
 * Storage delete runs before DB mark when due — retry deletes tolerate missing objects.
 */
export async function runPremiumRetentionCleanupForWork(params: {
  workId: string;
  nowMs?: number;
}): Promise<PremiumRetentionCleanupResult> {
  const admin = createSupabaseAdminClient();
  const nowMs = params.nowMs ?? Date.now();

  const { data: row, error } = await admin
    .from("premium_works")
    .select(
      "id, owner_id, domain, domain_ref, status, retention_expires_at",
    )
    .eq("id", params.workId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) {
    return {
      workId: params.workId,
      markedExpired: false,
      alreadyExpired: false,
      skippedReason: "WORK_NOT_FOUND",
      deletedObjectKeys: [],
      storageErrors: [],
    };
  }

  const work = mapWorkRow(row as Parameters<typeof mapWorkRow>[0]);
  const plan = planPremiumWorkExpiry({ work, nowMs });
  if (!plan.markExpired) {
    return {
      workId: work.id,
      markedExpired: false,
      alreadyExpired: plan.alreadyExpired,
      skippedReason: plan.skipReason,
      deletedObjectKeys: [],
      storageErrors: [],
    };
  }

  const linked = await listLinkedArtifactKeys({
    ownerId: work.ownerId,
    domain: work.domain,
    domainRef: work.domainRef,
  });

  const deletedObjectKeys: string[] = [];
  const storageErrors: string[] = [];
  for (const obj of linked) {
    const { error: rmErr } = await admin.storage
      .from(obj.bucket)
      .remove([obj.key]);
    if (rmErr) {
      storageErrors.push(rmErr.message);
      continue;
    }
    deletedObjectKeys.push(obj.key);
    await admin
      .from("audio_artifacts")
      .update({ deleted_at: new Date(nowMs).toISOString(), status: "DELETED" })
      .eq("object_key", obj.key)
      .eq("owner_id", work.ownerId);
  }

  const { error: updErr } = await admin
    .from("premium_works")
    .update({ status: "EXPIRED", updated_at: new Date(nowMs).toISOString() })
    .eq("id", work.id)
    .eq("status", "WORK_READY");
  if (updErr) throw new Error(updErr.message);

  return {
    workId: work.id,
    markedExpired: true,
    alreadyExpired: false,
    skippedReason: null,
    deletedObjectKeys,
    storageErrors,
  };
}
