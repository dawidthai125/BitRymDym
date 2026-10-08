/**
 * E3.5 — Render Job Domain Service (server).
 * Single place for AuthZ, caps, idempotency, state transitions, freeze helpers.
 */

import "server-only";

import {
  AUDIO_ARTIFACTS_BUCKET,
  AUDIO_CODEC,
  AUDIO_RENDER_JOB_TIMEOUT_SECONDS,
  AUDIO_RENDER_MAX_BEAT_BYTES,
  AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS,
  AUDIO_RENDER_MAX_TAKE_BYTES,
  E3_RENDER_JOBS_ENABLED,
  getRenderWorkerSecret,
} from "@/config/audio-render";
import {
  assertAudioCapability,
  hasAudioCapability,
  type EffectiveAudioEntitlement,
} from "@/lib/audio/effective-entitlement";
import { resolveAudioEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import {
  PublicAudioGateError,
  assertPublicFreeAudioReleased,
} from "@/lib/audio/public-audio-gate";
import { buildAudioArtifactObjectKey } from "@/lib/audio/artifact-object-key";
import {
  assertUnderConcurrentCap,
  assertUnderDailyCap,
  assertUnderQuota,
  buildRenderJobEntitlementSnapshot,
  canCancelRenderJob,
  canClaimRenderJob,
  canCompleteRenderJobSuccess,
  capabilityForRenderTier,
  computeTimeoutAtFromClaim,
  isMixRenderJobTier,
  isRunningJobTimedOut,
  parseRenderJobEntitlementSnapshot,
  quotaBytesForTier,
  retentionSecondsForTier,
  utcDayStartIso,
  RenderJobDomainError,
  type RenderJobEntitlementSnapshot,
} from "@/lib/audio/render-job-core";
import { getRenderWorkerAdapter } from "@/lib/audio/worker-adapter";
import {
  rejectClientRenderSourceClaims,
} from "@/lib/audio/render-source-core";
import {
  resolveAuthorizedRenderSourcesForJob,
  resolveAuthorizedTakeExportSourcesForJob,
  type AuthorizedRenderSources,
  type AuthorizedTakeExportSources,
} from "@/lib/audio/render-source-resolution";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  assertMixBeatPlaybackAccess,
  assertMixTakeAccess,
  assertOwnMixSession,
  sanitizeMixClientClaims,
  MixAuthzError,
} from "@/lib/mix/authz";
import {
  parseMixParameters,
  serializeMixParameters,
} from "@/lib/mix/params";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RenderJobStatus, RenderJobTier } from "@/types/domain";
import { timingSafeEqual } from "crypto";

export type { AuthorizedRenderSources, AuthorizedTakeExportSources };

export type RenderJobRecord = {
  id: string;
  ownerId: string;
  mixSessionId: string | null;
  kind?: "MIX" | "TAKE_EXPORT";
  takeId?: string | null;
  requestedTier: RenderJobTier;
  idempotencyKey: string;
  status: RenderJobStatus;
  progress: number | null;
  attempt: number;
  entitlementSnapshot: RenderJobEntitlementSnapshot;
  errorCode: string | null;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  timeoutAt: string | null;
  workerRef: string | null;
  createdAt: string;
  updatedAt: string;
};

type RenderJobRow = {
  id: string;
  owner_id: string;
  mix_session_id: string | null;
  kind?: string | null;
  take_id?: string | null;
  requested_tier: RenderJobTier;
  idempotency_key: string;
  status: RenderJobStatus;
  progress: number | null;
  attempt: number;
  entitlement_snapshot: unknown;
  error_code: string | null;
  error_message: string | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  timeout_at: string | null;
  worker_ref: string | null;
  created_at: string;
  updated_at: string;
};

const JOB_SELECT =
  "id, owner_id, mix_session_id, take_id, kind, requested_tier, idempotency_key, status, progress, attempt, entitlement_snapshot, error_code, error_message, queued_at, started_at, finished_at, timeout_at, worker_ref, created_at, updated_at";

function mapJob(row: RenderJobRow): RenderJobRecord {
  const kind =
    row.kind === "TAKE_EXPORT" ? "TAKE_EXPORT" : ("MIX" as const);
  return {
    id: row.id,
    ownerId: row.owner_id,
    mixSessionId: row.mix_session_id,
    kind,
    takeId: row.take_id ?? null,
    requestedTier: row.requested_tier,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    progress: row.progress,
    attempt: row.attempt,
    entitlementSnapshot: parseRenderJobEntitlementSnapshot(
      row.entitlement_snapshot,
    ),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    timeoutAt: row.timeout_at,
    workerRef: row.worker_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function assertRenderJobsRuntimeEnabled(): void {
  if (E3_RENDER_JOBS_ENABLED !== true) {
    throw new RenderJobDomainError(
      "Render jobs are not enabled (E3_RENDER_JOBS_ENABLED=OFF).",
      "DISABLED",
    );
  }
}

export function assertWorkerSecret(headerValue: string | null): void {
  const expected = getRenderWorkerSecret();
  if (!expected) {
    throw new RenderJobDomainError(
      "E3_RENDER_WORKER_SECRET is not configured.",
      "DISABLED",
    );
  }
  if (!headerValue || !headerValue.startsWith("Bearer ")) {
    throw new RenderJobDomainError("Worker authorization required.", "UNAUTHENTICATED");
  }
  const provided = headerValue.slice("Bearer ".length);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new RenderJobDomainError("Invalid worker secret.", "FORBIDDEN");
  }
}

async function resolveEntitlement(
  context: AuthContext,
): Promise<EffectiveAudioEntitlement> {
  return resolveAudioEntitlementForAuthContext(context);
}

async function loadMixSessionRow(sessionId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("mix_sessions")
    .select(
      "id, owner_id, source_take_id, beat_id, parameters, params_version, status",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new RenderJobDomainError("Mix session not found.", "NOT_FOUND");
  }
  return data;
}

async function loadTakeRow(takeId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("takes")
    .select(
      "id, owner_id, beat_id, status, object_key, storage_bucket, content_type, duration_seconds, byte_size, expires_at, deleted_at",
    )
    .eq("id", takeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Take not found.");
  return data;
}

async function loadBeatMeta(beatId: string) {
  const admin = createSupabaseAdminClient();
  const { data: beat, error } = await admin
    .from("beats")
    .select("id, status, duration_seconds")
    .eq("id", beatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!beat) throw new AuthError("NOT_FOUND", "Beat not found.");

  const { data: asset, error: assetError } = await admin
    .from("beat_audio_assets")
    .select("byte_size")
    .eq("beat_id", beatId)
    .eq("is_active", true)
    .eq("status", "READY")
    .eq("purpose", "MASTER")
    .maybeSingle();
  if (assetError) throw new Error(assetError.message);

  return {
    status: beat.status as string,
    byteSize: (asset?.byte_size as number | null) ?? null,
    durationSeconds: (beat.duration_seconds as number | null) ?? null,
  };
}

async function countJobsCreatedToday(ownerId: string, now: Date): Promise<number> {
  const admin = createSupabaseAdminClient();
  const since = utcDayStartIso(now);
  const { count, error } = await admin
    .from("render_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countActiveJobs(ownerId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("render_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .in("status", ["QUEUED", "RUNNING"]);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function sumActiveArtifactBytes(ownerId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("audio_artifacts")
    .select("byte_size, expires_at, status")
    .eq("owner_id", ownerId)
    .eq("status", "READY")
    .gt("expires_at", nowIso);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce(
    (sum, row) => sum + (typeof row.byte_size === "number" ? row.byte_size : 0),
    0,
  );
}

export async function sessionHasActiveRenderJob(
  mixSessionId: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("render_jobs")
    .select("id", { count: "exact", head: true })
    .eq("mix_session_id", mixSessionId)
    .in("status", ["QUEUED", "RUNNING"]);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

async function applyTimeoutIfNeeded(row: RenderJobRow): Promise<RenderJobRow> {
  if (
    !isRunningJobTimedOut({
      status: row.status,
      timeoutAt: row.timeout_at,
    })
  ) {
    return row;
  }
  const admin = createSupabaseAdminClient();
  const finishedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("render_jobs")
    .update({
      status: "TIMEOUT",
      finished_at: finishedAt,
      error_code: "TIMEOUT",
      error_message: "Render job exceeded 180s wall from CLAIM.",
    })
    .eq("id", row.id)
    .eq("status", "RUNNING")
    .select(JOB_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RenderJobRow | null) ?? { ...row, status: "TIMEOUT", finished_at: finishedAt };
}

export async function createRenderJobFor(
  context: AuthContext,
  input: {
    mixSessionId: string;
    requestedTier: unknown;
    idempotencyKey: unknown;
  },
): Promise<RenderJobRecord> {
  assertRenderJobsRuntimeEnabled();
  const entitlement = await resolveEntitlement(context);

  // MIX path rejects P4 take-only MP3_192.
  if (!isMixRenderJobTier(input.requestedTier)) {
    throw new RenderJobDomainError("Unknown or invalid requested tier.", "INVALID");
  }
  const tier = input.requestedTier;
  const required = capabilityForRenderTier(tier);
  assertAudioCapability(entitlement, required);
  // AC-PE-12 — Free public export create requires PUBLIC_AUDIO release (Premium skip).
  try {
    assertPublicFreeAudioReleased(entitlement);
  } catch (error) {
    if (error instanceof PublicAudioGateError) {
      throw new RenderJobDomainError(error.message, "DISABLED");
    }
    throw error;
  }

  if (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim()) {
    throw new RenderJobDomainError("idempotencyKey is required.", "INVALID");
  }
  const idempotencyKey = input.idempotencyKey.trim();

  const admin = createSupabaseAdminClient();

  // Idempotent return
  const { data: existing, error: existingError } = await admin
    .from("render_jobs")
    .select(JOB_SELECT)
    .eq("owner_id", context.userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) {
    return mapJob(await applyTimeoutIfNeeded(existing as RenderJobRow));
  }

  const session = await loadMixSessionRow(input.mixSessionId);
  assertOwnMixSession({
    sessionOwnerId: session.owner_id as string,
    userId: context.userId,
  });

  const take = await loadTakeRow(session.source_take_id as string);
  try {
    assertMixTakeAccess({
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
      userId: context.userId,
      expectedBeatId: session.beat_id as string,
    });
  } catch (e) {
    await admin
      .from("mix_sessions")
      .update({ status: "SOURCE_UNAVAILABLE" })
      .eq("id", session.id)
      .eq("owner_id", context.userId);
    throw e;
  }

  const beat = await loadBeatMeta(session.beat_id as string);
  assertMixBeatPlaybackAccess({
    beatStatus: beat.status,
    actorRole: context.profile.role,
  });

  const takeDuration = take.duration_seconds as number | null;
  if (
    takeDuration != null &&
    takeDuration > AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS
  ) {
    throw new RenderJobDomainError("Take duration exceeds render max.", "LIMIT");
  }
  if (
    beat.durationSeconds != null &&
    beat.durationSeconds > AUDIO_RENDER_MAX_SOURCE_DURATION_SECONDS
  ) {
    throw new RenderJobDomainError("Beat duration exceeds render max.", "LIMIT");
  }
  const takeBytes = (take.byte_size as number | null) ?? 0;
  if (takeBytes > AUDIO_RENDER_MAX_TAKE_BYTES) {
    throw new RenderJobDomainError("Take size exceeds render max.", "LIMIT");
  }
  if (beat.byteSize != null && beat.byteSize > AUDIO_RENDER_MAX_BEAT_BYTES) {
    throw new RenderJobDomainError("Beat size exceeds render max.", "LIMIT");
  }

  const now = new Date();
  assertUnderDailyCap({
    jobsCreatedToday: await countJobsCreatedToday(context.userId, now),
    premiumTier: entitlement.premiumTier,
  });
  assertUnderConcurrentCap({
    activeJobs: await countActiveJobs(context.userId),
    premiumTier: entitlement.premiumTier,
  });
  assertUnderQuota({
    usedBytes: await sumActiveArtifactBytes(context.userId),
    quotaBytes: quotaBytesForTier(entitlement.premiumTier),
  });

  const allowPro = hasAudioCapability(entitlement, "MIX_PRO");
  const allowMaster = hasAudioCapability(entitlement, "MASTER_BASIC");
  const parameters = parseMixParameters(session.parameters, {
    allowPro,
    allowMaster,
  });
  if ((tier === "HQ_MP3" || tier === "WAV") && !parameters.pro) {
    throw new RenderJobDomainError(
      "Premium HQ/WAV render requires Mix Pro parameters (parameters.pro).",
      "INVALID",
    );
  }
  const snapshot = buildRenderJobEntitlementSnapshot({
    entitlement,
    parameters: serializeMixParameters(parameters),
    paramsVersion: session.params_version as number,
  });

  const { data: inserted, error: insertError } = await admin
    .from("render_jobs")
    .insert({
      owner_id: context.userId,
      kind: "MIX",
      mix_session_id: session.id,
      take_id: null,
      requested_tier: tier,
      idempotency_key: idempotencyKey,
      status: "QUEUED",
      attempt: 1,
      entitlement_snapshot: snapshot,
      queued_at: now.toISOString(),
      timeout_at: null,
    })
    .select(JOB_SELECT)
    .single();

  if (insertError) {
    // Race on unique idempotency — return existing
    if (insertError.message.toLowerCase().includes("duplicate") ||
        insertError.code === "23505") {
      const { data: raced } = await admin
        .from("render_jobs")
        .select(JOB_SELECT)
        .eq("owner_id", context.userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) return mapJob(raced as RenderJobRow);
    }
    throw new Error(insertError.message);
  }

  const job = mapJob(inserted as RenderJobRow);

  await admin
    .from("mix_sessions")
    .update({ status: "READY_TO_RENDER" })
    .eq("id", session.id)
    .eq("owner_id", context.userId);

  const adapter = getRenderWorkerAdapter();
  const { workerRef } = await adapter.enqueue(job.id, {
    jobId: job.id,
    ownerId: job.ownerId,
    mixSessionId: job.mixSessionId,
    tier: job.requestedTier,
  });

  const { data: withRef, error: refError } = await admin
    .from("render_jobs")
    .update({ worker_ref: workerRef })
    .eq("id", job.id)
    .select(JOB_SELECT)
    .single();
  if (refError || !withRef) {
    throw new Error(refError?.message ?? "Failed to set worker_ref.");
  }

  return mapJob(withRef as RenderJobRow);
}

export async function getRenderJobFor(
  context: AuthContext,
  jobId: string,
): Promise<RenderJobRecord & { artifactId: string | null }> {
  assertRenderJobsRuntimeEnabled();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("render_jobs")
    .select(JOB_SELECT)
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new RenderJobDomainError("Render job not found.", "NOT_FOUND");
  if ((data as RenderJobRow).owner_id !== context.userId) {
    throw new RenderJobDomainError("Not render job owner.", "FORBIDDEN");
  }
  const job = mapJob(await applyTimeoutIfNeeded(data as RenderJobRow));
  let artifactId: string | null = null;
  if (job.status === "SUCCEEDED") {
    const { data: art } = await admin
      .from("audio_artifacts")
      .select("id")
      .eq("render_job_id", job.id)
      .eq("owner_id", context.userId)
      .eq("status", "READY")
      .is("deleted_at", null)
      .maybeSingle();
    artifactId = (art?.id as string | undefined) ?? null;
  }
  return { ...job, artifactId };
}

export async function listRenderJobsForSession(
  context: AuthContext,
  mixSessionId: string,
): Promise<RenderJobRecord[]> {
  assertRenderJobsRuntimeEnabled();
  const session = await loadMixSessionRow(mixSessionId);
  assertOwnMixSession({
    sessionOwnerId: session.owner_id as string,
    userId: context.userId,
  });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("render_jobs")
    .select(JOB_SELECT)
    .eq("mix_session_id", mixSessionId)
    .eq("owner_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const rows: RenderJobRecord[] = [];
  for (const row of (data as RenderJobRow[] | null) ?? []) {
    rows.push(mapJob(await applyTimeoutIfNeeded(row)));
  }
  return rows;
}

export async function cancelRenderJobFor(
  context: AuthContext,
  jobId: string,
): Promise<RenderJobRecord> {
  assertRenderJobsRuntimeEnabled();
  const job = await getRenderJobFor(context, jobId);
  if (!canCancelRenderJob(job.status)) {
    throw new RenderJobDomainError(
      `Cannot cancel job in status ${job.status}.`,
      "CONFLICT",
    );
  }

  const admin = createSupabaseAdminClient();
  const finishedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("render_jobs")
    .update({
      status: "CANCELLED",
      finished_at: finishedAt,
      error_code: "CANCELLED",
      error_message: "Cancelled by owner.",
    })
    .eq("id", jobId)
    .eq("owner_id", context.userId)
    .in("status", ["QUEUED", "RUNNING"])
    .select(JOB_SELECT)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new RenderJobDomainError("Job could not be cancelled.", "CONFLICT");
  }

  if (job.workerRef) {
    try {
      await getRenderWorkerAdapter().cancel(job.workerRef);
    } catch {
      /* best-effort */
    }
  }

  return mapJob(data as RenderJobRow);
}

/**
 * Worker CLAIM: FINDING-01 source re-validation → QUEUED → RUNNING.
 * Sources resolve server-side from jobId only (no client keys/URLs).
 */
export async function claimRenderJobAsWorker(
  jobId: string,
): Promise<{
  job: RenderJobRecord;
  sources: AuthorizedRenderSources | AuthorizedTakeExportSources;
}> {
  assertRenderJobsRuntimeEnabled();
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("render_jobs")
    .select(JOB_SELECT)
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new RenderJobDomainError("Render job not found.", "NOT_FOUND");

  const current = row as RenderJobRow;
  if (!canClaimRenderJob(current.status)) {
    throw new RenderJobDomainError(
      `Cannot claim job in status ${current.status}.`,
      "CONFLICT",
    );
  }

  // FINDING-01 — re-validate sources before entering RUNNING.
  let sources: AuthorizedRenderSources | AuthorizedTakeExportSources;
  try {
    sources =
      current.kind === "TAKE_EXPORT"
        ? await resolveAuthorizedTakeExportSourcesForJob(jobId)
        : await resolveAuthorizedRenderSourcesForJob(jobId);
  } catch (sourceError) {
    const message =
      sourceError instanceof Error
        ? sourceError.message
        : "Source resolution failed.";
    const code =
      sourceError instanceof RenderJobDomainError
        ? sourceError.code === "LIMIT"
          ? "SOURCE_LIMIT"
          : sourceError.code === "NOT_FOUND"
            ? "SOURCE_UNAVAILABLE"
            : "SOURCE_FORBIDDEN"
        : "SOURCE_UNAVAILABLE";
    await admin
      .from("render_jobs")
      .update({
        status: "FAILED",
        finished_at: new Date().toISOString(),
        error_code: code,
        error_message: message,
      })
      .eq("id", jobId)
      .eq("status", "QUEUED");
    throw sourceError;
  }

  const claimAt = new Date();
  const timeoutAt = computeTimeoutAtFromClaim(
    claimAt,
    AUDIO_RENDER_JOB_TIMEOUT_SECONDS,
  );

  const { data: updated, error: updateError } = await admin
    .from("render_jobs")
    .update({
      status: "RUNNING",
      started_at: claimAt.toISOString(),
      timeout_at: timeoutAt.toISOString(),
      progress: 0,
    })
    .eq("id", jobId)
    .eq("status", "QUEUED")
    .select(JOB_SELECT)
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) {
    throw new RenderJobDomainError("Claim race lost.", "CONFLICT");
  }
  return { job: mapJob(updated as RenderJobRow), sources };
}

/**
 * Fake SUCCESS: placeholder object + READY artifact.
 * Rejects if job was CANCELLED / timed out / not RUNNING.
 */
export async function completeFakeRenderJobAsWorker(
  jobId: string,
): Promise<{ job: RenderJobRecord; artifactId: string; objectKey: string }> {
  assertRenderJobsRuntimeEnabled();
  const admin = createSupabaseAdminClient();

  const { data: row, error } = await admin
    .from("render_jobs")
    .select(JOB_SELECT)
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new RenderJobDomainError("Render job not found.", "NOT_FOUND");

  const current = await applyTimeoutIfNeeded(row as RenderJobRow);

  if (!canCompleteRenderJobSuccess(current.status)) {
    throw new RenderJobDomainError(
      `Cannot complete job in status ${current.status}.`,
      "CONFLICT",
    );
  }

  if (current.kind === "TAKE_EXPORT" || !current.mix_session_id) {
    throw new RenderJobDomainError(
      "Fake-complete supports MIX jobs only.",
      "INVALID",
    );
  }

  const snapshot = parseRenderJobEntitlementSnapshot(
    current.entitlement_snapshot,
  );
  const tier = current.requested_tier;
  const objectKey = buildAudioArtifactObjectKey({
    ownerId: current.owner_id,
    mixSessionId: current.mix_session_id,
    jobId: current.id,
    tier,
  });

  const placeholder = Buffer.from(
    `e3.5-fake-placeholder:${current.id}:${tier}\n`,
    "utf8",
  );
  const { error: uploadError } = await admin.storage
    .from(AUDIO_ARTIFACTS_BUCKET)
    .upload(objectKey, placeholder, {
      contentType: tier === "WAV" ? "audio/wav" : "audio/mpeg",
      upsert: false,
    });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  // Re-check cancel race before artifact row
  const { data: fresh, error: freshError } = await admin
    .from("render_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  if (freshError) throw new Error(freshError.message);
  if (!fresh || fresh.status !== "RUNNING") {
    await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([objectKey]);
    throw new RenderJobDomainError(
      `Cannot complete job in status ${fresh?.status ?? "missing"}.`,
      "CONFLICT",
    );
  }

  const retentionSec =
    snapshot.entitlement.limits?.artifactRetentionSeconds ??
    retentionSecondsForTier(snapshot.entitlement.premiumTier ?? "FREE");
  const expiresAt = new Date(Date.now() + retentionSec * 1000).toISOString();
  const finishedAt = new Date().toISOString();

  const format =
    tier === "WAV"
      ? "audio/wav"
      : "audio/mpeg";
  const bitrate =
    tier === "BASIC_MP3"
      ? AUDIO_CODEC.BASIC_MP3_BITRATE_KBPS
      : tier === "HQ_MP3"
        ? AUDIO_CODEC.HQ_MP3_BITRATE_KBPS
        : null;
  const sampleRate = tier === "WAV" ? AUDIO_CODEC.WAV_SAMPLE_RATE : null;

  const { data: artifact, error: artError } = await admin
    .from("audio_artifacts")
    .insert({
      owner_id: current.owner_id,
      mix_session_id: current.mix_session_id,
      render_job_id: current.id,
      format,
      quality_tier: tier,
      storage_bucket: AUDIO_ARTIFACTS_BUCKET,
      object_key: objectKey,
      byte_size: placeholder.byteLength,
      duration_ms: 1000,
      checksum: `sha256:fake-${current.id}`,
      sample_rate: sampleRate,
      bitrate_kbps: bitrate,
      status: "READY",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (artError || !artifact) {
    await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([objectKey]);
    throw new Error(artError?.message ?? "Failed to insert audio_artifacts.");
  }

  const { data: succeeded, error: succError } = await admin
    .from("render_jobs")
    .update({
      status: "SUCCEEDED",
      finished_at: finishedAt,
      progress: 100,
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId)
    .eq("status", "RUNNING")
    .select(JOB_SELECT)
    .maybeSingle();

  if (succError) throw new Error(succError.message);
  if (!succeeded) {
    // Cancelled during complete — remove artifact + object
    await admin.from("audio_artifacts").delete().eq("id", artifact.id);
    await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([objectKey]);
    throw new RenderJobDomainError(
      "Job left RUNNING during complete (likely cancelled).",
      "CONFLICT",
    );
  }

  const { hookRenderJobSucceeded } = await import(
    "@/lib/creator-progress/award-hooks"
  );
  await hookRenderJobSucceeded({
    ownerUserId: succeeded.owner_id as string,
    mixSessionId: succeeded.mix_session_id as string,
    renderJobId: succeeded.id as string,
  });

  return {
    job: mapJob(succeeded as RenderJobRow),
    artifactId: artifact.id as string,
    objectKey,
  };
}

/** Fake driver: claim + fake complete for a QUEUED job (worker-secret only). */
export async function driveFakeWorkerJob(
  jobId: string,
): Promise<{ job: RenderJobRecord; artifactId: string; objectKey: string }> {
  await claimRenderJobAsWorker(jobId);
  return completeFakeRenderJobAsWorker(jobId);
}

export async function createRenderJob(input: {
  mixSessionId: string;
  requestedTier: unknown;
  idempotencyKey: unknown;
  body?: Record<string, unknown>;
}): Promise<RenderJobRecord> {
  if (input.body) {
    sanitizeMixClientClaims(input.body);
    rejectClientRenderSourceClaims(input.body);
  }
  const context = await requireUser();
  return createRenderJobFor(context, input);
}

export async function getRenderJob(jobId: string): Promise<RenderJobRecord> {
  const context = await requireUser();
  return getRenderJobFor(context, jobId);
}

export async function listRenderJobs(mixSessionId: string): Promise<RenderJobRecord[]> {
  const context = await requireUser();
  return listRenderJobsForSession(context, mixSessionId);
}

export async function cancelRenderJob(jobId: string): Promise<RenderJobRecord> {
  const context = await requireUser();
  return cancelRenderJobFor(context, jobId);
}

export function toRenderJobHttpStatus(error: unknown): number {
  if (error instanceof RenderJobDomainError) {
    if (error.code === "UNAUTHENTICATED") return 401;
    if (error.code === "NOT_FOUND") return 404;
    if (error.code === "DISABLED") return 403;
    if (error.code === "CONFLICT") return 409;
    if (error.code === "LIMIT" || error.code === "INVALID") return 400;
    return 403;
  }
  if (error instanceof MixAuthzError) {
    if (error.code === "UNAUTHENTICATED") return 401;
    if (error.code === "NOT_FOUND") return 404;
    if (error.code === "DISABLED") return 403;
    return 403;
  }
  if (error instanceof AuthError) {
    if (error.code === "UNAUTHENTICATED") return 401;
    if (error.code === "NOT_FOUND") return 404;
    return 403;
  }
  return 400;
}
