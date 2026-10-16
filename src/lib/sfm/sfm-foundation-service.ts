/**
 * SFM Foundation — Accept + domain stage transitions.
 * Stage C: sfm_start_stage enqueues SFM_* executor jobs and binds stage.job_id.
 * Job SUCCEEDED alone does not complete a stage — use completeSfmStageForService.
 */

import "server-only";

import { isSfmVersionsV1Enabled } from "@/config/audio-render";
import type { AuthContext } from "@/lib/auth/types";
import { AuthError } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStudioProjectDocumentFor } from "@/lib/studio/studio-service";
import {
  isSfmStageKind,
  mapSfmRpcErrorMessage,
  SfmDomainError,
  type SfmStageKind,
  type SfmStageStatus,
  type SfmVersionStatus,
} from "@/lib/sfm/sfm-domain";
import { buildSfmAcceptContentSnapshot } from "@/lib/sfm/sfm-version-snapshot";

export type SfmAcceptedVersionRecord = {
  versionId: string;
  projectId: string;
  ownerId: string;
  sourceDocumentVersion: number;
  contentDigest: string;
  status: SfmVersionStatus;
  acceptedAt: string;
  mixStageStatus: SfmStageStatus;
  masterStageStatus: SfmStageStatus;
};

export type SfmStageRecord = {
  stageId: string;
  versionId: string;
  kind: SfmStageKind;
  status: SfmStageStatus;
  startedAt: string | null;
  finishedAt?: string | null;
  jobId?: string | null;
  versionStatus?: SfmVersionStatus;
  currentFinalVersionId?: string | null;
};

function assertSfmVersionsEnabled(): void {
  if (!isSfmVersionsV1Enabled()) {
    throw new SfmDomainError(
      "Studio Final Mix versions are not enabled (SFM_VERSIONS_V1=OFF).",
      "DISABLED",
    );
  }
}

function throwMappedRpcError(error: { message: string }): never {
  const code = mapSfmRpcErrorMessage(error.message);
  if (code === "NOT_OWNER" || code === "FORBIDDEN") {
    throw new AuthError("FORBIDDEN", "Brak dostępu do tego projektu.");
  }
  if (code === "NOT_FOUND") {
    throw new AuthError("NOT_FOUND", "Wersja lub projekt nie został znaleziony.");
  }
  if (code === "VERSION_CONFLICT") {
    throw new SfmDomainError(
      "Document version conflict — expectedDocumentVersion does not match.",
      "VERSION_CONFLICT",
    );
  }
  throw new SfmDomainError(error.message, code);
}

export async function acceptSfmVersionFor(
  context: AuthContext,
  input: {
    projectId: string;
    expectedDocumentVersion: unknown;
  },
): Promise<SfmAcceptedVersionRecord> {
  assertSfmVersionsEnabled();

  if (typeof input.projectId !== "string" || input.projectId.length < 8) {
    throw new SfmDomainError("Invalid projectId.", "INVALID");
  }
  if (
    typeof input.expectedDocumentVersion !== "number" ||
    !Number.isInteger(input.expectedDocumentVersion) ||
    input.expectedDocumentVersion < 1
  ) {
    throw new SfmDomainError(
      "expectedDocumentVersion is required (positive integer).",
      "INVALID",
    );
  }
  const expectedDocumentVersion = input.expectedDocumentVersion;

  const document = await getStudioProjectDocumentFor(context, input.projectId);

  if (document.project.documentVersion !== expectedDocumentVersion) {
    throw new SfmDomainError(
      "Document version conflict — expectedDocumentVersion does not match.",
      "VERSION_CONFLICT",
    );
  }

  const capturedAt = new Date().toISOString();
  const snapshot = buildSfmAcceptContentSnapshot({
    ownerId: context.userId,
    projectId: input.projectId,
    documentVersion: expectedDocumentVersion,
    capturedAt,
    document,
  });

  const admin = createSupabaseAdminClient();

  // TOCTOU: re-check ownership + version under service client before RPC.
  const { data: verRow, error: verError } = await admin
    .from("studio_projects")
    .select("document_version, owner_id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (verError) throw new Error(verError.message);
  if (!verRow) {
    throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  }
  if ((verRow.owner_id as string) !== context.userId) {
    throw new AuthError("FORBIDDEN", "Brak dostępu do tego projektu.");
  }
  if ((verRow.document_version as number) !== expectedDocumentVersion) {
    throw new SfmDomainError(
      "Document version conflict — document changed before Accept.",
      "VERSION_CONFLICT",
    );
  }

  const { data, error } = await admin.rpc("sfm_accept_version", {
    p_project_id: input.projectId,
    p_owner_id: context.userId,
    p_expected_document_version: expectedDocumentVersion,
    p_content_snapshot: snapshot,
    p_content_digest: snapshot.documentDigest,
  });

  if (error) throwMappedRpcError(error);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new SfmDomainError("Accept RPC returned no row.", "CONFLICT");
  }

  const record = row as Record<string, unknown>;
  return {
    versionId: String(record.version_id),
    projectId: String(record.project_id),
    ownerId: String(record.owner_id),
    sourceDocumentVersion: Number(record.source_document_version),
    contentDigest: String(record.content_digest),
    status: record.status as SfmVersionStatus,
    acceptedAt: String(record.accepted_at),
    mixStageStatus: record.mix_stage_status as SfmStageStatus,
    masterStageStatus: record.master_stage_status as SfmStageStatus,
  };
}

export async function startSfmStageFor(
  context: AuthContext,
  input: { versionId: string; kind: unknown },
): Promise<SfmStageRecord> {
  assertSfmVersionsEnabled();

  if (typeof input.versionId !== "string" || input.versionId.length < 8) {
    throw new SfmDomainError("Invalid versionId.", "INVALID");
  }
  if (!isSfmStageKind(input.kind)) {
    throw new SfmDomainError("Invalid stage kind.", "INVALID");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("sfm_start_stage", {
    p_version_id: input.versionId,
    p_owner_id: context.userId,
    p_kind: input.kind,
  });

  if (error) throwMappedRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new SfmDomainError("Start stage RPC returned no row.", "CONFLICT");
  }
  const record = row as Record<string, unknown>;
  return {
    stageId: String(record.stage_id),
    versionId: String(record.version_id),
    kind: record.kind as SfmStageKind,
    status: record.status as SfmStageStatus,
    startedAt: (record.started_at as string | null) ?? null,
    jobId: (record.job_id as string | null) ?? null,
  };
}

/**
 * Service/worker path — completes domain stage after executor job terminal state.
 * Does not mark stage complete from job SUCCEEDED alone (caller must invoke this).
 */
export async function completeSfmStageForService(input: {
  versionId: string;
  kind: unknown;
  status: "SUCCEEDED" | "FAILED";
  jobId?: string | null;
  errorCode?: string | null;
}): Promise<SfmStageRecord> {
  assertSfmVersionsEnabled();

  if (typeof input.versionId !== "string" || input.versionId.length < 8) {
    throw new SfmDomainError("Invalid versionId.", "INVALID");
  }
  if (!isSfmStageKind(input.kind)) {
    throw new SfmDomainError("Invalid stage kind.", "INVALID");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("sfm_complete_stage", {
    p_version_id: input.versionId,
    p_kind: input.kind,
    p_status: input.status,
    p_job_id: input.jobId ?? null,
    p_error_code: input.errorCode ?? null,
  });

  if (error) throwMappedRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new SfmDomainError("Complete stage RPC returned no row.", "CONFLICT");
  }
  const record = row as Record<string, unknown>;
  return {
    stageId: String(record.stage_id),
    versionId: String(record.version_id),
    kind: record.kind as SfmStageKind,
    status: record.stage_status as SfmStageStatus,
    startedAt: null,
    versionStatus: record.version_status as SfmVersionStatus,
    currentFinalVersionId:
      (record.current_final_version_id as string | null) ?? null,
  };
}
