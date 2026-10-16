/**
 * SFM download AuthZ (OD-SFM-ID-01 + OD-SFM-ID-06).
 * Grant + quality snapshot required — READY / object_key / URL alone ≠ entitlement.
 * Signs Storage URL only after all checks pass (no sign-on-deny).
 *
 * Hardening: F-01 fail-closed job↔version bind · F-02 ownership before domain denial.
 */

import "server-only";

import {
  AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS,
  AUDIO_ARTIFACTS_BUCKET,
  isSfmVersionsV1Enabled,
} from "@/config/audio-render";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  classifyAudioArtifactDomain,
  isSfmDownloadDomain,
} from "@/lib/sfm/sfm-artifact-domain";
import { SfmDomainError } from "@/lib/sfm/sfm-domain";
import { isSfmQuality, type SfmQuality } from "@/lib/sfm/sfm-plan-matrix";
import { resolveSfmQualityEntitlement } from "@/lib/sfm/sfm-quality-entitlement";

export type SfmArtifactDownloadResult = {
  artifactId: string;
  renderJobId: string;
  versionId: string;
  quality: SfmQuality;
  url: string;
  expiresAt: string;
  contentType: string;
  byteSize: number;
  durationMs: number;
};

/** Optional test/prod injection — production callers omit deps. */
export type SfmArtifactDownloadDeps = {
  isEnabled?: () => boolean;
  createAdmin?: () => ReturnType<typeof createSupabaseAdminClient>;
  resolveProduct?: typeof resolveProductEntitlementForAuthContext;
};

function assertSfmVersionsEnabled(isEnabled: () => boolean): void {
  if (!isEnabled()) {
    throw new SfmDomainError(
      "Studio Final Mix versions are not enabled (SFM_VERSIONS_V1=OFF).",
      "DISABLED",
    );
  }
}

/**
 * Owner SFM download — dedicated route AuthZ only.
 * Legacy rows (sfm_version_id NULL) → DENY without backfill (OD-SFM-ID-06).
 */
export async function createOwnSfmArtifactDownloadSignedUrlFor(
  context: AuthContext,
  params: { artifactId: string; deps?: SfmArtifactDownloadDeps },
): Promise<SfmArtifactDownloadResult> {
  const isEnabled = params.deps?.isEnabled ?? isSfmVersionsV1Enabled;
  const createAdmin = params.deps?.createAdmin ?? createSupabaseAdminClient;
  const resolveProduct =
    params.deps?.resolveProduct ?? resolveProductEntitlementForAuthContext;

  assertSfmVersionsEnabled(isEnabled);

  if (
    typeof params.artifactId !== "string" ||
    params.artifactId.length < 8
  ) {
    throw new SfmDomainError("Invalid artifactId.", "INVALID");
  }

  const admin = createAdmin();
  const { data: artifact, error } = await admin
    .from("audio_artifacts")
    .select(
      "id, owner_id, project_id, mix_session_id, take_id, sfm_version_id, sfm_quality, is_current, render_job_id, format, quality_tier, storage_bucket, object_key, byte_size, duration_ms, status, expires_at, deleted_at",
    )
    .eq("id", params.artifactId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!artifact) {
    throw new AuthError("NOT_FOUND", "Artifact not found.");
  }

  // F-02 — ownership before domain-specific denial (no domain oracle).
  if ((artifact.owner_id as string) !== context.userId) {
    throw new AuthError("FORBIDDEN", "Not artifact owner.");
  }

  const domain = classifyAudioArtifactDomain({
    sfmVersionId: (artifact.sfm_version_id as string | null) ?? null,
    mixSessionId: (artifact.mix_session_id as string | null) ?? null,
    takeId: (artifact.take_id as string | null) ?? null,
    projectId: (artifact.project_id as string | null) ?? null,
  });

  // OD-SFM-ID-06 — legacy / non-SFM never become SFM finals here.
  if (!isSfmDownloadDomain(domain)) {
    throw new SfmDomainError(
      "Legacy or non-SFM artifact cannot be downloaded as Studio Final Mix.",
      "NOT_ELIGIBLE",
    );
  }

  if (artifact.deleted_at) {
    throw new AuthError("FORBIDDEN", "Artifact was deleted.");
  }
  if ((artifact.status as string) !== "READY") {
    throw new AuthError("FORBIDDEN", "Artifact is not READY.");
  }
  if (
    artifact.expires_at &&
    new Date(artifact.expires_at as string).getTime() <= Date.now()
  ) {
    throw new AuthError("FORBIDDEN", "Artifact expired.");
  }
  if ((artifact.storage_bucket as string) !== AUDIO_ARTIFACTS_BUCKET) {
    throw new AuthError("FORBIDDEN", "Invalid artifact storage bucket.");
  }
  if (artifact.is_current !== true) {
    throw new SfmDomainError(
      "Artifact is not the current SFM final for its quality.",
      "NOT_ELIGIBLE",
    );
  }

  // F-01 — SFM XOR requires project_id; never skip via truthy guard.
  const artifactProjectId = artifact.project_id as string | null;
  if (
    typeof artifactProjectId !== "string" ||
    artifactProjectId.length < 8
  ) {
    throw new SfmDomainError(
      "SFM artifact missing required project_id.",
      "CONFLICT",
    );
  }

  const versionId = artifact.sfm_version_id as string;
  const sfmQualityRaw = artifact.sfm_quality as string | null;
  if (!isSfmQuality(sfmQualityRaw)) {
    throw new SfmDomainError("Invalid sfm_quality on artifact.", "INVALID");
  }
  const sfmQuality = sfmQualityRaw;

  const { data: version, error: versionError } = await admin
    .from("studio_final_versions")
    .select("id, owner_id, project_id, status, expires_at")
    .eq("id", versionId)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (!version) {
    throw new SfmDomainError("SFM version not found.", "NOT_FOUND");
  }
  if ((version.owner_id as string) !== context.userId) {
    throw new AuthError("FORBIDDEN", "Version owner mismatch.");
  }
  if ((version.project_id as string) !== artifactProjectId) {
    throw new SfmDomainError("Version/project bind mismatch.", "CONFLICT");
  }
  if ((version.status as string) !== "EXPORTS_ELIGIBLE") {
    throw new SfmDomainError(
      "Version is not exports-eligible.",
      "NOT_ELIGIBLE",
    );
  }
  if (
    version.expires_at &&
    new Date(version.expires_at as string).getTime() <= Date.now()
  ) {
    throw new SfmDomainError("Version expired.", "NOT_ELIGIBLE");
  }

  const { data: job, error: jobError } = await admin
    .from("render_jobs")
    .select("id, owner_id, status, sfm_version_id, project_id")
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

  // F-01 — fail-closed: NULL / missing / other version → DENY (never sign).
  const jobVersionId = job.sfm_version_id as string | null | undefined;
  if (
    typeof jobVersionId !== "string" ||
    jobVersionId.length < 8 ||
    jobVersionId !== versionId
  ) {
    throw new SfmDomainError("Job/version bind mismatch.", "CONFLICT");
  }

  const jobProjectId = job.project_id as string | null | undefined;
  if (
    typeof jobProjectId !== "string" ||
    jobProjectId.length < 8 ||
    jobProjectId !== artifactProjectId
  ) {
    throw new SfmDomainError("Job/project bind mismatch.", "CONFLICT");
  }

  const { data: grant, error: grantError } = await admin
    .from("studio_final_version_grants")
    .select("id, user_id, version_id, granted_qualities")
    .eq("user_id", context.userId)
    .eq("version_id", versionId)
    .maybeSingle();
  if (grantError) throw new Error(grantError.message);
  if (!grant) {
    throw new SfmDomainError(
      "No version grant for this Studio Final Mix.",
      "NO_GRANT",
    );
  }

  const product = await resolveProduct(context);
  const decision = resolveSfmQualityEntitlement({
    premiumTier: product.premiumTier,
    quality: sfmQuality,
    versionGrant: {
      grantedQualities: (grant.granted_qualities as string[]) as SfmQuality[],
    },
    accessMode: "DOWNLOAD",
  });
  if (!decision.allow) {
    const code =
      decision.denyCode === "QUALITY_DENIED" ||
      decision.denyCode === "DOWNGRADE_NEW_QUALITY" ||
      decision.denyCode === "PLAN_DENIED"
        ? "QUALITY_DENIED"
        : decision.denyCode === "NO_GRANT"
          ? "NO_GRANT"
          : decision.denyCode === "FREE_NO_DOWNLOAD"
            ? "FREE_NO_DOWNLOAD"
            : "FORBIDDEN";
    throw new SfmDomainError(
      `SFM quality not authorized (${decision.denyCode}).`,
      code,
    );
  }

  // Sign only after AuthZ completes — never on deny paths above.
  const { data: signed, error: signError } = await admin.storage
    .from(AUDIO_ARTIFACTS_BUCKET)
    .createSignedUrl(
      artifact.object_key as string,
      AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS,
      { download: true },
    );
  if (signError || !signed?.signedUrl) {
    throw new Error(signError?.message ?? "Failed to create SFM download URL.");
  }

  return {
    artifactId: artifact.id as string,
    renderJobId: artifact.render_job_id as string,
    versionId,
    quality: sfmQuality,
    url: signed.signedUrl,
    expiresAt: new Date(
      Date.now() + AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS * 1000,
    ).toISOString(),
    contentType: (artifact.format as string) || "audio/mpeg",
    byteSize: (artifact.byte_size as number) ?? 0,
    durationMs: (artifact.duration_ms as number) ?? 0,
  };
}

export async function createOwnSfmArtifactDownloadSignedUrl(params: {
  artifactId: string;
}): Promise<SfmArtifactDownloadResult> {
  const context = await requireUser();
  return createOwnSfmArtifactDownloadSignedUrlFor(context, params);
}

/** HTTP status mapping for SFM download route (no URL in logs). */
export function toSfmDownloadHttpStatus(error: unknown): number {
  if (error instanceof AuthError) {
    if (error.code === "UNAUTHENTICATED") return 401;
    if (error.code === "NOT_FOUND") return 404;
    return 403;
  }
  if (error instanceof SfmDomainError) {
    if (error.code === "DISABLED") return 403;
    if (error.code === "NOT_FOUND") return 404;
    if (error.code === "INVALID") return 400;
    return 403;
  }
  return 400;
}
