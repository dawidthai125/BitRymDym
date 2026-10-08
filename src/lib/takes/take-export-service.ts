/**
 * P4.6 — TAKE_EXPORT job enqueue (not E3 MIX).
 * FFmpeg runs only on EXTERNAL worker — never in Vercel request path.
 */

import "server-only";

import { E3_RENDER_JOBS_ENABLED } from "@/config/audio-render";
import {
  assertUnderConcurrentCap,
  assertUnderDailyCap,
  assertUnderQuota,
  buildRenderJobEntitlementSnapshot,
  capabilityForRenderTier,
  isRenderJobTier,
  quotaBytesForTier,
  utcDayStartIso,
  RenderJobDomainError,
} from "@/lib/audio/render-job-core";
import { resolveAudioEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { assertAudioCapability } from "@/lib/audio/effective-entitlement";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  MIX_PARAMS_VERSION,
  defaultMixParameters,
  serializeMixParameters,
} from "@/lib/mix/params";
import { assertOwnReadyTakeAccess } from "@/lib/takes/take-access";
import {
  canExportOwnTake,
  isTakeExportQuality,
  renderTierForTakeExportQuality,
  type TakeExportQuality,
} from "@/lib/takes/take-export-capability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RenderJobStatus, RenderJobTier } from "@/types/domain";

export type TakeExportJobRecord = {
  id: string;
  ownerId: string;
  takeId: string;
  kind: "TAKE_EXPORT";
  requestedTier: RenderJobTier;
  quality: TakeExportQuality;
  status: RenderJobStatus;
  idempotencyKey: string;
  createdAt: string;
  /**
   * PREPARED_CODE = TAKE_EXPORT worker pipeline exists in app code.
   * Live EXTERNAL Contabo process remains STOPPED until Phase 2 Owner GO.
   * Never claim live worker availability here.
   */
  workerInfraStatus: "PREPARED_CODE" | "BLOCKED_INFRA";
  /** Present when status=SUCCEEDED and artifact READY. */
  artifactId?: string | null;
};

const TAKE_EXPORT_JOB_SELECT =
  "id, owner_id, take_id, kind, requested_tier, idempotency_key, status, created_at, mix_session_id";

function assertTakeExportJobsEnabled(): void {
  if (E3_RENDER_JOBS_ENABLED !== true) {
    throw new RenderJobDomainError(
      "Render jobs are not enabled (E3_RENDER_JOBS_ENABLED=OFF).",
      "DISABLED",
    );
  }
}

/**
 * Enqueue TAKE_EXPORT for an owned READY take.
 * Does not run FFmpeg. Reuses render_jobs + daily/concurrent caps.
 */
export async function createTakeExportJobFor(
  context: AuthContext,
  input: {
    takeId: string;
    quality: unknown;
    idempotencyKey: unknown;
  },
): Promise<TakeExportJobRecord> {
  assertTakeExportJobsEnabled();

  if (!isTakeExportQuality(input.quality)) {
    throw new RenderJobDomainError("Unknown take export quality.", "INVALID");
  }
  const quality = input.quality;
  const tier = renderTierForTakeExportQuality(quality);

  if (typeof input.takeId !== "string" || input.takeId.length < 8) {
    throw new RenderJobDomainError("Invalid takeId.", "INVALID");
  }
  if (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim()) {
    throw new RenderJobDomainError("idempotencyKey is required.", "INVALID");
  }
  const idempotencyKey = input.idempotencyKey.trim();

  const product = await resolveProductEntitlementForAuthContext(context);
  if (!canExportOwnTake({ premiumTier: product.premiumTier, quality })) {
    throw new AuthError(
      "FORBIDDEN",
      `Eksport ${quality} niedostępny w planie ${product.premiumTier}.`,
    );
  }

  // MIX capability matrix still holds EXPORT_* keys; take ladder is stricter above.
  const entitlement = await resolveAudioEntitlementForAuthContext(context);
  assertAudioCapability(entitlement, capabilityForRenderTier(tier));

  const admin = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("render_jobs")
    .select(TAKE_EXPORT_JOB_SELECT)
    .eq("owner_id", context.userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) {
    return mapTakeExportJob(existing, quality);
  }

  // Reuse READY non-expired artifact for same take+tier
  const nowIso = new Date().toISOString();
  const { data: readyArt } = await admin
    .from("audio_artifacts")
    .select("id, render_job_id, expires_at, status")
    .eq("owner_id", context.userId)
    .eq("take_id", input.takeId)
    .eq("quality_tier", tier)
    .eq("status", "READY")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readyArt?.render_job_id) {
    const { data: priorJob } = await admin
      .from("render_jobs")
      .select(TAKE_EXPORT_JOB_SELECT)
      .eq("id", readyArt.render_job_id as string)
      .maybeSingle();
    if (priorJob && (priorJob.status as string) === "SUCCEEDED") {
      return mapTakeExportJob(priorJob, quality);
    }
  }

  const { data: take, error: takeError } = await admin
    .from("takes")
    .select(
      "id, owner_id, beat_id, status, object_key, storage_bucket, content_type, duration_seconds, byte_size, expires_at, deleted_at",
    )
    .eq("id", input.takeId)
    .maybeSingle();
  if (takeError) throw new Error(takeError.message);
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
    purpose: "export",
  });

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

  const snapshot = buildRenderJobEntitlementSnapshot({
    entitlement,
    parameters: serializeMixParameters(defaultMixParameters()),
    paramsVersion: MIX_PARAMS_VERSION,
  });

  const { data: inserted, error: insertError } = await admin
    .from("render_jobs")
    .insert({
      owner_id: context.userId,
      kind: "TAKE_EXPORT",
      mix_session_id: null,
      take_id: input.takeId,
      requested_tier: tier,
      idempotency_key: idempotencyKey,
      status: "QUEUED",
      attempt: 1,
      entitlement_snapshot: snapshot,
      queued_at: new Date().toISOString(),
      timeout_at: null,
    })
    .select(TAKE_EXPORT_JOB_SELECT)
    .single();

  if (insertError) {
    if (
      insertError.message.toLowerCase().includes("duplicate") ||
      insertError.code === "23505"
    ) {
      const { data: raced } = await admin
        .from("render_jobs")
        .select(TAKE_EXPORT_JOB_SELECT)
        .eq("owner_id", context.userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) return mapTakeExportJob(raced, quality);
    }
    throw new Error(insertError.message);
  }

  return mapTakeExportJob(inserted, quality);
}

function mapTakeExportJob(
  row: Record<string, unknown>,
  quality: TakeExportQuality,
  artifactId?: string | null,
): TakeExportJobRecord {
  if (!isRenderJobTier(row.requested_tier)) {
    throw new RenderJobDomainError("Invalid requested_tier on job.", "INVALID");
  }
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    takeId: row.take_id as string,
    kind: "TAKE_EXPORT",
    requestedTier: row.requested_tier,
    quality,
    status: row.status as RenderJobStatus,
    idempotencyKey: row.idempotency_key as string,
    createdAt: row.created_at as string,
    // Code pipeline READY; Contabo process still STOPPED (Phase 2).
    workerInfraStatus: "PREPARED_CODE",
    artifactId: artifactId ?? null,
  };
}

export async function createTakeExportJob(input: {
  takeId: string;
  quality: unknown;
  idempotencyKey: unknown;
}): Promise<TakeExportJobRecord> {
  const context = await requireUser();
  return createTakeExportJobFor(context, input);
}

export async function getOwnTakeExportJobFor(
  context: AuthContext,
  jobId: string,
): Promise<TakeExportJobRecord> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("render_jobs")
    .select(TAKE_EXPORT_JOB_SELECT)
    .eq("id", jobId)
    .eq("owner_id", context.userId)
    .eq("kind", "TAKE_EXPORT")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Take export job not found.");
  const tier = data.requested_tier as RenderJobTier;
  const quality =
    tier === "BASIC_MP3"
      ? "MP3_128"
      : tier === "MP3_192"
        ? "MP3_192"
        : tier === "HQ_MP3"
          ? "MP3_320"
          : "WAV";

  let artifactId: string | null = null;
  if ((data.status as string) === "SUCCEEDED") {
    const nowIso = new Date().toISOString();
    const { data: art } = await admin
      .from("audio_artifacts")
      .select("id")
      .eq("render_job_id", jobId)
      .eq("owner_id", context.userId)
      .eq("status", "READY")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    artifactId = (art?.id as string | undefined) ?? null;
  }

  return mapTakeExportJob(data, quality, artifactId);
}

export async function getOwnTakeExportJob(jobId: string): Promise<TakeExportJobRecord> {
  const context = await requireUser();
  return getOwnTakeExportJobFor(context, jobId);
}
