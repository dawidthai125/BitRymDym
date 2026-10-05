import "server-only";

import { randomUUID } from "crypto";

import {
  TAKE_AUDIO_BUCKET,
  TAKE_AUDIO_MAX_BYTES,
} from "@/config/recording";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { probeAudioDurationFromBytes } from "@/lib/beats/audio-duration";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { hasActiveRecordGrant } from "@/lib/grants/beat-access-grants";
import {
  assertTakeRecordAccess,
  rejectClientChosenTakeStorageParams,
  TakeAuthzError,
} from "@/lib/takes/authz";
import {
  mapClaimRpcMessageToError,
  TakeClaimError,
} from "@/lib/takes/claim-errors";
import {
  antiAbuseCapsFromPolicy,
  recordingModeForMaxSeconds,
  type SamplePolicy,
} from "@/lib/takes/entitlement";
import { invokeFinalizeTakeReadySwap } from "@/lib/takes/finalize-swap";
import { listReplaceableTakesFor } from "@/lib/takes/list-replaceable-takes";
import { loadSamplePolicyDurationOverrides } from "@/lib/takes/sample-policy-settings";
import {
  buildUserTakeObjectKey,
  expectedUserTakeObjectKey,
} from "@/lib/takes/object-key";
import { validateTakeUploadMeta } from "@/lib/takes/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Allow small probe rounding vs client auto-stop. */
const DURATION_TOLERANCE_SECONDS = 1;

export type TakeSignedUploadSession = {
  takeId: string;
  beatId: string;
  objectKey: string;
  path: string;
  token: string;
  signedUrl: string;
  contentType: string;
  declaredByteSize: number;
  maxRecordingSeconds: number;
  expiresAt: string;
};

export type TakeFinalizeResult = {
  takeId: string;
  beatId: string;
  status: "READY";
  durationSeconds: number;
  byteSize: number;
  contentType: string;
};

function mapTakeAuthz(error: unknown): never {
  if (error instanceof TakeAuthzError) {
    throw new AuthError(
      error.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN",
      error.message,
    );
  }
  throw error;
}

async function mapClaimRpcErrorForUser(
  context: AuthContext,
  message: string,
): Promise<never> {
  const code = message.toUpperCase();
  if (
    code.includes("REPLACE_REQUIRED") ||
    code.includes("ACTIVE_READY_CAP")
  ) {
    const replaceableTakes = await listReplaceableTakesFor(context);
    mapClaimRpcMessageToError(message, { replaceableTakes });
  }
  mapClaimRpcMessageToError(message);
}

async function assertPublishedBeatHasReadyMaster(beatId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_audio_assets")
    .select("id")
    .eq("beat_id", beatId)
    .eq("is_active", true)
    .eq("status", "READY")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new AuthError(
      "FORBIDDEN",
      "Beat has no READY audio asset for recording.",
    );
  }
}

async function loadBeatOrThrow(beatId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beats")
    .select("id, status, duration_seconds, bpm")
    .eq("id", beatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Beat not found.");
  return data;
}

async function loadTakeOwnedOrThrow(params: {
  takeId: string;
  userId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("takes")
    .select(
      "id, owner_id, beat_id, status, object_key, storage_bucket, content_type, recording_max_seconds_snapshot, expires_at, deleted_at, duration_seconds, byte_size",
    )
    .eq("id", params.takeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Take not found.");
  if (data.owner_id !== params.userId) {
    throw new AuthError("FORBIDDEN", "Not take owner.");
  }
  if (data.deleted_at || data.status === "DELETED") {
    throw new AuthError("FORBIDDEN", "Take was deleted.");
  }
  return data;
}

type SessionParams = {
  beatId: string;
  contentType: string;
  byteSize: number;
  /** Explicit replace target (own READY take). Cross-beat allowed. */
  replaceTakeId?: string | null;
  objectKey?: string | null;
  ownerId?: string | null;
  bucket?: string | null;
  takeId?: string | null;
};

/**
 * Create PENDING_UPLOAD take + signed upload URL (race-safe claim RPC).
 */
export async function createTakeRecordingSessionFor(
  context: AuthContext,
  params: SessionParams,
): Promise<TakeSignedUploadSession> {
  try {
    rejectClientChosenTakeStorageParams(params);
  } catch (e) {
    mapTakeAuthz(e);
  }

  const meta = validateTakeUploadMeta({
    contentType: params.contentType,
    byteSize: params.byteSize,
  });
  if (!meta.ok) {
    throw new AuthError("FORBIDDEN", meta.errors.join("; "));
  }

  const beat = await loadBeatOrThrow(params.beatId);

  const activeRecordGrant = await hasActiveRecordGrant({
    beatId: params.beatId,
    granteeUserId: context.userId,
  });

  const product = await resolveProductEntitlementForAuthContext(context);
  const overrides = await loadSamplePolicyDurationOverrides();

  let maxRecordingSeconds: number;
  let policy: SamplePolicy;
  try {
    ({ maxRecordingSeconds, policy } = assertTakeRecordAccess({
      context,
      beat: {
        id: beat.id as string,
        status: beat.status as string,
        durationSeconds: beat.duration_seconds as number,
      },
      premiumTier: product.premiumTier,
      overrides,
      activeRecordGrant,
    }));
  } catch (e) {
    mapTakeAuthz(e);
  }

  await assertPublishedBeatHasReadyMaster(params.beatId);

  const takeId = randomUUID();
  const objectKey = buildUserTakeObjectKey({
    ownerId: context.userId,
    takeId,
  });
  const expiresAt = new Date(
    Date.now() + policy!.ttlSeconds * 1000,
  ).toISOString();
  const recordingMode = recordingModeForMaxSeconds(maxRecordingSeconds!);
  const caps = antiAbuseCapsFromPolicy(policy!);

  const replaceTakeId =
    typeof params.replaceTakeId === "string" && params.replaceTakeId.length > 0
      ? params.replaceTakeId
      : null;

  const admin = createSupabaseAdminClient();
  const { error: claimError } = await admin.rpc(
    "claim_take_recording_session",
    {
      p_owner_id: context.userId,
      p_beat_id: params.beatId,
      p_take_id: takeId,
      p_object_key: objectKey,
      p_content_type: meta.contentType,
      p_byte_size: params.byteSize,
      p_recording_mode: recordingMode,
      p_beat_duration_seconds: beat.duration_seconds,
      p_recording_max_seconds: maxRecordingSeconds!,
      p_beat_bpm: beat.bpm ?? null,
      p_expires_at: expiresAt,
      p_max_active_ready: caps.maxActiveReady,
      p_max_sessions_utc_day: caps.maxSessionsPerUtcDay,
      p_replace_take_id: replaceTakeId,
    },
  );

  if (claimError) {
    await mapClaimRpcErrorForUser(context, claimError.message);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(TAKE_AUDIO_BUCKET)
    .createSignedUploadUrl(objectKey);

  if (signError || !signed) {
    await admin
      .from("takes")
      .update({
        status: "FAILED",
        failure_reason: "SIGNED_UPLOAD_URL_FAILED",
      })
      .eq("id", takeId);
    throw new Error(
      signError?.message ?? "Failed to create take upload URL.",
    );
  }

  return {
    takeId,
    beatId: params.beatId,
    objectKey,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    contentType: meta.contentType,
    declaredByteSize: params.byteSize,
    maxRecordingSeconds: maxRecordingSeconds!,
    expiresAt,
  };
}

export async function createTakeRecordingSession(
  params: SessionParams,
): Promise<TakeSignedUploadSession> {
  const context = await requireUser();
  return createTakeRecordingSessionFor(context, params);
}

/**
 * Finalize after client binary upload. Duration probe is fail-closed (OD-W2-04).
 * Entitlement re-checked against session snapshot (never client-supplied max).
 */
export async function finalizeTakeRecordingFor(
  context: AuthContext,
  params: { takeId: string },
): Promise<TakeFinalizeResult> {
  const take = await loadTakeOwnedOrThrow({
    takeId: params.takeId,
    userId: context.userId,
  });

  if (take.status === "READY") {
    const swap = await invokeFinalizeTakeReadySwap({
      takeId: take.id as string,
      actorOwnerId: context.userId,
      actorAnonHash: null,
      durationSeconds: take.duration_seconds as number,
      byteSize: take.byte_size as number,
      contentType: take.content_type as string,
    });
    const { hookTakeReadyAuth } = await import(
      "@/lib/creator-progress/award-hooks"
    );
    await hookTakeReadyAuth({
      ownerUserId: context.userId,
      takeId: swap.takeId,
    });
    return {
      takeId: swap.takeId,
      beatId: swap.beatId,
      status: "READY",
      durationSeconds: swap.durationSeconds,
      byteSize: swap.byteSize,
      contentType: swap.contentType,
    };
  }

  if (take.status !== "PENDING_UPLOAD") {
    throw new AuthError(
      "FORBIDDEN",
      `Take is not awaiting finalize (status=${take.status}).`,
    );
  }

  if (new Date(take.expires_at as string).getTime() <= Date.now()) {
    const admin = createSupabaseAdminClient();
    await admin
      .from("takes")
      .update({ status: "EXPIRED", failure_reason: "EXPIRED" })
      .eq("id", take.id)
      .eq("status", "PENDING_UPLOAD");
    throw new AuthError("FORBIDDEN", "Take session expired.");
  }

  const beat = await loadBeatOrThrow(take.beat_id as string);
  if (beat.status !== "PUBLISHED") {
    throw new AuthError("FORBIDDEN", "Beat is no longer PUBLISHED.");
  }

  if (take.storage_bucket !== TAKE_AUDIO_BUCKET) {
    throw new AuthError("FORBIDDEN", "Invalid take storage bucket.");
  }

  if (
    !expectedUserTakeObjectKey({
      ownerId: context.userId,
      takeId: take.id as string,
      objectKey: take.object_key as string,
    })
  ) {
    throw new AuthError("FORBIDDEN", "Object key does not match take binding.");
  }

  const admin = createSupabaseAdminClient();
  const { data: blob, error: dlError } = await admin.storage
    .from(TAKE_AUDIO_BUCKET)
    .download(take.object_key as string);

  if (dlError || !blob) {
    await admin
      .from("takes")
      .update({
        status: "FAILED",
        failure_reason: "OBJECT_MISSING",
      })
      .eq("id", take.id);
    throw new AuthError("FORBIDDEN", "Take audio object missing.");
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength <= 0 || bytes.byteLength > TAKE_AUDIO_MAX_BYTES) {
    await admin
      .from("takes")
      .update({
        status: "FAILED",
        failure_reason: "INVALID_SIZE",
      })
      .eq("id", take.id);
    throw new AuthError("FORBIDDEN", "Invalid take byte size.");
  }

  const declaredType = (take.content_type as string) ?? "audio/webm";
  const meta = validateTakeUploadMeta({
    contentType: declaredType,
    byteSize: bytes.byteLength,
  });
  if (!meta.ok) {
    await admin
      .from("takes")
      .update({
        status: "FAILED",
        failure_reason: "INVALID_MIME",
      })
      .eq("id", take.id);
    throw new AuthError("FORBIDDEN", meta.errors.join("; "));
  }

  const probe = await probeAudioDurationFromBytes({
    bytes,
    contentTypeHint: meta.contentType,
  });
  if (!probe.ok) {
    await admin
      .from("takes")
      .update({
        status: "FAILED",
        failure_reason: "DURATION_PROBE_FAILED",
      })
      .eq("id", take.id);
    throw new AuthError(
      "FORBIDDEN",
      "Duration could not be verified (fail-closed).",
    );
  }

  const maxAllowed = take.recording_max_seconds_snapshot as number;
  if (probe.durationSeconds > maxAllowed + DURATION_TOLERANCE_SECONDS) {
    await admin
      .from("takes")
      .update({
        status: "FAILED",
        failure_reason: "DURATION_EXCEEDED",
      })
      .eq("id", take.id);
    throw new AuthError(
      "FORBIDDEN",
      `Duration ${probe.durationSeconds}s exceeds max ${maxAllowed}s.`,
    );
  }

  let swap;
  try {
    swap = await invokeFinalizeTakeReadySwap({
      takeId: take.id as string,
      actorOwnerId: context.userId,
      actorAnonHash: null,
      durationSeconds: probe.durationSeconds,
      byteSize: bytes.byteLength,
      contentType: meta.contentType,
    });
  } catch (e) {
    if (e instanceof TakeClaimError || e instanceof AuthError) throw e;
    throw e;
  }

  const { hookTakeReadyAuth } = await import(
    "@/lib/creator-progress/award-hooks"
  );
  await hookTakeReadyAuth({
    ownerUserId: context.userId,
    takeId: swap.takeId,
  });

  return {
    takeId: swap.takeId,
    beatId: swap.beatId,
    status: "READY",
    durationSeconds: swap.durationSeconds,
    byteSize: swap.byteSize,
    contentType: swap.contentType,
  };
}

export async function finalizeTakeRecording(params: {
  takeId: string;
}): Promise<TakeFinalizeResult> {
  const context = await requireUser();
  return finalizeTakeRecordingFor(context, params);
}
