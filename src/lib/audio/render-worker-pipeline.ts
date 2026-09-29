/**
 * E3.6-C/D — EXTERNAL worker Basic MP3 pipeline (OD-E36-04 = C).
 * Encode runs via native FFmpeg on worker host — not Next.js Route Handler bake/encode.
 * Uploads to private audio-artifacts then completes job via secure complete().
 */

import "server-only";

import {
  AUDIO_ARTIFACTS_BUCKET,
  AUDIO_CODEC,
} from "@/config/audio-render";
import { buildAudioArtifactObjectKey } from "@/lib/audio/artifact-object-key";
import { encodeBasicMp3FromBake } from "@/lib/audio/mp3-encode";
import {
  canCompleteRenderJobSuccess,
  parseRenderJobEntitlementSnapshot,
  retentionSecondsForPremium,
  RenderJobDomainError,
} from "@/lib/audio/render-job-core";
import {
  claimRenderJobAsWorker,
  type RenderJobRecord,
} from "@/lib/audio/render-job-service";
import {
  decodeRenderSourceToStereoPcm,
  renderDecodeErrorCode,
} from "@/lib/audio/render-decode";
import { resolveAuthorizedRenderSourcesForJob } from "@/lib/audio/render-source-resolution";
import { bakeServerBasicV1 } from "@/lib/audio/server-basic-bake";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RealBasicMp3PipelineResult = {
  job: RenderJobRecord;
  artifactId: string;
  objectKey: string;
  byteSize: number;
  checksumSha256: string;
  bitrateKbps: number;
  durationMs: number;
  encoder: string;
};

async function downloadSourceBytes(params: {
  bucket: string;
  objectKey: string;
}): Promise<Uint8Array> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(params.bucket)
    .download(params.objectKey);
  if (error || !data) {
    throw new RenderJobDomainError(
      `Source download failed: ${error?.message ?? "missing"}`,
      "NOT_FOUND",
    );
  }
  const ab = await data.arrayBuffer();
  return new Uint8Array(ab);
}

async function failRunningJob(
  jobId: string,
  code: string,
  message: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("render_jobs")
    .update({
      status: "FAILED",
      finished_at: new Date().toISOString(),
      error_code: code,
      error_message: message.slice(0, 500),
    })
    .eq("id", jobId)
    .eq("status", "RUNNING");
}

/**
 * Full EXTERNAL worker path for one job:
 * claim (+ FINDING-01) → fetch sources → bake → ffmpeg MP3 → QC → upload → READY → SUCCEEDED
 */
export async function runRealBasicMp3WorkerJob(
  jobId: string,
): Promise<RealBasicMp3PipelineResult> {
  const { job } = await claimRenderJobAsWorker(jobId);

  if (job.requestedTier !== "BASIC_MP3") {
    await failRunningJob(
      jobId,
      "TIER_UNSUPPORTED",
      "E3.6 worker supports BASIC_MP3 only.",
    );
    throw new RenderJobDomainError(
      "E3.6 worker supports BASIC_MP3 only.",
      "INVALID",
    );
  }

  try {
    // Re-resolve at bake start (FINDING-01) — claim already validated; refresh while RUNNING.
    const fresh = await resolveAuthorizedRenderSourcesForJob(jobId);

    const takeBytes = await downloadSourceBytes({
      bucket: fresh.take.storageBucket,
      objectKey: fresh.take.objectKey,
    });
    const beatBytes = await downloadSourceBytes({
      bucket: fresh.beat.storageBucket,
      objectKey: fresh.beat.objectKey,
    });

    let takePcm;
    let beatPcm;
    try {
      takePcm = await decodeRenderSourceToStereoPcm({
        bytes: takeBytes,
        contentType: fresh.take.contentType,
        label: "take",
      });
      beatPcm = await decodeRenderSourceToStereoPcm({
        bytes: beatBytes,
        contentType: fresh.beat.contentType,
        label: "beat",
      });
    } catch (e) {
      const code = renderDecodeErrorCode(e);
      const message = e instanceof Error ? e.message : "SOURCE_DECODE";
      await failRunningJob(jobId, code, message);
      throw e;
    }

    const bake = bakeServerBasicV1({
      take: takePcm,
      beat: beatPcm,
      parameters: fresh.entitlementSnapshot.parameters,
    });

    const encoded = await encodeBasicMp3FromBake(bake);

    const objectKey = buildAudioArtifactObjectKey({
      ownerId: job.ownerId,
      mixSessionId: job.mixSessionId,
      jobId: job.id,
      tier: "BASIC_MP3",
    });

    return completeRealBasicMp3AfterEncode({
      jobId: job.id,
      objectKey,
      encodedBytes: encoded.bytes,
      checksumSha256: encoded.checksumSha256,
      byteSize: encoded.byteSize,
      durationMs: encoded.durationMs,
      bitrateKbps: encoded.bitrateKbps,
      sampleRate: encoded.sampleRate,
      encoder: encoded.encoder,
    });
  } catch (error) {
    if (
      error instanceof RenderJobDomainError &&
      (error.code === "DISABLED" ||
        error.message.includes("SOURCE_DECODE") ||
        error.code === "INVALID")
    ) {
      // failRunningJob may already have run
      const admin = createSupabaseAdminClient();
      const { data } = await admin
        .from("render_jobs")
        .select("status")
        .eq("id", jobId)
        .maybeSingle();
      if (data?.status === "RUNNING") {
        await failRunningJob(
          jobId,
          error.code === "DISABLED" ? "ENCODER_UNAVAILABLE" : "ENCODE_FAILED",
          error.message,
        );
      }
    }
    throw error;
  }
}

/**
 * Upload real MP3 + insert READY + SUCCEEDED (FINDING-02/03).
 * Worker already produced QC'd bytes (or call after external encode).
 */
export async function completeRealBasicMp3AfterEncode(params: {
  jobId: string;
  objectKey: string;
  encodedBytes: Buffer;
  checksumSha256: string;
  byteSize: number;
  durationMs: number;
  bitrateKbps: number;
  sampleRate: number;
  encoder: string;
}): Promise<RealBasicMp3PipelineResult> {
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("render_jobs")
    .select(
      "id, owner_id, mix_session_id, requested_tier, status, entitlement_snapshot, timeout_at",
    )
    .eq("id", params.jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new RenderJobDomainError("Render job not found.", "NOT_FOUND");

  if (!canCompleteRenderJobSuccess(row.status as RenderJobRecord["status"])) {
    throw new RenderJobDomainError(
      `Cannot complete job in status ${row.status}.`,
      "CONFLICT",
    );
  }

  const expectedKey = buildAudioArtifactObjectKey({
    ownerId: row.owner_id as string,
    mixSessionId: row.mix_session_id as string,
    jobId: row.id as string,
    tier: "BASIC_MP3",
  });
  if (params.objectKey !== expectedKey) {
    throw new RenderJobDomainError(
      "Client/arbitrary object_key rejected.",
      "FORBIDDEN",
    );
  }
  if (params.byteSize <= 0 || params.encodedBytes.byteLength !== params.byteSize) {
    throw new RenderJobDomainError("Invalid encoded byte size.", "INVALID");
  }

  const snapshot = parseRenderJobEntitlementSnapshot(row.entitlement_snapshot);
  const retentionSec = retentionSecondsForPremium(
    snapshot.entitlement.premiumActive,
  );
  const expiresAt = new Date(Date.now() + retentionSec * 1000).toISOString();
  const finishedAt = new Date().toISOString();

  const { error: uploadError } = await admin.storage
    .from(AUDIO_ARTIFACTS_BUCKET)
    .upload(params.objectKey, params.encodedBytes, {
      contentType: "audio/mpeg",
      upsert: false,
    });
  if (uploadError) {
    await failRunningJob(
      params.jobId,
      "UPLOAD_FAILED",
      uploadError.message,
    );
    throw new RenderJobDomainError(uploadError.message, "INVALID");
  }

  // Cancel race before DB insert
  const { data: fresh, error: freshError } = await admin
    .from("render_jobs")
    .select("status")
    .eq("id", params.jobId)
    .maybeSingle();
  if (freshError) throw new Error(freshError.message);
  if (!fresh || fresh.status !== "RUNNING") {
    await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([params.objectKey]);
    throw new RenderJobDomainError(
      `Cannot complete job in status ${fresh?.status ?? "missing"}.`,
      "CONFLICT",
    );
  }

  const { data: artifact, error: artError } = await admin
    .from("audio_artifacts")
    .insert({
      owner_id: row.owner_id,
      mix_session_id: row.mix_session_id,
      render_job_id: row.id,
      format: "audio/mpeg",
      quality_tier: "BASIC_MP3",
      storage_bucket: AUDIO_ARTIFACTS_BUCKET,
      object_key: params.objectKey,
      byte_size: params.byteSize,
      duration_ms: params.durationMs,
      checksum: params.checksumSha256,
      sample_rate: params.sampleRate || AUDIO_CODEC.WAV_SAMPLE_RATE,
      bitrate_kbps: params.bitrateKbps,
      status: "READY",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (artError || !artifact) {
    // FINDING-02 — best-effort orphan cleanup
    await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([params.objectKey]);
    await failRunningJob(
      params.jobId,
      "ARTIFACT_INSERT_FAILED",
      artError?.message ?? "artifact insert failed",
    );
    throw new RenderJobDomainError(
      artError?.message ?? "Failed to insert audio_artifacts.",
      "INVALID",
    );
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
    .eq("id", params.jobId)
    .eq("status", "RUNNING")
    .select(
      "id, owner_id, mix_session_id, requested_tier, idempotency_key, status, progress, attempt, entitlement_snapshot, error_code, error_message, queued_at, started_at, finished_at, timeout_at, worker_ref, created_at, updated_at",
    )
    .maybeSingle();

  if (succError) throw new Error(succError.message);
  if (!succeeded) {
    // FINDING-03 — READY without SUCCEEDED must not remain
    await admin.from("audio_artifacts").delete().eq("id", artifact.id);
    await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([params.objectKey]);
    throw new RenderJobDomainError(
      "Job left RUNNING during complete (likely cancelled).",
      "CONFLICT",
    );
  }

  const jobRecord = await getJobRecord(params.jobId);

  return {
    job: jobRecord,
    artifactId: artifact.id as string,
    objectKey: params.objectKey,
    byteSize: params.byteSize,
    checksumSha256: params.checksumSha256,
    bitrateKbps: params.bitrateKbps,
    durationMs: params.durationMs,
    encoder: params.encoder,
  };
}

async function getJobRecord(jobId: string): Promise<RenderJobRecord> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("render_jobs")
    .select(
      "id, owner_id, mix_session_id, requested_tier, idempotency_key, status, progress, attempt, entitlement_snapshot, error_code, error_message, queued_at, started_at, finished_at, timeout_at, worker_ref, created_at, updated_at",
    )
    .eq("id", jobId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "job missing");
  const snapshot = parseRenderJobEntitlementSnapshot(data.entitlement_snapshot);
  return {
    id: data.id as string,
    ownerId: data.owner_id as string,
    mixSessionId: data.mix_session_id as string,
    requestedTier: data.requested_tier as RenderJobRecord["requestedTier"],
    idempotencyKey: data.idempotency_key as string,
    status: data.status as RenderJobRecord["status"],
    progress: data.progress as number | null,
    attempt: data.attempt as number,
    entitlementSnapshot: snapshot,
    errorCode: data.error_code as string | null,
    errorMessage: data.error_message as string | null,
    queuedAt: data.queued_at as string,
    startedAt: data.started_at as string | null,
    finishedAt: data.finished_at as string | null,
    timeoutAt: data.timeout_at as string | null,
    workerRef: data.worker_ref as string | null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}
