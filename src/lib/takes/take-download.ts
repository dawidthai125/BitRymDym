import "server-only";

import {
  TAKE_AUDIO_BUCKET,
  TAKE_AUDIO_DOWNLOAD_TTL_SECONDS,
} from "@/config/recording";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import {
  getSamplePolicy,
  sampleActorFromPremiumTier,
} from "@/lib/takes/entitlement";
import { assertOwnReadyTakeAccess } from "@/lib/takes/take-access";
import { canDownloadOwnTakeRaw } from "@/lib/takes/take-export-capability";
import {
  assertUnderOwnTakeRawDailyCap,
  countOwnTakeRawDownloadsToday,
  recordOwnTakeRawDownloadEvent,
} from "@/lib/takes/take-raw-download-ledger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TakeDownloadResult = {
  takeId: string;
  beatId: string;
  url: string;
  expiresAt: string;
  durationSeconds: number;
  contentType: string;
  byteSize: number;
};

/**
 * P4.5 — Owner RAW take download (mic.bin).
 * DOWNLOAD_OWN_TAKE_RAW ≡ canDownloadOwnTake (GOLD) + daily C + ledger.
 * Client must never supply object_key / tier / capability.
 */
export async function createOwnTakeDownloadSignedUrlFor(
  context: AuthContext,
  params: { takeId: string },
): Promise<TakeDownloadResult> {
  const admin = createSupabaseAdminClient();

  const { data: take, error } = await admin
    .from("takes")
    .select(
      "id, owner_id, beat_id, status, object_key, storage_bucket, content_type, duration_seconds, byte_size, expires_at, deleted_at",
    )
    .eq("id", params.takeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!take) throw new AuthError("NOT_FOUND", "Take not found.");

  assertOwnReadyTakeAccess({
    take: {
      id: take.id as string,
      owner_id: take.owner_id as string | null,
      beat_id: take.beat_id as string,
      status: take.status as string,
      object_key: take.object_key as string,
      storage_bucket: take.storage_bucket as string,
      content_type: take.content_type as string | null,
      duration_seconds: take.duration_seconds as number | null,
      byte_size: take.byte_size as number | null,
      expires_at: take.expires_at as string,
      deleted_at: take.deleted_at as string | null,
    },
    userId: context.userId,
    purpose: "download",
  });

  const product = await resolveProductEntitlementForAuthContext(context);
  const actor = sampleActorFromPremiumTier(product.premiumTier);
  // Duration unused for download capability — beat duration floor 1 for policy shape.
  const policy = getSamplePolicy({
    actor,
    beatDurationSeconds: Math.max(
      1,
      Math.floor((take.duration_seconds as number | null) ?? 1),
    ),
  });

  if (!canDownloadOwnTakeRaw({ canDownloadOwnTake: policy.canDownloadOwnTake })) {
    throw new AuthError(
      "FORBIDDEN",
      "Pobieranie RAW wymaga planu GOLD.",
    );
  }

  const usedToday = await countOwnTakeRawDownloadsToday(context.userId);
  assertUnderOwnTakeRawDailyCap({ usedToday });

  const { data: signed, error: signError } = await admin.storage
    .from(TAKE_AUDIO_BUCKET)
    .createSignedUrl(
      take.object_key as string,
      TAKE_AUDIO_DOWNLOAD_TTL_SECONDS,
      {
        download: true,
      },
    );

  if (signError || !signed?.signedUrl) {
    throw new Error(
      signError?.message ?? "Failed to create take download URL.",
    );
  }

  // Ledger after successful URL issuance (mirror OD-17 beat download order).
  await recordOwnTakeRawDownloadEvent({
    userId: context.userId,
    takeId: take.id as string,
  });

  const expiresAt = new Date(
    Date.now() + TAKE_AUDIO_DOWNLOAD_TTL_SECONDS * 1000,
  ).toISOString();

  return {
    takeId: take.id as string,
    beatId: take.beat_id as string,
    url: signed.signedUrl,
    expiresAt,
    durationSeconds: (take.duration_seconds as number) ?? 0,
    contentType: (take.content_type as string) ?? "audio/webm",
    byteSize: (take.byte_size as number) ?? 0,
  };
}

export async function createOwnTakeDownloadSignedUrl(params: {
  takeId: string;
}): Promise<TakeDownloadResult> {
  const context = await requireUser();
  return createOwnTakeDownloadSignedUrlFor(context, params);
}
