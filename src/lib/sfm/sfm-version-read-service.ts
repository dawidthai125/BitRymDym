/**
 * SFM owner-scoped version / status reads (HTTP surface).
 * No client-trusted ownerId; service_role load + owner bind check.
 */

import "server-only";

import { isSfmVersionsV1Enabled } from "@/config/audio-render";
import type { AuthContext } from "@/lib/auth/types";
import { AuthError, requireUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  SfmDomainError,
  type SfmStageKind,
  type SfmStageStatus,
  type SfmVersionStatus,
} from "@/lib/sfm/sfm-domain";
import type { SfmQuality } from "@/lib/sfm/sfm-plan-matrix";
import type { SfmExecutorJobKind } from "@/types/domain";

export type SfmVersionStatusRecord = {
  versionId: string;
  projectId: string;
  ownerId: string;
  status: SfmVersionStatus;
  sourceDocumentVersion: number;
  contentDigest: string;
  acceptedAt: string;
  retentionAnchorAt: string | null;
  expiresAt: string | null;
  stages: Array<{
    kind: SfmStageKind;
    status: SfmStageStatus;
    jobId: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    errorCode: string | null;
  }>;
  grant: {
    grantId: string;
    source: string;
    grantedAt: string;
    grantedQualities: SfmQuality[];
    dayBucket: string;
  } | null;
  jobs: Array<{
    jobId: string;
    kind: SfmExecutorJobKind | string;
    status: string;
    sfmQuality: string | null;
    createdAt: string;
    finishedAt: string | null;
    errorCode: string | null;
  }>;
  currentArtifacts: Array<{
    artifactId: string;
    quality: SfmQuality | string;
    status: string;
    isCurrent: boolean;
    renderJobId: string | null;
  }>;
};

function assertSfmVersionsEnabled(): void {
  if (!isSfmVersionsV1Enabled()) {
    throw new SfmDomainError(
      "Studio Final Mix versions are not enabled (SFM_VERSIONS_V1=OFF).",
      "DISABLED",
    );
  }
}

export async function getOwnSfmVersionStatusFor(
  context: AuthContext,
  versionId: string,
): Promise<SfmVersionStatusRecord> {
  assertSfmVersionsEnabled();

  if (typeof versionId !== "string" || versionId.length < 8) {
    throw new SfmDomainError("Invalid versionId.", "INVALID");
  }

  const admin = createSupabaseAdminClient();

  const { data: version, error: versionError } = await admin
    .from("studio_final_versions")
    .select(
      "id, project_id, owner_id, status, source_document_version, content_digest, accepted_at, retention_anchor_at, expires_at",
    )
    .eq("id", versionId)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (!version) {
    throw new AuthError("NOT_FOUND", "Wersja nie została znaleziona.");
  }
  if ((version.owner_id as string) !== context.userId) {
    throw new AuthError("FORBIDDEN", "Brak dostępu do tej wersji.");
  }

  const { data: stages, error: stagesError } = await admin
    .from("studio_final_stages")
    .select("kind, status, job_id, started_at, finished_at, error_code")
    .eq("version_id", versionId)
    .order("kind", { ascending: true });
  if (stagesError) throw new Error(stagesError.message);

  const { data: grant, error: grantError } = await admin
    .from("studio_final_version_grants")
    .select("id, source, granted_at, granted_qualities, day_bucket")
    .eq("version_id", versionId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (grantError) throw new Error(grantError.message);

  const { data: jobs, error: jobsError } = await admin
    .from("render_jobs")
    .select(
      "id, kind, status, sfm_quality, created_at, finished_at, error_code",
    )
    .eq("sfm_version_id", versionId)
    .eq("owner_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (jobsError) throw new Error(jobsError.message);

  const { data: artifacts, error: artError } = await admin
    .from("audio_artifacts")
    .select("id, sfm_quality, status, is_current, render_job_id")
    .eq("sfm_version_id", versionId)
    .eq("owner_id", context.userId)
    .eq("is_current", true)
    .is("deleted_at", null);
  if (artError) throw new Error(artError.message);

  return {
    versionId: version.id as string,
    projectId: version.project_id as string,
    ownerId: version.owner_id as string,
    status: version.status as SfmVersionStatus,
    sourceDocumentVersion: Number(version.source_document_version),
    contentDigest: String(version.content_digest),
    acceptedAt: String(version.accepted_at),
    retentionAnchorAt: (version.retention_anchor_at as string | null) ?? null,
    expiresAt: (version.expires_at as string | null) ?? null,
    stages: (stages ?? []).map((row) => ({
      kind: row.kind as SfmStageKind,
      status: row.status as SfmStageStatus,
      jobId: (row.job_id as string | null) ?? null,
      startedAt: (row.started_at as string | null) ?? null,
      finishedAt: (row.finished_at as string | null) ?? null,
      errorCode: (row.error_code as string | null) ?? null,
    })),
    grant: grant
      ? {
          grantId: String(grant.id),
          source: String(grant.source),
          grantedAt: String(grant.granted_at),
          grantedQualities: (grant.granted_qualities as SfmQuality[]) ?? [],
          dayBucket: String(grant.day_bucket),
        }
      : null,
    jobs: (jobs ?? []).map((row) => ({
      jobId: String(row.id),
      kind: String(row.kind),
      status: String(row.status),
      sfmQuality: (row.sfm_quality as string | null) ?? null,
      createdAt: String(row.created_at),
      finishedAt: (row.finished_at as string | null) ?? null,
      errorCode: (row.error_code as string | null) ?? null,
    })),
    currentArtifacts: (artifacts ?? []).map((row) => ({
      artifactId: String(row.id),
      quality: String(row.sfm_quality),
      status: String(row.status),
      isCurrent: Boolean(row.is_current),
      renderJobId: (row.render_job_id as string | null) ?? null,
    })),
  };
}

export async function getOwnSfmVersionStatus(
  versionId: string,
): Promise<SfmVersionStatusRecord> {
  return getOwnSfmVersionStatusFor(await requireUser(), versionId);
}

export async function getOwnSfmJobStatusFor(
  context: AuthContext,
  input: { versionId: string; jobId: string },
): Promise<{
  jobId: string;
  versionId: string;
  kind: string;
  status: string;
  sfmQuality: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}> {
  assertSfmVersionsEnabled();

  if (typeof input.versionId !== "string" || input.versionId.length < 8) {
    throw new SfmDomainError("Invalid versionId.", "INVALID");
  }
  if (typeof input.jobId !== "string" || input.jobId.length < 8) {
    throw new SfmDomainError("Invalid jobId.", "INVALID");
  }

  const admin = createSupabaseAdminClient();
  const { data: job, error } = await admin
    .from("render_jobs")
    .select(
      "id, owner_id, sfm_version_id, kind, status, sfm_quality, error_code, error_message, created_at, finished_at",
    )
    .eq("id", input.jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) {
    throw new AuthError("NOT_FOUND", "Zadanie nie zostało znalezione.");
  }
  if ((job.owner_id as string) !== context.userId) {
    throw new AuthError("FORBIDDEN", "Brak dostępu do tego zadania.");
  }
  if ((job.sfm_version_id as string | null) !== input.versionId) {
    throw new AuthError("FORBIDDEN", "Zadanie nie należy do tej wersji.");
  }

  return {
    jobId: String(job.id),
    versionId: String(job.sfm_version_id),
    kind: String(job.kind),
    status: String(job.status),
    sfmQuality: (job.sfm_quality as string | null) ?? null,
    // Allowlisted terminal fields only — never raw SQL.
    errorCode: (job.error_code as string | null) ?? null,
    errorMessage: (job.error_message as string | null) ?? null,
    createdAt: String(job.created_at),
    finishedAt: (job.finished_at as string | null) ?? null,
  };
}

export async function getOwnSfmJobStatus(input: {
  versionId: string;
  jobId: string;
}) {
  return getOwnSfmJobStatusFor(await requireUser(), input);
}
