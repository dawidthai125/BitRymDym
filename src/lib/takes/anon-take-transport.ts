import "server-only";

import { randomUUID } from "crypto";

import {
  ANON_TAKE_TTL_SECONDS,
  TAKE_AUDIO_BUCKET,
  TAKE_AUDIO_MAX_BYTES,
} from "@/config/recording";
import { AuthError } from "@/lib/auth/session";
import { probeAudioDurationFromBytes } from "@/lib/beats/audio-duration";
import { ensureAnonymousTakeIdentity } from "@/lib/takes/anonymous-identity";
import {
  assertAnonTakeRecordAccess,
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
import { listAnonReplaceableTakesFor } from "@/lib/takes/list-replaceable-takes";
import {
  buildAnonTakeObjectKey,
  expectedAnonTakeObjectKey,
} from "@/lib/takes/object-key";
import {
  anonymousTakeTokenHashPrefix,
} from "@/lib/takes/token-hash";
import {
  type TakeFinalizeResult,
  type TakeSignedUploadSession,
} from "@/lib/takes/take-transport";
import { validateTakeUploadMeta } from "@/lib/takes/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Allow small probe rounding vs client auto-stop. */
const DURATION_TOLERANCE_SECONDS = 1;

function mapTakeAuthz(error: unknown): never {
  if (error instanceof TakeAuthzError) {
    throw new AuthError(
      error.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN",
      error.message,
    );
  }
  throw error;
}

async function mapClaimRpcErrorForAnon(
  tokenHash: string,
  message: string,
): Promise<never> {
  const code = message.toUpperCase();
  if (
    code.includes("REPLACE_REQUIRED") ||
    code.includes("ACTIVE_READY_CAP")
  ) {
    const replaceableTakes = await listAnonReplaceableTakesFor(tokenHash);
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

async function loadAnonTakeOrThrow(params: {
  takeId: string;
  tokenHash: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("takes")
    .select(
      "id, owner_id, anonymous_token_hash, beat_id, status, object_key, storage_bucket, content_type, recording_max_seconds_snapshot, expires_at, deleted_at, duration_seconds, byte_size",
    )
    .eq("id", params.takeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Take not found.");
  if (
    !data.anonymous_token_hash ||
    data.anonymous_token_hash !== params.tokenHash
  ) {
    throw new AuthError("FORBIDDEN", "Not anonymous take owner.");
  }
  if (data.owner_id != null) {
    throw new AuthError("FORBIDDEN", "Take is not anonymous.");
  }
  if (data.deleted_at || data.status === "DELETED") {
    throw new AuthError("FORBIDDEN", "Take was deleted.");
  }
  return data;
}

type AnonSessionParams = {
  beatId: string;
  contentType: string;
  byteSize: number;
  replaceTakeId?: string | null;
  objectKey?: string | null;
  ownerId?: string | null;
  bucket?: string | null;
  takeId?: string | null;
};

/**
 * D02 anonymous PENDING_UPLOAD claim + signed upload URL.
 * Does not call grant APIs. Does not use claim_take_recording_session.
 */
export async function createAnonTakeRecordingSessionFor(
  tokenHash: string,
  params: AnonSessionParams,
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

  let maxRecordingSeconds: number;
  let policy: SamplePolicy;
  try {
    ({ maxRecordingSeconds, policy } = assertAnonTakeRecordAccess({
      tokenHash,
      beat: {
        id: beat.id as string,
        status: beat.status as string,
        durationSeconds: beat.duration_seconds as number,
      },
    }));
  } catch (e) {
    mapTakeAuthz(e);
  }

  await assertPublishedBeatHasReadyMaster(params.beatId);

  const takeId = randomUUID();
  const objectKey = buildAnonTakeObjectKey({
    tokenHashPrefix: anonymousTakeTokenHashPrefix(tokenHash),
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
    "claim_anon_take_recording_session",
    {
      p_anonymous_token_hash: tokenHash,
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
    await mapClaimRpcErrorForAnon(tokenHash, claimError.message);
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

export async function createAnonTakeRecordingSession(
  params: AnonSessionParams,
): Promise<TakeSignedUploadSession> {
  const { tokenHash } = await ensureAnonymousTakeIdentity();
  return createAnonTakeRecordingSessionFor(tokenHash, params);
}

/**
 * Finalize anonymous take after binary upload.
 * Expiry DENY before READY. Hash ↔ take.anonymous_token_hash mandatory.
 */
export async function finalizeAnonTakeRecordingFor(
  tokenHash: string,
  params: { takeId: string },
): Promise<TakeFinalizeResult> {
  const take = await loadAnonTakeOrThrow({
    takeId: params.takeId,
    tokenHash,
  });

  if (take.status === "READY") {
    const swap = await invokeFinalizeTakeReadySwap({
      takeId: take.id as string,
      actorOwnerId: null,
      actorAnonHash: tokenHash,
      durationSeconds: take.duration_seconds as number,
      byteSize: take.byte_size as number,
      contentType: take.content_type as string,
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
    !expectedAnonTakeObjectKey({
      tokenHashPrefix: anonymousTakeTokenHashPrefix(tokenHash),
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

  try {
    const swap = await invokeFinalizeTakeReadySwap({
      takeId: take.id as string,
      actorOwnerId: null,
      actorAnonHash: tokenHash,
      durationSeconds: probe.durationSeconds,
      byteSize: bytes.byteLength,
      contentType: meta.contentType,
    });
    return {
      takeId: swap.takeId,
      beatId: swap.beatId,
      status: "READY",
      durationSeconds: swap.durationSeconds,
      byteSize: swap.byteSize,
      contentType: swap.contentType,
    };
  } catch (e) {
    if (e instanceof TakeClaimError || e instanceof AuthError) throw e;
    throw e;
  }
}

export async function finalizeAnonTakeRecording(params: {
  takeId: string;
}): Promise<TakeFinalizeResult> {
  const { tokenHash } = await ensureAnonymousTakeIdentity();
  return finalizeAnonTakeRecordingFor(tokenHash, params);
}

/** Exported for tests — TTL constant is config SSOT. */
export function anonTakeTtlSeconds(): number {
  return ANON_TAKE_TTL_SECONDS;
}
