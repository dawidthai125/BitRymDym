import "server-only";

import {
  TAKE_AUDIO_BUCKET,
  TAKE_AUDIO_PREVIEW_TTL_SECONDS,
} from "@/config/recording";
import { AuthError } from "@/lib/auth/session";
import { ensureAnonymousTakeIdentity } from "@/lib/takes/anonymous-identity";
import { assertOwnAnonReadyTakeAccess } from "@/lib/takes/take-access";
import type { TakePreviewResult } from "@/lib/takes/take-preview";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * D02 anonymous short-lived signed GET for READY take preview.
 * Does not use take-download module. No durable download.
 */
export async function createAnonTakePreviewSignedUrlFor(
  tokenHash: string,
  params: { takeId: string },
): Promise<TakePreviewResult> {
  const admin = createSupabaseAdminClient();

  const { data: take, error } = await admin
    .from("takes")
    .select(
      "id, owner_id, anonymous_token_hash, beat_id, status, object_key, storage_bucket, content_type, duration_seconds, expires_at, deleted_at",
    )
    .eq("id", params.takeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!take) throw new AuthError("NOT_FOUND", "Take not found.");

  assertOwnAnonReadyTakeAccess({
    take: {
      id: take.id as string,
      owner_id: take.owner_id as string | null,
      anonymous_token_hash: take.anonymous_token_hash as string | null,
      beat_id: take.beat_id as string,
      status: take.status as string,
      object_key: take.object_key as string,
      storage_bucket: take.storage_bucket as string,
      content_type: take.content_type as string | null,
      duration_seconds: take.duration_seconds as number | null,
      byte_size: null,
      expires_at: take.expires_at as string,
      deleted_at: take.deleted_at as string | null,
    },
    tokenHash,
  });

  const { data: signed, error: signError } = await admin.storage
    .from(TAKE_AUDIO_BUCKET)
    .createSignedUrl(
      take.object_key as string,
      TAKE_AUDIO_PREVIEW_TTL_SECONDS,
    );

  if (signError || !signed?.signedUrl) {
    throw new Error(signError?.message ?? "Failed to create take preview URL.");
  }

  const expiresAt = new Date(
    Date.now() + TAKE_AUDIO_PREVIEW_TTL_SECONDS * 1000,
  ).toISOString();

  return {
    takeId: take.id as string,
    beatId: take.beat_id as string,
    url: signed.signedUrl,
    expiresAt,
    durationSeconds: (take.duration_seconds as number) ?? 0,
    contentType: (take.content_type as string) ?? "audio/webm",
  };
}

export async function createAnonTakePreviewSignedUrl(params: {
  takeId: string;
}): Promise<TakePreviewResult> {
  const { tokenHash } = await ensureAnonymousTakeIdentity();
  return createAnonTakePreviewSignedUrlFor(tokenHash, params);
}
