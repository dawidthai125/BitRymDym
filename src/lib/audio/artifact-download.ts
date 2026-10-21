/**
 * E3.6-E — Owner signed download for READY mix artifacts (FINDING-03).
 * Reuses take-download AuthZ/TTL pattern — does not accept client object_key.
 */

import "server-only";

import {
  AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS,
  AUDIO_ARTIFACTS_BUCKET,
  E3_RENDER_JOBS_ENABLED,
  isSfmVersionsV1Enabled,
} from "@/config/audio-render";
import {
  assertAudioCapability,
} from "@/lib/audio/effective-entitlement";
import {
  resolveAudioEntitlementForAuthContext,
  resolveProductEntitlementForAuthContext,
} from "@/lib/audio/load-premium-entitlement";
import {
  PublicAudioGateError,
  assertPublicFreeAudioReleased,
} from "@/lib/audio/public-audio-gate";
import {
  capabilityForRenderTier,
  RenderJobDomainError,
  isRenderJobTier,
} from "@/lib/audio/render-job-core";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  evaluatePremiumDownloadGate,
  premiumQualityFromRenderTier,
} from "@/lib/premium/premium-download-authz";
import {
  denyMessageForPremiumDownloadReason,
  loadPremiumWorkDownloadContext,
} from "@/lib/premium/premium-download-context";
import {
  assertOwnedThenMixRouteDomain,
  classifyAudioArtifactDomain,
} from "@/lib/sfm/sfm-artifact-domain";
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
  // AC-PE-12 — Free public download requires PUBLIC_AUDIO release (Premium skip).
  // Remaining ownership / READY / SUCCEEDED / tier checks stay mandatory below.
  try {
    assertPublicFreeAudioReleased(entitlement);
  } catch (error) {
    if (error instanceof PublicAudioGateError) {
      throw new RenderJobDomainError(error.message, "DISABLED");
    }
    throw error;
  }

  const admin = createSupabaseAdminClient();
  const { data: artifact, error } = await admin
    .from("audio_artifacts")
    .select(
      "id, owner_id, project_id, mix_session_id, take_id, sfm_version_id, render_job_id, format, quality_tier, storage_bucket, object_key, byte_size, duration_ms, status, expires_at, deleted_at",
    )
    .eq("id", params.artifactId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!artifact) {
    throw new AuthError("NOT_FOUND", "Artifact not found.");
  }

  // OD-SFM-ID-01 / OD-SFM-ID-06 + F-02 — ownership before domain denial.
  // SFM → always DENY on mix. LEGACY_STUDIO → DENY when SFM_VERSIONS_V1 ON.
  // E3_MIX / TAKE continue AuthZ below after owner+domain gate.
  const domain = classifyAudioArtifactDomain({
    sfmVersionId: (artifact.sfm_version_id as string | null) ?? null,
    mixSessionId: (artifact.mix_session_id as string | null) ?? null,
    takeId: (artifact.take_id as string | null) ?? null,
    projectId: (artifact.project_id as string | null) ?? null,
  });
  assertOwnedThenMixRouteDomain({
    artifactOwnerId: artifact.owner_id as string,
    userId: context.userId,
    domain,
    sfmVersionsV1Enabled: isSfmVersionsV1Enabled(),
  });
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

  // PREMIUM-01/04/09 — quality live (D-3) + sticky unlock + R1 retention before mint.
  // FREE never downloads ready MIX artifacts. Client never supplies unlock/tier.
  const product = await resolveProductEntitlementForAuthContext(context);
  const premiumQuality = premiumQualityFromRenderTier(qualityTier);
  if (!premiumQuality) {
    throw new AuthError("FORBIDDEN", "Nieobsługiwana jakość pliku.");
  }
  const workCtx = await loadPremiumWorkDownloadContext({
    admin,
    userId: context.userId,
    takeId: (artifact.take_id as string | null) ?? null,
    projectId: (artifact.project_id as string | null) ?? null,
    mixSessionId: (artifact.mix_session_id as string | null) ?? null,
  });
  const gate = evaluatePremiumDownloadGate({
    premiumTier: product.premiumTier,
    quality: premiumQuality,
    hasUnlock: workCtx.hasUnlock,
    retentionExpiresAtMs: workCtx.retentionExpiresAtMs,
    nowMs: Date.now(),
    workStatus: workCtx.workStatus,
  });
  if (!gate.ok) {
    throw new AuthError(
      "FORBIDDEN",
      denyMessageForPremiumDownloadReason(gate.reason),
    );
  }

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
