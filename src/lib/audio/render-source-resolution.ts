/**
 * E3.6-A — Server-side authorized render source resolution.
 * jobId → render_jobs → owner → mix_session → take/beat → DB keys only.
 * Never trusts client object_key / URL / storage path.
 */

import "server-only";

import {
  AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS,
  E3_RENDER_JOBS_ENABLED,
} from "@/config/audio-render";
import {
  assertRenderBeatEligibleAtBake,
  assertRenderTakeEligibleAtBake,
  type AuthorizedRenderSourceRef,
} from "@/lib/audio/render-source-core";
import {
  parseRenderJobEntitlementSnapshot,
  RenderJobDomainError,
  type RenderJobEntitlementSnapshot,
} from "@/lib/audio/render-job-core";
import { MixAuthzError } from "@/lib/mix/authz-core";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RenderJobTier, SystemRole } from "@/types/domain";

export type AuthorizedRenderSources = {
  jobId: string;
  ownerId: string;
  mixSessionId: string;
  requestedTier: RenderJobTier;
  entitlementSnapshot: RenderJobEntitlementSnapshot;
  take: AuthorizedRenderSourceRef & {
    signedUrl: string;
    signedUrlExpiresAt: string;
  };
  beat: AuthorizedRenderSourceRef & {
    assetId: string;
    signedUrl: string;
    signedUrlExpiresAt: string;
  };
};

/** P4.6 — take-only sources for TAKE_EXPORT (no beat / no mix_session). */
export type AuthorizedTakeExportSources = {
  kind: "TAKE_EXPORT";
  jobId: string;
  ownerId: string;
  takeId: string;
  requestedTier: RenderJobTier;
  entitlementSnapshot: RenderJobEntitlementSnapshot;
  take: AuthorizedRenderSourceRef & {
    signedUrl: string;
    signedUrlExpiresAt: string;
  };
};

type JobRow = {
  id: string;
  owner_id: string;
  mix_session_id: string;
  requested_tier: RenderJobTier;
  status: string;
  entitlement_snapshot: unknown;
};

function mapAuthzError(error: unknown): never {
  if (error instanceof MixAuthzError) {
    throw new RenderJobDomainError(
      error.message,
      error.code === "NOT_FOUND" ? "NOT_FOUND" : "FORBIDDEN",
    );
  }
  throw error;
}

async function loadOwnerRole(ownerId: string): Promise<SystemRole> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = data?.role as SystemRole | undefined;
  if (role === "ADMIN" || role === "MODERATOR" || role === "USER") {
    return role;
  }
  return "USER";
}

async function resolveBeatMasterAsset(beatId: string) {
  const admin = createSupabaseAdminClient();

  const { data: playback, error: playbackError } = await admin
    .from("beat_audio_assets")
    .select(
      "id, object_key, storage_bucket, content_type, byte_size, status, is_active, purpose",
    )
    .eq("beat_id", beatId)
    .eq("purpose", "PLAYBACK")
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();
  if (playbackError) throw new Error(playbackError.message);
  if (playback) return playback;

  const { data: master, error: masterError } = await admin
    .from("beat_audio_assets")
    .select(
      "id, object_key, storage_bucket, content_type, byte_size, status, is_active, purpose",
    )
    .eq("beat_id", beatId)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();
  if (masterError) throw new Error(masterError.message);
  if (!master) {
    throw new RenderJobDomainError(
      "No READY beat audio asset for render.",
      "NOT_FOUND",
    );
  }
  return master;
}

async function createSourceSignedUrl(params: {
  bucket: string;
  objectKey: string;
}): Promise<{ url: string; expiresAt: string }> {
  const admin = createSupabaseAdminClient();
  const ttl = AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS;
  const { data, error } = await admin.storage
    .from(params.bucket)
    .createSignedUrl(params.objectKey, ttl);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to sign render source URL.");
  }
  return {
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

/**
 * Resolve authorized take + beat sources for a render job.
 * Call at CLAIM / bake start (FINDING-01). Does not mutate job status.
 */
export async function resolveAuthorizedRenderSourcesForJob(
  jobId: string,
): Promise<AuthorizedRenderSources> {
  if (E3_RENDER_JOBS_ENABLED !== true) {
    throw new RenderJobDomainError(
      "Render jobs are not enabled (E3_RENDER_JOBS_ENABLED=OFF).",
      "DISABLED",
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: job, error: jobError } = await admin
    .from("render_jobs")
    .select(
      "id, owner_id, mix_session_id, take_id, kind, requested_tier, status, entitlement_snapshot",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) {
    throw new RenderJobDomainError("Render job not found.", "NOT_FOUND");
  }

  const jobRow = job as JobRow & {
    kind?: string | null;
    take_id?: string | null;
  };
  if (jobRow.kind === "TAKE_EXPORT") {
    throw new RenderJobDomainError(
      "TAKE_EXPORT must use resolveAuthorizedTakeExportSourcesForJob (take-only).",
      "INVALID",
    );
  }
  if (jobRow.status !== "QUEUED" && jobRow.status !== "RUNNING") {
    throw new RenderJobDomainError(
      `Cannot resolve sources for job in status ${jobRow.status}.`,
      "CONFLICT",
    );
  }

  if (!jobRow.mix_session_id) {
    throw new RenderJobDomainError("Mix session not found.", "NOT_FOUND");
  }

  const snapshot = parseRenderJobEntitlementSnapshot(
    jobRow.entitlement_snapshot,
  );
  if (
    snapshot.entitlement.userId != null &&
    snapshot.entitlement.userId !== jobRow.owner_id
  ) {
    throw new RenderJobDomainError(
      "Entitlement snapshot owner mismatch.",
      "FORBIDDEN",
    );
  }

  const { data: session, error: sessionError } = await admin
    .from("mix_sessions")
    .select("id, owner_id, source_take_id, beat_id, status")
    .eq("id", jobRow.mix_session_id)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) {
    throw new RenderJobDomainError("Mix session not found.", "NOT_FOUND");
  }
  if ((session.owner_id as string) !== jobRow.owner_id) {
    throw new RenderJobDomainError(
      "Mix session does not belong to job owner.",
      "FORBIDDEN",
    );
  }

  const { data: take, error: takeError } = await admin
    .from("takes")
    .select(
      "id, owner_id, beat_id, status, object_key, storage_bucket, content_type, duration_seconds, byte_size, expires_at, deleted_at",
    )
    .eq("id", session.source_take_id as string)
    .maybeSingle();
  if (takeError) throw new Error(takeError.message);
  if (!take) {
    throw new RenderJobDomainError("Source take not found.", "NOT_FOUND");
  }

  let takeRef: AuthorizedRenderSourceRef;
  try {
    takeRef = assertRenderTakeEligibleAtBake({
      take: {
        id: take.id as string,
        owner_id: take.owner_id as string | null,
        beat_id: take.beat_id as string,
        status: take.status as string,
        object_key: take.object_key as string,
        storage_bucket: take.storage_bucket as string,
        content_type: take.content_type as string | null,
        duration_seconds: take.duration_seconds as number | null,
        byte_size: (take.byte_size as number | null) ?? null,
        expires_at: take.expires_at as string,
        deleted_at: take.deleted_at as string | null,
      },
      jobOwnerId: jobRow.owner_id,
      expectedBeatId: session.beat_id as string,
    });
  } catch (error) {
    mapAuthzError(error);
    throw error;
  }

  const { data: beat, error: beatError } = await admin
    .from("beats")
    .select("id, status, duration_seconds")
    .eq("id", session.beat_id as string)
    .maybeSingle();
  if (beatError) throw new Error(beatError.message);
  if (!beat) {
    throw new RenderJobDomainError("Beat not found.", "NOT_FOUND");
  }

  const asset = await resolveBeatMasterAsset(beat.id as string);
  const actorRole = await loadOwnerRole(jobRow.owner_id);

  let beatRef: AuthorizedRenderSourceRef;
  try {
    beatRef = assertRenderBeatEligibleAtBake({
      beatId: beat.id as string,
      beatStatus: beat.status as string,
      actorRole,
      durationSeconds: (beat.duration_seconds as number | null) ?? null,
      asset: {
        id: asset.id as string,
        object_key: asset.object_key as string,
        storage_bucket: asset.storage_bucket as string,
        content_type: (asset.content_type as string | null) ?? null,
        byte_size: (asset.byte_size as number | null) ?? null,
        status: asset.status as string,
        is_active: Boolean(asset.is_active),
        purpose: asset.purpose as string,
      },
    });
  } catch (error) {
    mapAuthzError(error);
    throw error;
  }

  const takeSigned = await createSourceSignedUrl({
    bucket: takeRef.storageBucket,
    objectKey: takeRef.objectKey,
  });
  const beatSigned = await createSourceSignedUrl({
    bucket: beatRef.storageBucket,
    objectKey: beatRef.objectKey,
  });

  return {
    jobId: jobRow.id,
    ownerId: jobRow.owner_id,
    mixSessionId: jobRow.mix_session_id,
    requestedTier: jobRow.requested_tier,
    entitlementSnapshot: snapshot,
    take: {
      ...takeRef,
      signedUrl: takeSigned.url,
      signedUrlExpiresAt: takeSigned.expiresAt,
    },
    beat: {
      ...beatRef,
      assetId: asset.id as string,
      signedUrl: beatSigned.url,
      signedUrlExpiresAt: beatSigned.expiresAt,
    },
  };
}

/**
 * P4.6 — Resolve authorized take-only source for TAKE_EXPORT.
 * No mix_session · no beat · DB object_key only (never client-supplied).
 */
export async function resolveAuthorizedTakeExportSourcesForJob(
  jobId: string,
): Promise<AuthorizedTakeExportSources> {
  if (E3_RENDER_JOBS_ENABLED !== true) {
    throw new RenderJobDomainError(
      "Render jobs are not enabled (E3_RENDER_JOBS_ENABLED=OFF).",
      "DISABLED",
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: job, error: jobError } = await admin
    .from("render_jobs")
    .select(
      "id, owner_id, mix_session_id, take_id, kind, requested_tier, status, entitlement_snapshot",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) {
    throw new RenderJobDomainError("Render job not found.", "NOT_FOUND");
  }

  if ((job.kind as string | null) !== "TAKE_EXPORT") {
    throw new RenderJobDomainError(
      "Job kind is not TAKE_EXPORT.",
      "INVALID",
    );
  }
  if (job.status !== "QUEUED" && job.status !== "RUNNING") {
    throw new RenderJobDomainError(
      `Cannot resolve sources for job in status ${job.status}.`,
      "CONFLICT",
    );
  }
  if (job.mix_session_id != null) {
    throw new RenderJobDomainError(
      "TAKE_EXPORT job must not have mix_session_id.",
      "INVALID",
    );
  }
  if (typeof job.take_id !== "string" || !job.take_id) {
    throw new RenderJobDomainError(
      "TAKE_EXPORT job missing take_id.",
      "INVALID",
    );
  }

  const snapshot = parseRenderJobEntitlementSnapshot(job.entitlement_snapshot);
  if (
    snapshot.entitlement.userId != null &&
    snapshot.entitlement.userId !== (job.owner_id as string)
  ) {
    throw new RenderJobDomainError(
      "Entitlement snapshot owner mismatch.",
      "FORBIDDEN",
    );
  }

  const { data: take, error: takeError } = await admin
    .from("takes")
    .select(
      "id, owner_id, beat_id, status, object_key, storage_bucket, content_type, duration_seconds, byte_size, expires_at, deleted_at",
    )
    .eq("id", job.take_id as string)
    .maybeSingle();
  if (takeError) throw new Error(takeError.message);
  if (!take) {
    throw new RenderJobDomainError("Source take not found.", "NOT_FOUND");
  }

  let takeRef: AuthorizedRenderSourceRef;
  try {
    // expectedBeatId = take.beat_id: ownership/READY/key binding only (no mix join).
    takeRef = assertRenderTakeEligibleAtBake({
      take: {
        id: take.id as string,
        owner_id: take.owner_id as string | null,
        beat_id: take.beat_id as string,
        status: take.status as string,
        object_key: take.object_key as string,
        storage_bucket: take.storage_bucket as string,
        content_type: take.content_type as string | null,
        duration_seconds: take.duration_seconds as number | null,
        byte_size: (take.byte_size as number | null) ?? null,
        expires_at: take.expires_at as string,
        deleted_at: take.deleted_at as string | null,
      },
      jobOwnerId: job.owner_id as string,
      expectedBeatId: take.beat_id as string,
    });
  } catch (error) {
    mapAuthzError(error);
    throw error;
  }

  const takeSigned = await createSourceSignedUrl({
    bucket: takeRef.storageBucket,
    objectKey: takeRef.objectKey,
  });

  return {
    kind: "TAKE_EXPORT",
    jobId: job.id as string,
    ownerId: job.owner_id as string,
    takeId: job.take_id as string,
    requestedTier: job.requested_tier as RenderJobTier,
    entitlementSnapshot: snapshot,
    take: {
      ...takeRef,
      signedUrl: takeSigned.url,
      signedUrlExpiresAt: takeSigned.expiresAt,
    },
  };
}
