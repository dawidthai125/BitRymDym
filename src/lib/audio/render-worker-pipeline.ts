/**
 * E3.6 / E3.7 — EXTERNAL worker render pipeline (OD-E36-04 = C).
 * Encode runs via native FFmpeg / PCM WAV on worker host — not Vercel RH.
 * READY only after encode + QC + upload + DB insert (FINDING-02/03).
 */

import "server-only";

import {
  AUDIO_ARTIFACTS_BUCKET,
  AUDIO_CODEC,
} from "@/config/audio-render";
import {
  buildAudioArtifactObjectKey,
  buildStudioExportArtifactObjectKey,
  buildTakeExportArtifactObjectKey,
  expectedStudioExportArtifactObjectKey,
  expectedTakeExportArtifactObjectKey,
} from "@/lib/audio/artifact-object-key";
import {
  encodeBasicMp3FromBake,
  encodeHqMp3FromBake,
  encodeMp3192FromBake,
  type BakePcmInput,
} from "@/lib/audio/mp3-encode";
import {
  canCompleteRenderJobSuccess,
  parseRenderJobEntitlementSnapshot,
  retentionSecondsForTier,
  RenderJobDomainError,
} from "@/lib/audio/render-job-core";
import {
  claimRenderJobAsWorker,
  type RenderJobRecord,
} from "@/lib/audio/render-job-service";
import {
  decodeRenderSourceToStereoPcm,
  renderDecodeErrorCode,
  type DecodedPcmStereo,
} from "@/lib/audio/render-decode";
import {
  resolveAuthorizedRenderSourcesForJob,
  resolveAuthorizedTakeExportSourcesForJob,
} from "@/lib/audio/render-source-resolution";
import { resolveAuthorizedStudioExportSourcesForJob } from "@/lib/audio/studio-export-source-resolution";
import { bakeServerBasicV1 } from "@/lib/audio/server-basic-bake";
import { bakeServerProV1 } from "@/lib/audio/server-pro-bake";
import { encodeWavFromBake } from "@/lib/audio/wav-encode";
import { studioEngineDocumentFromProject } from "@/lib/studio/studio-engine-document-from-project";
import { planStudioExportDuration } from "@/lib/studio/studio-export-fx-post-roll";
import {
  renderStudioDocumentOffline,
  StudioOfflineRenderError,
  type StudioOfflinePcmResolver,
} from "@/lib/studio/studio-offline-render";
import type { RenderJobTier } from "@/types/domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function decodedPcmToBakeInput(pcm: DecodedPcmStereo): BakePcmInput {
  return {
    interleaved: pcm.interleaved,
    sampleRate: pcm.sampleRate,
    channels: 2,
    frames: pcm.frames,
    durationMs: Math.max(1, Math.round((pcm.frames / pcm.sampleRate) * 1000)),
  };
}

export type RealWorkerPipelineResult = {
  job: RenderJobRecord;
  artifactId: string;
  objectKey: string;
  byteSize: number;
  checksumSha256: string;
  bitrateKbps: number | null;
  durationMs: number;
  encoder: string;
  qualityTier: RenderJobTier;
  contentType: string;
};

/** @deprecated alias — Basic path result shape. */
export type RealBasicMp3PipelineResult = RealWorkerPipelineResult;

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

async function ensureFailedIfStillRunning(
  jobId: string,
  error: unknown,
): Promise<void> {
  if (!(error instanceof RenderJobDomainError)) return;
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

function mapStudioOfflineRenderFail(error: StudioOfflineRenderError): {
  code: string;
  message: string;
} {
  switch (error.code) {
    case "STUDIO_RENDER_SOURCE_MISSING":
    case "STUDIO_RENDER_SOURCE_INVALID":
      return { code: "SOURCE_UNAVAILABLE", message: error.message };
    case "STUDIO_RENDER_DURATION_CAP":
    case "STUDIO_RENDER_TAIL_DURATION_CAP":
    case "STUDIO_RENDER_MEMORY_CAP":
      return { code: "LIMIT", message: error.message };
    case "STUDIO_RENDER_ARTIFACT_UNSUPPORTED":
    case "STUDIO_RENDER_FX_UNSUPPORTED":
    case "STUDIO_RENDER_EMPTY_SESSION":
    case "STUDIO_RENDER_INVALID_DOCUMENT":
    default:
      return { code: "ENCODE_FAILED", message: error.message };
  }
}

/**
 * Dispatcher — EXTERNAL worker entry for MIX, TAKE_EXPORT, STUDIO_EXPORT.
 * Unknown kind → fail-closed (never falls through to MIX bake).
 */
export async function runRealRenderWorkerJob(
  jobId: string,
): Promise<RealWorkerPipelineResult> {
  const { job } = await claimRenderJobAsWorker(jobId);
  if (job.kind === "TAKE_EXPORT") {
    return runClaimedTakeExportWorkerJob(job);
  }
  if (job.kind === "STUDIO_EXPORT") {
    return runClaimedStudioExportWorkerJob(job);
  }
  if (job.kind !== "MIX" && job.kind !== undefined) {
    await failRunningJob(
      jobId,
      "INVALID",
      `Unsupported render job kind: ${String(job.kind)}`,
    );
    throw new RenderJobDomainError(
      `Unsupported render job kind: ${String(job.kind)}`,
      "INVALID",
    );
  }
  if (job.requestedTier === "BASIC_MP3") {
    return runClaimedBasicMp3WorkerJob(job);
  }
  if (job.requestedTier === "HQ_MP3" || job.requestedTier === "WAV") {
    return runClaimedPremiumWorkerJob(job);
  }
  await failRunningJob(
    jobId,
    "TIER_UNSUPPORTED",
    `Unsupported render tier: ${job.requestedTier}`,
  );
  throw new RenderJobDomainError(
    `Unsupported render tier: ${job.requestedTier}`,
    "INVALID",
  );
}

/**
 * Stage G — STUDIO_EXPORT offline bake → WAV → canonical artifact.
 * Sources re-AuthZ at claim and again here (FINDING-01). No Contabo start.
 */
async function runClaimedStudioExportWorkerJob(
  job: RenderJobRecord,
): Promise<RealWorkerPipelineResult> {
  const jobId = job.id;
  const projectId = job.projectId;
  if (!projectId) {
    await failRunningJob(jobId, "INVALID", "STUDIO_EXPORT missing project_id.");
    throw new RenderJobDomainError(
      "STUDIO_EXPORT missing project_id.",
      "INVALID",
    );
  }
  if (job.requestedTier !== "WAV") {
    await failRunningJob(
      jobId,
      "TIER_UNSUPPORTED",
      `STUDIO_EXPORT MVP supports WAV only, got ${job.requestedTier}.`,
    );
    throw new RenderJobDomainError(
      `STUDIO_EXPORT MVP supports WAV only, got ${job.requestedTier}.`,
      "INVALID",
    );
  }

  try {
    const fresh = await resolveAuthorizedStudioExportSourcesForJob(jobId);
    const engineDocument = studioEngineDocumentFromProject(
      fresh.documentSnapshot.document,
    );

    let durationPlan;
    try {
      durationPlan = planStudioExportDuration(engineDocument);
    } catch (e) {
      if (e instanceof StudioOfflineRenderError) {
        const mapped = mapStudioOfflineRenderFail(e);
        await failRunningJob(jobId, mapped.code, mapped.message);
      }
      throw e;
    }

    const pcmByTake = new Map<string, DecodedPcmStereo>();
    const pcmByBeat = new Map<string, DecodedPcmStereo>();

    for (const [takeId, ref] of Object.entries(fresh.takes)) {
      const bytes = await downloadSourceBytes({
        bucket: ref.storageBucket,
        objectKey: ref.objectKey,
      });
      try {
        pcmByTake.set(
          takeId,
          await decodeRenderSourceToStereoPcm({
            bytes,
            contentType: ref.contentType,
            label: "take",
          }),
        );
      } catch (e) {
        const code = renderDecodeErrorCode(e);
        const message = e instanceof Error ? e.message : "SOURCE_DECODE";
        await failRunningJob(jobId, code, message);
        throw e;
      }
    }

    for (const [beatId, ref] of Object.entries(fresh.beats)) {
      const bytes = await downloadSourceBytes({
        bucket: ref.storageBucket,
        objectKey: ref.objectKey,
      });
      try {
        pcmByBeat.set(
          beatId,
          await decodeRenderSourceToStereoPcm({
            bytes,
            contentType: ref.contentType,
            label: "beat",
          }),
        );
      } catch (e) {
        const code = renderDecodeErrorCode(e);
        const message = e instanceof Error ? e.message : "SOURCE_DECODE";
        await failRunningJob(jobId, code, message);
        throw e;
      }
    }

    const resolvePcm: StudioOfflinePcmResolver = (key) => {
      if (key.kind === "TAKE") return pcmByTake.get(key.takeId) ?? null;
      return pcmByBeat.get(key.beatId) ?? null;
    };

    let offline;
    try {
      offline = await renderStudioDocumentOffline({
        document: engineDocument,
        resolvePcm,
        exportDurationMs: durationPlan.exportDurationMs,
      });
    } catch (e) {
      if (e instanceof StudioOfflineRenderError) {
        const mapped = mapStudioOfflineRenderFail(e);
        await failRunningJob(jobId, mapped.code, mapped.message);
      }
      throw e;
    }

    const bake = decodedPcmToBakeInput({
      interleaved: offline.interleaved,
      sampleRate: offline.sampleRate,
      channels: 2,
      frames: offline.frames,
    });

    let encoded;
    try {
      encoded = await encodeWavFromBake(bake);
    } catch (e) {
      const message = e instanceof Error ? e.message : "WAV_ENCODE_FAILED";
      await failRunningJob(jobId, "ENCODE_FAILED", message);
      throw e;
    }

    const objectKey = buildStudioExportArtifactObjectKey({
      ownerId: job.ownerId,
      projectId,
      jobId: job.id,
      tier: "WAV",
    });

    return completeRealArtifactAfterEncode({
      jobId: job.id,
      qualityTier: "WAV",
      objectKey,
      encodedBytes: encoded.bytes,
      contentType: "audio/wav",
      checksumSha256: encoded.checksumSha256,
      byteSize: encoded.byteSize,
      durationMs: encoded.durationMs,
      bitrateKbps: null,
      sampleRate: encoded.sampleRate,
      encoder: encoded.encoder,
      artifactMode: "STUDIO_EXPORT",
      projectId,
    });
  } catch (error) {
    await ensureFailedIfStillRunning(jobId, error);
    throw error;
  }
}

/**
 * P4.6 — take-only encode (no beat · no MIX bake).
 */
async function runClaimedTakeExportWorkerJob(
  job: RenderJobRecord,
): Promise<RealWorkerPipelineResult> {
  const jobId = job.id;
  const takeId = job.takeId;
  if (!takeId) {
    await failRunningJob(jobId, "INVALID", "TAKE_EXPORT missing take_id.");
    throw new RenderJobDomainError("TAKE_EXPORT missing take_id.", "INVALID");
  }
  const tier = job.requestedTier;
  if (
    tier !== "BASIC_MP3" &&
    tier !== "MP3_192" &&
    tier !== "HQ_MP3" &&
    tier !== "WAV"
  ) {
    await failRunningJob(
      jobId,
      "TIER_UNSUPPORTED",
      `Unsupported TAKE_EXPORT tier: ${tier}`,
    );
    throw new RenderJobDomainError(
      `Unsupported TAKE_EXPORT tier: ${tier}`,
      "INVALID",
    );
  }

  try {
    const fresh = await resolveAuthorizedTakeExportSourcesForJob(jobId);
    const takeBytes = await downloadSourceBytes({
      bucket: fresh.take.storageBucket,
      objectKey: fresh.take.objectKey,
    });

    let takePcm: DecodedPcmStereo;
    try {
      takePcm = await decodeRenderSourceToStereoPcm({
        bytes: takeBytes,
        contentType: fresh.take.contentType,
        label: "take",
      });
    } catch (e) {
      const code = renderDecodeErrorCode(e);
      const message = e instanceof Error ? e.message : "SOURCE_DECODE";
      await failRunningJob(jobId, code, message);
      throw e;
    }

    // Take-only: PCM → encode helpers. NEVER call bakeServerBasicV1 / bakeServerProV1.
    const bake = decodedPcmToBakeInput(takePcm);
    const objectKey = buildTakeExportArtifactObjectKey({
      ownerId: job.ownerId,
      takeId,
      jobId: job.id,
      tier,
    });

    if (tier === "BASIC_MP3") {
      const encoded = await encodeBasicMp3FromBake(bake);
      return completeRealArtifactAfterEncode({
        jobId: job.id,
        qualityTier: "BASIC_MP3",
        objectKey,
        encodedBytes: encoded.bytes,
        contentType: "audio/mpeg",
        checksumSha256: encoded.checksumSha256,
        byteSize: encoded.byteSize,
        durationMs: encoded.durationMs,
        bitrateKbps: encoded.bitrateKbps,
        sampleRate: encoded.sampleRate,
        encoder: encoded.encoder,
        artifactMode: "TAKE_EXPORT",
        takeId,
      });
    }
    if (tier === "MP3_192") {
      const encoded = await encodeMp3192FromBake(bake);
      return completeRealArtifactAfterEncode({
        jobId: job.id,
        qualityTier: "MP3_192",
        objectKey,
        encodedBytes: encoded.bytes,
        contentType: "audio/mpeg",
        checksumSha256: encoded.checksumSha256,
        byteSize: encoded.byteSize,
        durationMs: encoded.durationMs,
        bitrateKbps: encoded.bitrateKbps,
        sampleRate: encoded.sampleRate,
        encoder: encoded.encoder,
        artifactMode: "TAKE_EXPORT",
        takeId,
      });
    }
    if (tier === "HQ_MP3") {
      const encoded = await encodeHqMp3FromBake(bake);
      return completeRealArtifactAfterEncode({
        jobId: job.id,
        qualityTier: "HQ_MP3",
        objectKey,
        encodedBytes: encoded.bytes,
        contentType: "audio/mpeg",
        checksumSha256: encoded.checksumSha256,
        byteSize: encoded.byteSize,
        durationMs: encoded.durationMs,
        bitrateKbps: encoded.bitrateKbps,
        sampleRate: encoded.sampleRate,
        encoder: encoded.encoder,
        artifactMode: "TAKE_EXPORT",
        takeId,
      });
    }

    const encoded = await encodeWavFromBake(bake);
    return completeRealArtifactAfterEncode({
      jobId: job.id,
      qualityTier: "WAV",
      objectKey,
      encodedBytes: encoded.bytes,
      contentType: "audio/wav",
      checksumSha256: encoded.checksumSha256,
      byteSize: encoded.byteSize,
      durationMs: encoded.durationMs,
      bitrateKbps: null,
      sampleRate: encoded.sampleRate,
      encoder: encoded.encoder,
      artifactMode: "TAKE_EXPORT",
      takeId,
    });
  } catch (error) {
    await ensureFailedIfStillRunning(jobId, error);
    throw error;
  }
}

/** E3.6 Basic MP3 worker entry (claim + bake + encode). */
export async function runRealBasicMp3WorkerJob(
  jobId: string,
): Promise<RealWorkerPipelineResult> {
  const { job } = await claimRenderJobAsWorker(jobId);
  if (job.requestedTier !== "BASIC_MP3") {
    await failRunningJob(
      jobId,
      "TIER_UNSUPPORTED",
      "runRealBasicMp3WorkerJob supports BASIC_MP3 only.",
    );
    throw new RenderJobDomainError(
      "runRealBasicMp3WorkerJob supports BASIC_MP3 only.",
      "INVALID",
    );
  }
  return runClaimedBasicMp3WorkerJob(job);
}

async function runClaimedBasicMp3WorkerJob(
  job: RenderJobRecord,
): Promise<RealWorkerPipelineResult> {
  const jobId = job.id;
  try {
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
    if (!job.mixSessionId) {
      throw new RenderJobDomainError("MIX job missing mix_session_id.", "INVALID");
    }
    const encoded = await encodeBasicMp3FromBake(bake);
    const objectKey = buildAudioArtifactObjectKey({
      ownerId: job.ownerId,
      mixSessionId: job.mixSessionId,
      jobId: job.id,
      tier: "BASIC_MP3",
    });

    return completeRealArtifactAfterEncode({
      jobId: job.id,
      qualityTier: "BASIC_MP3",
      objectKey,
      encodedBytes: encoded.bytes,
      contentType: "audio/mpeg",
      checksumSha256: encoded.checksumSha256,
      byteSize: encoded.byteSize,
      durationMs: encoded.durationMs,
      bitrateKbps: encoded.bitrateKbps,
      sampleRate: encoded.sampleRate,
      encoder: encoded.encoder,
      artifactMode: "MIX",
    });
  } catch (error) {
    await ensureFailedIfStillRunning(jobId, error);
    throw error;
  }
}

/** E3.7 Premium: server-pro-v1 → HQ MP3 or WAV. */
async function runClaimedPremiumWorkerJob(
  job: RenderJobRecord,
): Promise<RealWorkerPipelineResult> {
  const jobId = job.id;
  const tier = job.requestedTier;
  if (tier !== "HQ_MP3" && tier !== "WAV") {
    throw new RenderJobDomainError("Not a Premium tier.", "INVALID");
  }
  if (!job.mixSessionId) {
    throw new RenderJobDomainError("MIX job missing mix_session_id.", "INVALID");
  }

  try {
    const fresh = await resolveAuthorizedRenderSourcesForJob(jobId);
    if (!fresh.entitlementSnapshot.parameters.pro) {
      await failRunningJob(
        jobId,
        "INVALID",
        "Premium render requires frozen parameters.pro.",
      );
      throw new RenderJobDomainError(
        "Premium render requires frozen parameters.pro.",
        "INVALID",
      );
    }

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

    const bake = bakeServerProV1({
      take: takePcm,
      beat: beatPcm,
      parameters: fresh.entitlementSnapshot.parameters,
    });

    const objectKey = buildAudioArtifactObjectKey({
      ownerId: job.ownerId,
      mixSessionId: job.mixSessionId,
      jobId: job.id,
      tier,
    });

    if (tier === "HQ_MP3") {
      const encoded = await encodeHqMp3FromBake(bake);
      return completeRealArtifactAfterEncode({
        jobId: job.id,
        qualityTier: "HQ_MP3",
        objectKey,
        encodedBytes: encoded.bytes,
        contentType: "audio/mpeg",
        checksumSha256: encoded.checksumSha256,
        byteSize: encoded.byteSize,
        durationMs: encoded.durationMs,
        bitrateKbps: encoded.bitrateKbps,
        sampleRate: encoded.sampleRate,
        encoder: encoded.encoder,
        artifactMode: "MIX",
      });
    }

    const encoded = await encodeWavFromBake(bake);
    return completeRealArtifactAfterEncode({
      jobId: job.id,
      qualityTier: "WAV",
      objectKey,
      encodedBytes: encoded.bytes,
      contentType: "audio/wav",
      checksumSha256: encoded.checksumSha256,
      byteSize: encoded.byteSize,
      durationMs: encoded.durationMs,
      bitrateKbps: null,
      sampleRate: encoded.sampleRate,
      encoder: encoded.encoder,
      artifactMode: "MIX",
    });
  } catch (error) {
    await ensureFailedIfStillRunning(jobId, error);
    throw error;
  }
}

/**
 * Upload QC'd bytes + insert READY + SUCCEEDED (FINDING-02/03).
 * MIX: mix_session_id + mix/ key.
 * TAKE_EXPORT: take_id + take-export/ key.
 * STUDIO_EXPORT: project_id + studio-export/ key (upsert for idempotent retry).
 */
export async function completeRealArtifactAfterEncode(params: {
  jobId: string;
  qualityTier: RenderJobTier;
  objectKey: string;
  encodedBytes: Buffer;
  contentType: string;
  checksumSha256: string;
  byteSize: number;
  durationMs: number;
  bitrateKbps: number | null;
  sampleRate: number;
  encoder: string;
  artifactMode?: "MIX" | "TAKE_EXPORT" | "STUDIO_EXPORT";
  takeId?: string | null;
  projectId?: string | null;
}): Promise<RealWorkerPipelineResult> {
  const mode = params.artifactMode ?? "MIX";
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("render_jobs")
    .select(
      "id, owner_id, mix_session_id, take_id, project_id, kind, requested_tier, status, entitlement_snapshot, timeout_at",
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

  const jobTier = row.requested_tier as RenderJobTier;
  if (jobTier !== params.qualityTier) {
    throw new RenderJobDomainError(
      "quality_tier mismatch vs job.requested_tier.",
      "INVALID",
    );
  }

  if (mode === "TAKE_EXPORT") {
    const takeId = params.takeId ?? (row.take_id as string | null);
    if (!takeId) {
      throw new RenderJobDomainError(
        "TAKE_EXPORT completion missing take_id.",
        "INVALID",
      );
    }
    if (
      !expectedTakeExportArtifactObjectKey({
        ownerId: row.owner_id as string,
        takeId,
        jobId: row.id as string,
        tier: params.qualityTier,
        objectKey: params.objectKey,
      })
    ) {
      throw new RenderJobDomainError(
        "Client/arbitrary object_key rejected.",
        "FORBIDDEN",
      );
    }
  } else if (mode === "STUDIO_EXPORT") {
    const projectId = params.projectId ?? (row.project_id as string | null);
    if (!projectId) {
      throw new RenderJobDomainError(
        "STUDIO_EXPORT completion missing project_id.",
        "INVALID",
      );
    }
    if ((row.kind as string | null) !== "STUDIO_EXPORT") {
      throw new RenderJobDomainError(
        "STUDIO_EXPORT completion requires kind=STUDIO_EXPORT.",
        "INVALID",
      );
    }
    if (
      !expectedStudioExportArtifactObjectKey({
        ownerId: row.owner_id as string,
        projectId,
        jobId: row.id as string,
        tier: params.qualityTier,
        objectKey: params.objectKey,
      })
    ) {
      throw new RenderJobDomainError(
        "Client/arbitrary object_key rejected.",
        "FORBIDDEN",
      );
    }
  } else {
    if (!row.mix_session_id) {
      throw new RenderJobDomainError(
        "MIX completion missing mix_session_id.",
        "INVALID",
      );
    }
    const expectedKey = buildAudioArtifactObjectKey({
      ownerId: row.owner_id as string,
      mixSessionId: row.mix_session_id as string,
      jobId: row.id as string,
      tier: params.qualityTier,
    });
    if (params.objectKey !== expectedKey) {
      throw new RenderJobDomainError(
        "Client/arbitrary object_key rejected.",
        "FORBIDDEN",
      );
    }
  }
  if (params.byteSize <= 0 || params.encodedBytes.byteLength !== params.byteSize) {
    throw new RenderJobDomainError("Invalid encoded byte size.", "INVALID");
  }

  const snapshot = parseRenderJobEntitlementSnapshot(row.entitlement_snapshot);
  const retentionSec =
    snapshot.entitlement.limits?.artifactRetentionSeconds ??
    retentionSecondsForTier(snapshot.entitlement.premiumTier ?? "FREE");
  const expiresAt = new Date(Date.now() + retentionSec * 1000).toISOString();
  const finishedAt = new Date().toISOString();

  // STUDIO_EXPORT: upsert so retry of the same jobId overwrites a partial orphan.
  const { error: uploadError } = await admin.storage
    .from(AUDIO_ARTIFACTS_BUCKET)
    .upload(params.objectKey, params.encodedBytes, {
      contentType: params.contentType,
      upsert: mode === "STUDIO_EXPORT",
    });
  if (uploadError) {
    await failRunningJob(params.jobId, "UPLOAD_FAILED", uploadError.message);
    throw new RenderJobDomainError(uploadError.message, "INVALID");
  }

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

  // Idempotent retry: if READY artifact already exists for this job, reuse it.
  const { data: existingArt } = await admin
    .from("audio_artifacts")
    .select("id, object_key, status")
    .eq("render_job_id", row.id)
    .maybeSingle();
  if (
    existingArt &&
    existingArt.status === "READY" &&
    existingArt.object_key === params.objectKey
  ) {
    const { data: repaired, error: repairError } = await admin
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
        "id, owner_id, mix_session_id, take_id, project_id, kind, requested_tier, idempotency_key, status, progress, attempt, entitlement_snapshot, error_code, error_message, queued_at, started_at, finished_at, timeout_at, worker_ref, created_at, updated_at",
      )
      .maybeSingle();
    if (repairError) throw new Error(repairError.message);
    if (!repaired) {
      throw new RenderJobDomainError(
        "Job left RUNNING during Studio artifact repair.",
        "CONFLICT",
      );
    }
    const jobRecord = await getJobRecord(params.jobId);
    return {
      job: jobRecord,
      artifactId: existingArt.id as string,
      objectKey: params.objectKey,
      byteSize: params.byteSize,
      checksumSha256: params.checksumSha256,
      bitrateKbps: params.bitrateKbps,
      durationMs: params.durationMs,
      encoder: params.encoder,
      qualityTier: params.qualityTier,
      contentType: params.contentType,
    };
  }

  const takeIdForInsert =
    mode === "TAKE_EXPORT"
      ? (params.takeId ?? (row.take_id as string))
      : null;
  const projectIdForInsert =
    mode === "STUDIO_EXPORT"
      ? (params.projectId ?? (row.project_id as string))
      : null;

  const { data: artifact, error: artError } = await admin
    .from("audio_artifacts")
    .insert({
      owner_id: row.owner_id,
      mix_session_id:
        mode === "TAKE_EXPORT" || mode === "STUDIO_EXPORT"
          ? null
          : row.mix_session_id,
      take_id: takeIdForInsert,
      project_id: projectIdForInsert,
      render_job_id: row.id,
      format: params.contentType,
      quality_tier: params.qualityTier,
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
      "id, owner_id, mix_session_id, take_id, project_id, kind, requested_tier, idempotency_key, status, progress, attempt, entitlement_snapshot, error_code, error_message, queued_at, started_at, finished_at, timeout_at, worker_ref, created_at, updated_at",
    )
    .maybeSingle();

  if (succError) throw new Error(succError.message);
  if (!succeeded) {
    // Do not delete READY artifact if another path already SUCCEEDED; only
    // compensate when we own a fresh insert and job left RUNNING without SUCCEEDED.
    await admin.from("audio_artifacts").delete().eq("id", artifact.id);
    await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([params.objectKey]);
    throw new RenderJobDomainError(
      "Job left RUNNING during complete (likely cancelled).",
      "CONFLICT",
    );
  }

  // MIX awards require mix_session_id — skip for TAKE_EXPORT / STUDIO_EXPORT.
  if (succeeded.mix_session_id) {
    const { hookRenderJobSucceeded } = await import(
      "@/lib/creator-progress/award-hooks"
    );
    await hookRenderJobSucceeded({
      ownerUserId: succeeded.owner_id as string,
      mixSessionId: succeeded.mix_session_id as string,
      renderJobId: succeeded.id as string,
    });
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
    qualityTier: params.qualityTier,
    contentType: params.contentType,
  };
}

/** @deprecated Prefer completeRealArtifactAfterEncode — kept for E3.6 call sites. */
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
}): Promise<RealWorkerPipelineResult> {
  return completeRealArtifactAfterEncode({
    ...params,
    qualityTier: "BASIC_MP3",
    contentType: "audio/mpeg",
  });
}

async function getJobRecord(jobId: string): Promise<RenderJobRecord> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("render_jobs")
    .select(
      "id, owner_id, mix_session_id, take_id, project_id, kind, requested_tier, idempotency_key, status, progress, attempt, entitlement_snapshot, error_code, error_message, queued_at, started_at, finished_at, timeout_at, worker_ref, created_at, updated_at",
    )
    .eq("id", jobId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "job missing");
  const snapshot = parseRenderJobEntitlementSnapshot(data.entitlement_snapshot);
  const kindRaw = data.kind as string | null;
  const kind: RenderJobRecord["kind"] =
    kindRaw === "TAKE_EXPORT"
      ? "TAKE_EXPORT"
      : kindRaw === "STUDIO_EXPORT"
        ? "STUDIO_EXPORT"
        : "MIX";
  return {
    id: data.id as string,
    ownerId: data.owner_id as string,
    mixSessionId: (data.mix_session_id as string | null) ?? null,
    kind,
    takeId: (data.take_id as string | null) ?? null,
    projectId: (data.project_id as string | null) ?? null,
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
