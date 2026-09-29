/**
 * E3.6-A — pure Render source AuthZ / claim rejection (unit-test safe).
 * Server resolution lives in render-source-resolution.ts.
 *
 * FINDING-01: bake-start must re-validate take/beat — create-time AuthZ is insufficient.
 */

import {
  AUDIO_RENDER_MAX_BEAT_BYTES,
  AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS,
  AUDIO_RENDER_MAX_TAKE_BYTES,
} from "@/config/audio-render";
import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import { isTakeExpired } from "@/lib/takes/entitlement";
import { expectedUserTakeObjectKey } from "@/lib/takes/object-key";
import { assertMixBeatPlaybackAccess } from "@/lib/mix/authz-core";
import type { SystemRole } from "@/types/domain";

/** Client must never supply these as render source authority. */
export const CLIENT_RENDER_SOURCE_CLAIM_KEYS = [
  "objectKey",
  "object_key",
  "url",
  "signedUrl",
  "signed_url",
  "storagePath",
  "storage_path",
  "storageBucket",
  "storage_bucket",
  "takeObjectKey",
  "take_object_key",
  "beatObjectKey",
  "beat_object_key",
  "sourceUrl",
  "source_url",
  "takeUrl",
  "take_url",
  "beatUrl",
  "beat_url",
  "takeStoragePath",
  "beatStoragePath",
] as const;

export type AuthorizedRenderSourceRef = {
  kind: "take" | "beat";
  id: string;
  storageBucket: string;
  objectKey: string;
  contentType: string | null;
  durationSeconds: number | null;
  byteSize: number | null;
};

/**
 * Reject client-supplied Storage paths / URLs for render sources.
 * Job identity is jobId only — sources resolve server-side from DB.
 */
export function rejectClientRenderSourceClaims(
  body: Record<string, unknown>,
): void {
  for (const key of CLIENT_RENDER_SOURCE_CLAIM_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new RenderJobDomainError(
        `Client must not supply ${key} as render source.`,
        "FORBIDDEN",
      );
    }
  }
}

export type RenderTakeBakeRow = {
  id: string;
  owner_id: string | null;
  beat_id: string;
  status: string;
  object_key: string;
  storage_bucket: string;
  content_type: string | null;
  duration_seconds: number | null;
  byte_size: number | null;
  expires_at: string;
  deleted_at: string | null;
};

/**
 * FINDING-01 — re-validate take at bake / claim start.
 * Ownership must match job.owner_id; object_key must match expected user take key.
 */
export function assertRenderTakeEligibleAtBake(params: {
  take: RenderTakeBakeRow;
  jobOwnerId: string;
  expectedBeatId: string;
  nowMs?: number;
}): AuthorizedRenderSourceRef {
  const { take, jobOwnerId, expectedBeatId } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (take.owner_id !== jobOwnerId) {
    throw new RenderJobDomainError(
      "Take does not belong to job owner.",
      "FORBIDDEN",
    );
  }
  if (take.deleted_at || take.status === "DELETED") {
    throw new RenderJobDomainError("Take was deleted.", "FORBIDDEN");
  }
  if (
    take.status === "EXPIRED" ||
    isTakeExpired({ expiresAt: take.expires_at, nowMs })
  ) {
    throw new RenderJobDomainError("Take session expired.", "FORBIDDEN");
  }
  if (take.status !== "READY") {
    throw new RenderJobDomainError("Take is not READY for render.", "FORBIDDEN");
  }
  if (take.beat_id !== expectedBeatId) {
    throw new RenderJobDomainError(
      "Take does not belong to mix session beat.",
      "FORBIDDEN",
    );
  }
  if (take.storage_bucket !== TAKE_AUDIO_BUCKET) {
    throw new RenderJobDomainError(
      "Invalid take storage bucket for render.",
      "FORBIDDEN",
    );
  }
  if (
    !expectedUserTakeObjectKey({
      ownerId: jobOwnerId,
      takeId: take.id,
      objectKey: take.object_key,
    })
  ) {
    throw new RenderJobDomainError(
      "Take object key does not match binding.",
      "FORBIDDEN",
    );
  }
  if (
    take.duration_seconds != null &&
    take.duration_seconds > AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS
  ) {
    throw new RenderJobDomainError(
      "Take duration exceeds render max.",
      "LIMIT",
    );
  }
  const takeBytes = take.byte_size ?? 0;
  if (takeBytes > AUDIO_RENDER_MAX_TAKE_BYTES) {
    throw new RenderJobDomainError("Take size exceeds render max.", "LIMIT");
  }

  return {
    kind: "take",
    id: take.id,
    storageBucket: TAKE_AUDIO_BUCKET,
    objectKey: take.object_key,
    contentType: take.content_type,
    durationSeconds: take.duration_seconds,
    byteSize: take.byte_size,
  };
}

export type RenderBeatBakeMeta = {
  beatId: string;
  beatStatus: string;
  actorRole: SystemRole;
  durationSeconds: number | null;
  asset: {
    id: string;
    object_key: string;
    storage_bucket: string;
    content_type: string | null;
    byte_size: number | null;
    status: string;
    is_active: boolean;
    purpose: string;
  };
};

/**
 * FINDING-01 — re-validate beat PLAYBACK + READY MASTER asset at bake start.
 * Asset object_key comes only from DB — never from client.
 */
export function assertRenderBeatEligibleAtBake(
  params: RenderBeatBakeMeta,
): AuthorizedRenderSourceRef {
  assertMixBeatPlaybackAccess({
    beatStatus: params.beatStatus,
    actorRole: params.actorRole,
  });

  const { asset } = params;
  if (!asset.is_active || asset.status !== "READY") {
    throw new RenderJobDomainError(
      "Beat audio asset is not READY for render.",
      "FORBIDDEN",
    );
  }
  if (asset.purpose !== "MASTER" && asset.purpose !== "PLAYBACK") {
    throw new RenderJobDomainError(
      "Beat audio asset purpose not allowed for render.",
      "FORBIDDEN",
    );
  }
  if (asset.storage_bucket !== BEAT_AUDIO_BUCKET) {
    throw new RenderJobDomainError(
      "Invalid beat storage bucket for render.",
      "FORBIDDEN",
    );
  }
  if (
    params.durationSeconds != null &&
    params.durationSeconds > AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS
  ) {
    throw new RenderJobDomainError(
      "Beat duration exceeds render max.",
      "LIMIT",
    );
  }
  if (
    asset.byte_size != null &&
    asset.byte_size > AUDIO_RENDER_MAX_BEAT_BYTES
  ) {
    throw new RenderJobDomainError("Beat size exceeds render max.", "LIMIT");
  }

  return {
    kind: "beat",
    id: params.beatId,
    storageBucket: BEAT_AUDIO_BUCKET,
    objectKey: asset.object_key,
    contentType: asset.content_type,
    durationSeconds: params.durationSeconds,
    byteSize: asset.byte_size,
  };
}

/** Reject arbitrary client object keys for audio-artifacts / sources. */
export function assertObjectKeyNotClientChosen(params: {
  candidate: string | null | undefined;
  allowedCanonical: string;
}): void {
  if (params.candidate == null || params.candidate === "") {
    throw new RenderJobDomainError("object_key is required.", "INVALID");
  }
  if (params.candidate !== params.allowedCanonical) {
    throw new RenderJobDomainError(
      "Client/arbitrary object_key rejected.",
      "FORBIDDEN",
    );
  }
}
