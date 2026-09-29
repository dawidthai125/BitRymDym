/**
 * E3.6-E — Owner signed download for READY mix artifacts (FINDING-03).
 * Reuses take-download AuthZ/TTL pattern — does not accept client object_key.
 */

import "server-only";

import {
  AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS,
  AUDIO_ARTIFACTS_BUCKET,
  E3_RENDER_JOBS_ENABLED,
} from "@/config/audio-render";
import {
  assertAudioCapability,
} from "@/lib/audio/effective-entitlement";
import { resolveAudioEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import {
  capabilityForRenderTier,
  RenderJobDomainError,
  isRenderJobTier,
} from "@/lib/audio/render-job-core";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ArtifactDownloadResult = {
  artifactId: string;
  renderJobId: string;
  url: string;
  expiresAt: string;
  contentType: string;
  byteSize: number;
  durationMs: number;
  qualityTier: string;
};

export async function createOwnArtifactDownloadSignedUrlFor(
  context: AuthContext,
  params: { artifactId: string },
): Promise<ArtifactDownloadResult> {
  if (E3_RENDER_JOBS_ENABLED !== true) {
    throw new RenderJobDomainError(
      "Render jobs are not enabled (E3_RENDER_JOBS_ENABLED=OFF).",
      "DISABLED",
    );
  }

  const entitlement = await resolveAudioEntitlementForAuthContext(context);

  const admin = createSupabaseAdminClient();
  const { data: artifact, error } = await admin
    .from("audio_artifacts")
    .select(
      "id, owner_id, render_job_id, format, quality_tier, storage_bucket, object_key, byte_size, duration_ms, status, expires_at, deleted_at",
    )
    .eq("id", params.artifactId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!artifact) {
    throw new AuthError("NOT_FOUND", "Artifact not found.");
  }
  if ((artifact.owner_id as string) !== context.userId) {
    throw new AuthError("FORBIDDEN", "Not artifact owner.");
  }
  if (artifact.deleted_at) {
    throw new AuthError("FORBIDDEN", "Artifact was deleted.");
  }
  if ((artifact.status as string) !== "READY") {
    throw new AuthError("FORBIDDEN", "Artifact is not READY.");
  }
  if (new Date(artifact.expires_at as string).getTime() <= Date.now()) {
    throw new AuthError("FORBIDDEN", "Artifact expired.");
  }
  if ((artifact.storage_bucket as string) !== AUDIO_ARTIFACTS_BUCKET) {
    throw new AuthError("FORBIDDEN", "Invalid artifact storage bucket.");
  }

  // E3.7-F — download capability MUST match trusted DB quality_tier (never BASIC-only for HQ/WAV).
  const qualityTier = artifact.quality_tier as string;
  if (!isRenderJobTier(qualityTier)) {
    throw new AuthError("FORBIDDEN", "Invalid artifact quality_tier.");
  }
  assertAudioCapability(entitlement, capabilityForRenderTier(qualityTier));

  // FINDING-03 — READY alone is insufficient; owning job must be SUCCEEDED.
  const { data: job, error: jobError } = await admin
    .from("render_jobs")
    .select("id, owner_id, status")
    .eq("id", artifact.render_job_id as string)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) {
    throw new AuthError("FORBIDDEN", "Render job missing for artifact.");
  }
  if ((job.owner_id as string) !== context.userId) {
    throw new AuthError("FORBIDDEN", "Job owner mismatch.");
  }
  if ((job.status as string) !== "SUCCEEDED") {
    throw new AuthError(
      "FORBIDDEN",
      "Artifact is not Final Truth (job not SUCCEEDED).",
    );
  }

  const { data: signed, error: signError } = await admin.storage
    .from(AUDIO_ARTIFACTS_BUCKET)
    .createSignedUrl(
      artifact.object_key as string,
      AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS,
      { download: true },
    );
  if (signError || !signed?.signedUrl) {
    throw new Error(signError?.message ?? "Failed to create artifact download URL.");
  }

  return {
    artifactId: artifact.id as string,
    renderJobId: artifact.render_job_id as string,
    url: signed.signedUrl,
    expiresAt: new Date(
      Date.now() + AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS * 1000,
    ).toISOString(),
    contentType: (artifact.format as string) || "audio/mpeg",
    byteSize: (artifact.byte_size as number) ?? 0,
    durationMs: (artifact.duration_ms as number) ?? 0,
    qualityTier: artifact.quality_tier as string,
  };
}

export async function createOwnArtifactDownloadSignedUrl(params: {
  artifactId: string;
}): Promise<ArtifactDownloadResult> {
  const context = await requireUser();
  return createOwnArtifactDownloadSignedUrlFor(context, params);
}
