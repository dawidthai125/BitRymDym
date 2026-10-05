import "server-only";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { AuthError } from "@/lib/auth/session";
import {
  mapClaimRpcMessageToError,
  TakeClaimError,
} from "@/lib/takes/claim-errors";
import {
  expectedAnonTakeObjectKey,
  expectedUserTakeObjectKey,
} from "@/lib/takes/object-key";
import { anonymousTakeTokenHashPrefix } from "@/lib/takes/token-hash";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type FinalizeSwapResult = {
  takeId: string;
  beatId: string;
  status: "READY";
  durationSeconds: number;
  byteSize: number;
  contentType: string;
  replacedTakeId: string | null;
  idempotentReplay: boolean;
};

type SwapRpcRow = {
  take_id: string;
  beat_id: string;
  status: string;
  duration_seconds: number;
  byte_size: number;
  content_type: string;
  replaced_take_id: string | null;
  replaced_object_key?: string | null;
  replaced_storage_bucket?: string | null;
  idempotent_replay?: boolean;
  code?: string;
};

/**
 * Atomic PENDING→READY (+ optional old→DELETED). Storage cleanup is after commit.
 */
export async function invokeFinalizeTakeReadySwap(params: {
  takeId: string;
  actorOwnerId: string | null;
  actorAnonHash: string | null;
  durationSeconds: number;
  byteSize: number;
  contentType: string;
}): Promise<FinalizeSwapResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("finalize_take_ready_swap", {
    p_take_id: params.takeId,
    p_actor_owner_id: params.actorOwnerId,
    p_actor_anon_hash: params.actorAnonHash,
    p_duration_seconds: params.durationSeconds,
    p_byte_size: params.byteSize,
    p_content_type: params.contentType,
  });

  if (error) {
    mapClaimRpcMessageToError(error.message);
  }

  const row = data as SwapRpcRow | null;
  if (!row || row.status !== "READY") {
    throw new AuthError("FORBIDDEN", "Finalize did not reach READY.");
  }

  if (row.idempotent_replay && row.code === "REPLACE_IDEMPOTENCY_REPLAY") {
    // Stable success — not an error path for clients.
  }

  // Best-effort Storage cleanup AFTER successful DB commit (OD-P2-03).
  if (
    row.replaced_take_id &&
    row.replaced_storage_bucket === TAKE_AUDIO_BUCKET &&
    typeof row.replaced_object_key === "string" &&
    row.replaced_object_key.endsWith(".bin")
  ) {
    const key = row.replaced_object_key;
    const keyOk =
      params.actorOwnerId != null
        ? expectedUserTakeObjectKey({
            ownerId: params.actorOwnerId,
            takeId: row.replaced_take_id,
            objectKey: key,
          })
        : params.actorAnonHash != null
          ? expectedAnonTakeObjectKey({
              tokenHashPrefix: anonymousTakeTokenHashPrefix(
                params.actorAnonHash,
              ),
              takeId: row.replaced_take_id,
              objectKey: key,
            })
          : false;

    if (keyOk) {
      try {
        await admin.storage.from(TAKE_AUDIO_BUCKET).remove([key]);
      } catch {
        // Storage failure must not fail finalize (janitor safety net).
      }
    }
  }

  return {
    takeId: row.take_id,
    beatId: row.beat_id,
    status: "READY",
    durationSeconds: row.duration_seconds,
    byteSize: row.byte_size,
    contentType: row.content_type,
    replacedTakeId: row.replaced_take_id,
    idempotentReplay: Boolean(row.idempotent_replay),
  };
}

export function rethrowFinalizeSwapError(error: unknown): never {
  if (error instanceof TakeClaimError || error instanceof AuthError) {
    throw error;
  }
  throw error;
}
