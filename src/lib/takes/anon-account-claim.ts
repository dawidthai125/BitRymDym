import "server-only";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import type { AuthContext } from "@/lib/auth/types";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import {
  clearAnonymousTakeIdentity,
  readAnonymousTakeIdentity,
} from "@/lib/takes/anonymous-identity";
import {
  accountClaimRedirectPath,
  type AnonAccountClaimResult,
  type AnonAccountClaimUx,
} from "@/lib/takes/anon-account-claim-ux";
import {
  messageForTakeClaimCode,
  parseTakeClaimCodeFromRpc,
  type TakeClaimCode,
} from "@/lib/takes/claim-errors";
import {
  getSamplePolicy,
  sampleActorFromPremiumTier,
} from "@/lib/takes/entitlement";
import {
  buildAnonTakeObjectKey,
  buildUserTakeObjectKey,
  expectedAnonTakeObjectKey,
  expectedUserTakeObjectKey,
} from "@/lib/takes/object-key";
import { anonymousTakeTokenHashPrefix } from "@/lib/takes/token-hash";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type { AnonAccountClaimResult, AnonAccountClaimUx };
export { accountClaimRedirectPath };

type ClaimRpcRow = {
  take_id: string;
  beat_id: string;
  old_object_key: string | null;
  new_object_key: string;
  expires_at: string;
  code: string;
};

type EligibleAnonTake = {
  id: string;
  beat_id: string;
  object_key: string;
  storage_bucket: string;
  beat_duration_seconds_snapshot: number;
  expires_at: string;
};

async function findLatestEligibleAnonReadyTake(
  tokenHash: string,
): Promise<EligibleAnonTake | null> {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("takes")
    .select(
      "id, beat_id, object_key, storage_bucket, beat_duration_seconds_snapshot, expires_at, anonymous_token_hash, owner_id, status, deleted_at",
    )
    .eq("anonymous_token_hash", tokenHash)
    .is("owner_id", null)
    .eq("status", "READY")
    .is("deleted_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const prefix = anonymousTakeTokenHashPrefix(tokenHash);
  if (
    data.storage_bucket !== TAKE_AUDIO_BUCKET ||
    !expectedAnonTakeObjectKey({
      tokenHashPrefix: prefix,
      takeId: data.id as string,
      objectKey: data.object_key as string,
    })
  ) {
    return null;
  }

  return {
    id: data.id as string,
    beat_id: data.beat_id as string,
    object_key: data.object_key as string,
    storage_bucket: data.storage_bucket as string,
    beat_duration_seconds_snapshot:
      data.beat_duration_seconds_snapshot as number,
    expires_at: data.expires_at as string,
  };
}

async function copyTakeAudioObject(params: {
  sourceKey: string;
  destKey: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = createSupabaseAdminClient();
  const bucket = admin.storage.from(TAKE_AUDIO_BUCKET);

  const { error: copyError } = await bucket.copy(
    params.sourceKey,
    params.destKey,
  );
  if (!copyError) {
    return { ok: true };
  }

  // Idempotent retry: destination may already exist from a prior partial attempt.
  const { data: destBlob, error: destErr } = await bucket.download(
    params.destKey,
  );
  if (!destErr && destBlob) {
    return { ok: true };
  }

  return { ok: false, message: copyError.message };
}

async function removeTakeAudioObjectBestEffort(objectKey: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  try {
    await admin.storage.from(TAKE_AUDIO_BUCKET).remove([objectKey]);
  } catch {
    // best-effort
  }
}

function mapRpcExceptionToUx(message: string): AnonAccountClaimResult {
  const code = parseTakeClaimCodeFromRpc(message);
  if (code === "CLAIM_NO_ELIGIBLE") {
    return { ux: "none", code };
  }
  if (code === "CLAIM_CAP_REACHED") {
    return { ux: "cap", code };
  }
  if (
    code === "CLAIM_CONFLICT" ||
    code === "CLAIM_STORAGE_FAILED" ||
    code === "CLAIM_INVALID"
  ) {
    return { ux: "error", code };
  }
  if (code === "CLAIM_IDEMPOTENT_REPLAY" || code === "CLAIM_OK") {
    return { ux: "ok", code };
  }
  return { ux: "error", code: code ?? "CLAIM_INVALID" };
}

/**
 * P3 — claim newest eligible anonymous READY take onto the authenticated account.
 * Fail-open for callers: never throw for expected claim denials; throws only on infra bugs
 * when invoked directly — auth hooks must catch everything.
 *
 * Does NOT consume daily recording session quota.
 * Does NOT call recording-session claim RPCs or finalize swap.
 */
export async function claimAnonTakeToAccountFor(
  context: AuthContext,
): Promise<AnonAccountClaimResult> {
  const identity = await readAnonymousTakeIdentity();
  if (!identity) {
    return { ux: "none" };
  }

  const tokenHash = identity.tokenHash;
  const candidate = await findLatestEligibleAnonReadyTake(tokenHash);

  const product = await resolveProductEntitlementForAuthContext(context);
  const actor = sampleActorFromPremiumTier(product.premiumTier);

  // Policy needs a positive beat duration; use snapshot when candidate exists,
  // else a safe placeholder (only used if we hit idempotent path without candidate).
  const beatDurationSeconds = candidate
    ? candidate.beat_duration_seconds_snapshot
    : 30;

  const policy = getSamplePolicy({
    actor,
    beatDurationSeconds,
  });

  const expiresAt = new Date(
    Date.now() + policy.ttlSeconds * 1000,
  ).toISOString();

  // No eligible anon READY — nothing to claim (cookie kept per OD-P3-09).
  if (!candidate) {
    // Concurrent/idempotent: if dest already owned under a key we cannot know
    // without takeId, leave as none. Cookie remains until TTL.
    return { ux: "none", code: "CLAIM_NO_ELIGIBLE" };
  }

  const sourceKey = buildAnonTakeObjectKey({
    tokenHashPrefix: anonymousTakeTokenHashPrefix(tokenHash),
    takeId: candidate.id,
  });
  const destKey = buildUserTakeObjectKey({
    ownerId: context.userId,
    takeId: candidate.id,
  });

  if (
    !expectedAnonTakeObjectKey({
      tokenHashPrefix: anonymousTakeTokenHashPrefix(tokenHash),
      takeId: candidate.id,
      objectKey: sourceKey,
    }) ||
    !expectedUserTakeObjectKey({
      ownerId: context.userId,
      takeId: candidate.id,
      objectKey: destKey,
    })
  ) {
    return { ux: "error", code: "CLAIM_INVALID" };
  }

  const copied = await copyTakeAudioObject({
    sourceKey,
    destKey,
  });
  if (!copied.ok) {
    return {
      ux: "error",
      code: "CLAIM_STORAGE_FAILED",
      takeId: candidate.id,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_anon_take_to_account", {
    p_owner_id: context.userId,
    p_anonymous_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_max_active_ready: policy.activeReadyCap,
    p_expected_new_object_key: destKey,
  });

  if (error) {
    const mapped = mapRpcExceptionToUx(error.message);
    // Compensating delete of dest only when take still anonymous.
    if (
      mapped.code === "CLAIM_CAP_REACHED" ||
      mapped.code === "CLAIM_NO_ELIGIBLE" ||
      mapped.code === "CLAIM_CONFLICT" ||
      mapped.code === "CLAIM_INVALID"
    ) {
      const { data: stillAnon } = await admin
        .from("takes")
        .select("id, owner_id, object_key")
        .eq("id", candidate.id)
        .maybeSingle();
      if (
        stillAnon &&
        stillAnon.owner_id == null &&
        stillAnon.object_key === sourceKey
      ) {
        await removeTakeAudioObjectBestEffort(destKey);
      } else if (
        stillAnon &&
        stillAnon.owner_id === context.userId &&
        stillAnon.object_key === destKey
      ) {
        // Race: peer request won — treat as success.
        await removeTakeAudioObjectBestEffort(sourceKey);
        await clearAnonymousTakeIdentity();
        return {
          ux: "ok",
          takeId: candidate.id,
          beatId: candidate.beat_id,
          code: "CLAIM_IDEMPOTENT_REPLAY",
        };
      }
    }
    return { ...mapped, takeId: candidate.id };
  }

  const row = data as ClaimRpcRow | null;
  if (!row?.take_id) {
    await removeTakeAudioObjectBestEffort(destKey);
    return { ux: "error", code: "CLAIM_INVALID", takeId: candidate.id };
  }

  const code = (row.code ?? "CLAIM_OK") as TakeClaimCode;
  const success =
    code === "CLAIM_OK" || code === "CLAIM_IDEMPOTENT_REPLAY";

  if (!success) {
    return mapRpcExceptionToUx(messageForTakeClaimCode(code));
  }

  const oldKey =
    typeof row.old_object_key === "string" && row.old_object_key.length > 0
      ? row.old_object_key
      : sourceKey;

  if (oldKey.startsWith("anon/")) {
    await removeTakeAudioObjectBestEffort(oldKey);
  }

  await clearAnonymousTakeIdentity();

  return {
    ux: "ok",
    takeId: row.take_id,
    beatId: row.beat_id,
    code,
  };
}

/**
 * Fail-open wrapper for auth hooks. Never throws; never blocks login.
 */
export async function tryClaimAnonTakeAfterAuth(
  context: AuthContext,
): Promise<AnonAccountClaimResult> {
  try {
    return await claimAnonTakeToAccountFor(context);
  } catch (error) {
    console.error("[p3-claim] unexpected failure", error);
    return { ux: "error", code: "CLAIM_STORAGE_FAILED" };
  }
}
