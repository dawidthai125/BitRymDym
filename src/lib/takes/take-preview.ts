import "server-only";

import {
  TAKE_AUDIO_BUCKET,
  TAKE_AUDIO_PREVIEW_TTL_SECONDS,
} from "@/config/recording";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { expectedUserTakeObjectKey } from "@/lib/takes/object-key";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TakePreviewResult = {
  takeId: string;
  beatId: string;
  url: string;
  expiresAt: string;
  durationSeconds: number;
  contentType: string;
};

/**
 * Owner-only short-lived signed READ for READY take (Wave 3 take-only preview).
 */
export async function createOwnTakePreviewSignedUrlFor(
  context: AuthContext,
  params: { takeId: string },
): Promise<TakePreviewResult> {
  const admin = createSupabaseAdminClient();

  const { data: take, error } = await admin
    .from("takes")
    .select(
      "id, owner_id, beat_id, status, object_key, storage_bucket, content_type, duration_seconds, expires_at, deleted_at",
    )
    .eq("id", params.takeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!take) throw new AuthError("NOT_FOUND", "Take not found.");

  if (take.owner_id !== context.userId) {
    throw new AuthError("FORBIDDEN", "Not take owner.");
  }
  if (take.deleted_at) {
    throw new AuthError("FORBIDDEN", "Take was deleted.");
  }
  if (take.status !== "READY") {
    throw new AuthError("FORBIDDEN", "Take is not READY for preview.");
  }
  if (new Date(take.expires_at as string).getTime() <= Date.now()) {
    throw new AuthError("FORBIDDEN", "Take session expired.");
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

export async function createOwnTakePreviewSignedUrl(params: {
  takeId: string;
}): Promise<TakePreviewResult> {
  const context = await requireUser();
  return createOwnTakePreviewSignedUrlFor(context, params);
}
