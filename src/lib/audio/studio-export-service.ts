/**
 * STUDIO_EXPORT Stage B — enqueue with immutable document_snapshot + multi-source AuthZ.
 * No FFmpeg / offline bake / artifact upload in this module.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import {
  E3_RENDER_JOBS_ENABLED,
  STUDIO_EXPORT_MVP_TIER,
} from "@/config/audio-render";
import {
  assertUnderConcurrentCap,
  assertUnderDailyCap,
  assertUnderQuota,
  buildRenderJobEntitlementSnapshot,
  capabilityForRenderTier,
  isValidRenderJobSourceXor,
  quotaBytesForTier,
  utcDayStartIso,
  RenderJobDomainError,
} from "@/lib/audio/render-job-core";
import { resolveAudioEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { assertAudioCapability } from "@/lib/audio/effective-entitlement";
import {
  PublicAudioGateError,
  assertPublicFreeAudioReleased,
} from "@/lib/audio/public-audio-gate";
import { rejectClientRenderSourceClaims } from "@/lib/audio/render-source-core";
import {
  buildStudioExportDocumentSnapshot,
  collectStudioExportSourceRefs,
} from "@/lib/audio/studio-export-document-snapshot";
import { authorizeStudioExportSourcesForDocument } from "@/lib/audio/studio-export-source-resolution";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  MIX_PARAMS_VERSION,
  defaultMixParameters,
  serializeMixParameters,
} from "@/lib/mix/params";
import { getStudioProjectDocumentFor } from "@/lib/studio/studio-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RenderJobStatus, RenderJobTier } from "@/types/domain";

export type StudioExportJobRecord = {
  id: string;
  ownerId: string;
  projectId: string;
  kind: "STUDIO_EXPORT";
  requestedTier: RenderJobTier;
  status: RenderJobStatus;
  idempotencyKey: string;
  documentVersion: number;
  documentDigest: string;
  createdAt: string;
  /**
   * PREPARED_CODE = enqueue + resolver exist.
   * Bake / Contabo remain STOPPED until later Owner GO.
   */
  workerInfraStatus: "PREPARED_CODE" | "BLOCKED_INFRA";
  /** Present when status is SUCCEEDED and a READY artifact exists for the owner. */
  artifactId?: string | null;
};

const STUDIO_EXPORT_JOB_SELECT =
  "id, owner_id, project_id, kind, requested_tier, idempotency_key, status, created_at, document_snapshot, mix_session_id, take_id";

function assertStudioExportJobsEnabled(): void {
  if (E3_RENDER_JOBS_ENABLED !== true) {
    throw new RenderJobDomainError(
      "Render jobs are not enabled (E3_RENDER_JOBS_ENABLED=OFF).",
      "DISABLED",
    );
  }
}

function mapStudioExportJob(
  row: Record<string, unknown>,
  artifactId: string | null = null,
): StudioExportJobRecord {
  const snapshot = row.document_snapshot as
    | {
        documentVersion?: number;
        documentDigest?: string;
      }
    | null
    | undefined;
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    projectId: row.project_id as string,
    kind: "STUDIO_EXPORT",
    requestedTier: row.requested_tier as RenderJobTier,
    status: row.status as RenderJobStatus,
    idempotencyKey: row.idempotency_key as string,
    documentVersion:
      typeof snapshot?.documentVersion === "number"
        ? snapshot.documentVersion
        : 0,
    documentDigest:
      typeof snapshot?.documentDigest === "string"
        ? snapshot.documentDigest
        : "",
    createdAt: row.created_at as string,
    workerInfraStatus: "PREPARED_CODE",
    artifactId,
  };
}

async function resolveStudioExportArtifactIdFor(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  context: AuthContext,
  jobId: string,
  status: string,
): Promise<string | null> {
  if (status !== "SUCCEEDED") return null;
  const nowIso = new Date().toISOString();
  const { data: art } = await admin
    .from("audio_artifacts")
    .select("id")
    .eq("render_job_id", jobId)
    .eq("owner_id", context.userId)
    .eq("status", "READY")
    .is("deleted_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (art?.id as string | undefined) ?? null;
}

/**
 * Enqueue STUDIO_EXPORT for an owned Studio project.
 * Requires expectedDocumentVersion (CAS). Client must not supply source keys.
 *
 * TOCTOU: document is loaded, validated, then document_version is re-checked
 * immediately before insert. Residual race between re-check and insert is
 * accepted without a new multi-table RPC; export content is the frozen snapshot.
 * Claim re-AuthZ sources (FINDING-01) and must not trust snapshot as AuthZ.
 */
export async function createStudioExportJobFor(
  context: AuthContext,
  input: {
    projectId: string;
    expectedDocumentVersion: unknown;
    idempotencyKey: unknown;
    /** Rejected if present — sources resolved server-side only. */
    clientBody?: Record<string, unknown>;
  },
): Promise<StudioExportJobRecord> {
  assertStudioExportJobsEnabled();

  if (input.clientBody) {
    rejectClientRenderSourceClaims(input.clientBody);
  }

  if (typeof input.projectId !== "string" || input.projectId.length < 8) {
    throw new RenderJobDomainError("Invalid projectId.", "INVALID");
  }
  if (
    typeof input.expectedDocumentVersion !== "number" ||
    !Number.isInteger(input.expectedDocumentVersion) ||
    input.expectedDocumentVersion < 1
  ) {
    throw new RenderJobDomainError(
      "expectedDocumentVersion is required (positive integer).",
      "INVALID",
    );
  }
  const expectedDocumentVersion = input.expectedDocumentVersion;

  if (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim()) {
    throw new RenderJobDomainError("idempotencyKey is required.", "INVALID");
  }
  const idempotencyKey = input.idempotencyKey.trim();

  const tier = STUDIO_EXPORT_MVP_TIER;
  const product = await resolveProductEntitlementForAuthContext(context);
  const entitlement = await resolveAudioEntitlementForAuthContext(context);
  assertAudioCapability(entitlement, capabilityForRenderTier(tier));
  try {
    assertPublicFreeAudioReleased(entitlement);
  } catch (error) {
    if (error instanceof PublicAudioGateError) {
      throw new RenderJobDomainError(error.message, "DISABLED");
    }
    throw error;
  }

  const admin = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("render_jobs")
    .select(STUDIO_EXPORT_JOB_SELECT)
    .eq("owner_id", context.userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) {
    if ((existing.kind as string) !== "STUDIO_EXPORT") {
      throw new RenderJobDomainError(
        "Idempotency key already used by a different job kind.",
        "CONFLICT",
      );
    }
    const artifactId = await resolveStudioExportArtifactIdFor(
      admin,
      context,
      existing.id as string,
      existing.status as string,
    );
    return mapStudioExportJob(existing, artifactId);
  }

  // Ownership + canonical document (server-side).
  let document;
  try {
    document = await getStudioProjectDocumentFor(context, input.projectId);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw error;
  }

  if (document.project.documentVersion !== expectedDocumentVersion) {
    throw new RenderJobDomainError(
      "Document version conflict — expectedDocumentVersion does not match.",
      "CONFLICT",
    );
  }

  // Caps before heavier AuthZ work.
  const dayStart = utcDayStartIso();
  const { count: jobsToday, error: dayErr } = await admin
    .from("render_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", context.userId)
    .gte("created_at", dayStart);
  if (dayErr) throw new Error(dayErr.message);
  assertUnderDailyCap({
    jobsCreatedToday: jobsToday ?? 0,
    premiumTier: product.premiumTier,
  });

  const { count: activeJobs, error: activeErr } = await admin
    .from("render_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", context.userId)
    .in("status", ["QUEUED", "RUNNING"]);
  if (activeErr) throw new Error(activeErr.message);
  assertUnderConcurrentCap({
    activeJobs: activeJobs ?? 0,
    premiumTier: product.premiumTier,
  });

  const nowIso = new Date().toISOString();
  const { data: artBytes } = await admin
    .from("audio_artifacts")
    .select("byte_size")
    .eq("owner_id", context.userId)
    .eq("status", "READY")
    .gt("expires_at", nowIso);
  const usedBytes = (artBytes ?? []).reduce(
    (sum, r) => sum + (Number(r.byte_size) || 0),
    0,
  );
  assertUnderQuota({
    usedBytes,
    quotaBytes: quotaBytesForTier(product.premiumTier),
  });

  // Source collection + AuthZ (object keys from DB only).
  collectStudioExportSourceRefs(document);
  await authorizeStudioExportSourcesForDocument({
    jobOwnerId: context.userId,
    document,
    actorRole: context.profile.role,
  });

  const jobId = randomUUID();
  const capturedAt = new Date().toISOString();
  const documentSnapshot = buildStudioExportDocumentSnapshot({
    jobId,
    ownerId: context.userId,
    projectId: input.projectId,
    documentVersion: expectedDocumentVersion,
    capturedAt,
    document,
  });

  // Best-effort TOCTOU: re-check version immediately before insert.
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
    throw new RenderJobDomainError(
      "Document version conflict — document changed before enqueue.",
      "CONFLICT",
    );
  }

  if (
    !isValidRenderJobSourceXor({
      kind: "STUDIO_EXPORT",
      mixSessionId: null,
      takeId: null,
      projectId: input.projectId,
    })
  ) {
    throw new RenderJobDomainError(
      "Invalid STUDIO_EXPORT source XOR.",
      "INVALID",
    );
  }

  const entitlementSnapshot = buildRenderJobEntitlementSnapshot({
    entitlement,
    parameters: serializeMixParameters(defaultMixParameters()),
    paramsVersion: MIX_PARAMS_VERSION,
  });

  const { data: inserted, error: insertError } = await admin
    .from("render_jobs")
    .insert({
      id: jobId,
      owner_id: context.userId,
      kind: "STUDIO_EXPORT",
      project_id: input.projectId,
      mix_session_id: null,
      take_id: null,
      requested_tier: tier,
      idempotency_key: idempotencyKey,
      status: "QUEUED",
      attempt: 1,
      entitlement_snapshot: entitlementSnapshot,
      document_snapshot: documentSnapshot,
      queued_at: capturedAt,
      timeout_at: null,
    })
    .select(STUDIO_EXPORT_JOB_SELECT)
    .single();

  if (insertError) {
    if (
      insertError.message.toLowerCase().includes("duplicate") ||
      insertError.code === "23505"
    ) {
      const { data: raced } = await admin
        .from("render_jobs")
        .select(STUDIO_EXPORT_JOB_SELECT)
        .eq("owner_id", context.userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced && (raced.kind as string) === "STUDIO_EXPORT") {
        return mapStudioExportJob(raced);
      }
    }
    throw new Error(insertError.message);
  }

  return mapStudioExportJob(inserted);
}

export async function createStudioExportJob(input: {
  projectId: string;
  expectedDocumentVersion: unknown;
  idempotencyKey: unknown;
  clientBody?: Record<string, unknown>;
}): Promise<StudioExportJobRecord> {
  const context = await requireUser();
  return createStudioExportJobFor(context, input);
}

export async function getOwnStudioExportJobFor(
  context: AuthContext,
  jobId: string,
  options?: { projectId?: string },
): Promise<StudioExportJobRecord> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("render_jobs")
    .select(STUDIO_EXPORT_JOB_SELECT)
    .eq("id", jobId)
    .eq("owner_id", context.userId)
    .eq("kind", "STUDIO_EXPORT")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new AuthError("NOT_FOUND", "Studio export job not found.");
  }
  if (
    typeof options?.projectId === "string" &&
    options.projectId.length > 0 &&
    (data.project_id as string) !== options.projectId
  ) {
    throw new AuthError("NOT_FOUND", "Studio export job not found.");
  }
  const artifactId = await resolveStudioExportArtifactIdFor(
    admin,
    context,
    data.id as string,
    data.status as string,
  );
  return mapStudioExportJob(data, artifactId);
}

export async function getOwnStudioExportJob(
  jobId: string,
  options?: { projectId?: string },
): Promise<StudioExportJobRecord> {
  return getOwnStudioExportJobFor(await requireUser(), jobId, options);
}
