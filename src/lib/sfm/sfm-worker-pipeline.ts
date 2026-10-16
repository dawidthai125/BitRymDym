/**
 * SFM executor bake pipeline — separate from Contabo STUDIO_EXPORT poller
 * and from runRealRenderWorkerJob (MIX/TAKE/STUDIO).
 *
 * Claim via claim_next_sfm_job (service_role) → this module for RUNNING jobs.
 * No auto FAILED→QUEUED. Job SUCCEEDED ≠ stage complete (completeSfmStageForService).
 */

import "server-only";

import type { BakePcmInput } from "@/lib/audio/mp3-encode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { completeSfmStageForService } from "@/lib/sfm/sfm-foundation-service";
import { stageKindForSfmExecutor } from "@/lib/sfm/sfm-executor-kinds";
import { finalizeSfmQualityArtifactAfterEncode } from "@/lib/sfm/sfm-artifact-service";
import {
  encodeSfmQualityFromBake,
  type SfmEncodedArtifact,
} from "@/lib/sfm/sfm-quality-encode";
import {
  assertSfmMixPrepareSourcesAvailable,
  bakeSfmMasterPcmFromSnapshot,
} from "@/lib/sfm/sfm-worker-bake";
import {
  qcSfmMasterBakePcm,
  requireSfmExecutorJobKind,
  requireSfmQualityFromJob,
  validateSfmMixPrepareSnapshot,
  type SfmAlreadyClaimedWorkerJob,
  type SfmMixPrepareValidation,
} from "@/lib/sfm/sfm-worker-core";
import { SfmDomainError } from "@/lib/sfm/sfm-domain";
import type { SfmExecutorJobKind } from "@/types/domain";
import type { SfmQuality } from "@/lib/sfm/sfm-plan-matrix";

export type { SfmAlreadyClaimedWorkerJob };

export type SfmWorkerPipelineResult =
  | {
      outcome: "mix_prepare_ok";
      jobId: string;
      kind: "SFM_MIX_PREPARE";
      sourceTakeCount: number;
      sourceBeatCount: number;
    }
  | {
      outcome: "master_bake_ok";
      jobId: string;
      kind: "SFM_MASTER_BAKE";
      frames: number;
      durationMs: number;
    }
  | {
      outcome: "quality_encode_ok";
      jobId: string;
      kind: "SFM_QUALITY_ENCODE";
      quality: SfmQuality;
      artifactId: string;
      promoted: boolean;
    };

export type SfmWorkerPipelineDeps = {
  loadVersionContentSnapshot: (params: {
    versionId: string;
    ownerId: string;
    projectId: string;
  }) => Promise<unknown>;
  /** Assert TAKE/BEAT sources still readable for owner (MIX_PREPARE). */
  assertSourcesAvailable?: (validation: SfmMixPrepareValidation) => Promise<void>;
  /**
   * Offline master PCM from frozen snapshot.
   * QUALITY_ENCODE re-bakes from the same snapshot (no intermediate Storage SSOT yet).
   */
  bakeMasterPcmFromSnapshot: (
    validation: SfmMixPrepareValidation,
  ) => Promise<BakePcmInput>;
  markJobSucceeded: (jobId: string) => Promise<void>;
  markJobFailed: (
    jobId: string,
    code: string,
    message: string,
  ) => Promise<void>;
  completeDomainStageAfterJob: (params: {
    versionId: string;
    jobKind: SfmExecutorJobKind;
    status: "SUCCEEDED" | "FAILED";
    jobId: string;
    errorCode?: string | null;
  }) => Promise<void>;
  encodeQuality?: (
    quality: SfmQuality,
    bake: BakePcmInput,
  ) => Promise<SfmEncodedArtifact>;
  finalizeQualityArtifact?: (params: {
    jobId: string;
    encoded: SfmEncodedArtifact;
  }) => Promise<{ artifactId: string; promoted: boolean }>;
};

async function defaultMarkSucceeded(jobId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("render_jobs")
    .update({
      status: "SUCCEEDED",
      finished_at: new Date().toISOString(),
      progress: 100,
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId)
    .eq("status", "RUNNING")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new RenderJobDomainError(
      "SFM job left RUNNING before SUCCEEDED mark.",
      "CONFLICT",
    );
  }
}

async function defaultMarkFailed(
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

async function defaultLoadVersionContentSnapshot(params: {
  versionId: string;
  ownerId: string;
  projectId: string;
}): Promise<unknown> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_final_versions")
    .select("id, owner_id, project_id, content_snapshot, status")
    .eq("id", params.versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new SfmDomainError("SFM version not found.", "NOT_FOUND");
  }
  if (data.owner_id !== params.ownerId) {
    throw new SfmDomainError("SFM version owner mismatch.", "NOT_OWNER");
  }
  if (data.project_id !== params.projectId) {
    throw new SfmDomainError("SFM version project mismatch.", "NOT_ELIGIBLE");
  }
  return data.content_snapshot;
}

async function defaultCompleteStage(params: {
  versionId: string;
  jobKind: SfmExecutorJobKind;
  status: "SUCCEEDED" | "FAILED";
  jobId: string;
  errorCode?: string | null;
}): Promise<void> {
  const stageKind = stageKindForSfmExecutor(params.jobKind);
  if (stageKind == null) return; // QUALITY_ENCODE has no domain stage
  await completeSfmStageForService({
    versionId: params.versionId,
    kind: stageKind,
    status: params.status,
    jobId: params.jobId,
    errorCode: params.errorCode ?? null,
  });
}

function defaultDeps(): SfmWorkerPipelineDeps {
  return {
    loadVersionContentSnapshot: defaultLoadVersionContentSnapshot,
    assertSourcesAvailable: assertSfmMixPrepareSourcesAvailable,
    bakeMasterPcmFromSnapshot: bakeSfmMasterPcmFromSnapshot,
    markJobSucceeded: defaultMarkSucceeded,
    markJobFailed: defaultMarkFailed,
    completeDomainStageAfterJob: defaultCompleteStage,
    encodeQuality: encodeSfmQualityFromBake,
    finalizeQualityArtifact: async ({ jobId, encoded }) => {
      const result = await finalizeSfmQualityArtifactAfterEncode({
        jobId,
        encoded,
      });
      return { artifactId: result.artifactId, promoted: result.promoted };
    },
  };
}

function mapFailCode(error: unknown): { code: string; message: string } {
  if (error instanceof SfmDomainError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof RenderJobDomainError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "ENCODE_FAILED",
    message: error instanceof Error ? error.message : "SFM worker failed.",
  };
}

/**
 * Run an already-RUNNING SFM executor job (after claim_next_sfm_job).
 * MUST NOT be called from STUDIO_EXPORT poller.
 */
export async function runAlreadyClaimedSfmWorkerJob(
  job: SfmAlreadyClaimedWorkerJob,
  deps: Partial<SfmWorkerPipelineDeps> = {},
): Promise<SfmWorkerPipelineResult> {
  const d: SfmWorkerPipelineDeps = { ...defaultDeps(), ...deps };

  if (job.status !== "RUNNING") {
    throw new RenderJobDomainError(
      `SFM worker expects RUNNING, got ${job.status}.`,
      "CONFLICT",
    );
  }

  let kind: SfmExecutorJobKind;
  try {
    kind = requireSfmExecutorJobKind(job.kind);
  } catch (error) {
    const mapped = mapFailCode(error);
    await d.markJobFailed(job.id, mapped.code, mapped.message);
    throw error;
  }

  const versionId = job.sfmVersionId ?? null;
  const projectId = job.projectId ?? null;
  if (!versionId || !projectId) {
    await d.markJobFailed(
      job.id,
      "INVALID",
      "SFM job missing sfm_version_id or project_id.",
    );
    throw new RenderJobDomainError(
      "SFM job missing sfm_version_id or project_id.",
      "INVALID",
    );
  }

  /**
   * Once the job row is terminal SUCCEEDED, catch must NOT markFailed and must
   * NOT complete the domain stage as FAILED (DEFECT-1: job SUCCEEDED + stage FAILED).
   * Leave stage RUNNING; recovery is a later sfm_complete_stage(SUCCEEDED) (RPC).
   */
  let jobMarkedSucceeded = false;

  try {
    const rawSnapshot = await d.loadVersionContentSnapshot({
      versionId,
      ownerId: job.ownerId,
      projectId,
    });
    const validation = validateSfmMixPrepareSnapshot(rawSnapshot, {
      ownerId: job.ownerId,
      projectId,
    });

    if (kind === "SFM_MIX_PREPARE") {
      if (d.assertSourcesAvailable) {
        await d.assertSourcesAvailable(validation);
      }
      await d.markJobSucceeded(job.id);
      jobMarkedSucceeded = true;
      await d.completeDomainStageAfterJob({
        versionId,
        jobKind: kind,
        status: "SUCCEEDED",
        jobId: job.id,
      });
      return {
        outcome: "mix_prepare_ok",
        jobId: job.id,
        kind: "SFM_MIX_PREPARE",
        sourceTakeCount: validation.sourceRefs.takeIds.length,
        sourceBeatCount: validation.sourceRefs.beatIds.length,
      };
    }

    if (kind === "SFM_MASTER_BAKE") {
      const bake = await d.bakeMasterPcmFromSnapshot(validation);
      qcSfmMasterBakePcm(bake);
      await d.markJobSucceeded(job.id);
      jobMarkedSucceeded = true;
      await d.completeDomainStageAfterJob({
        versionId,
        jobKind: kind,
        status: "SUCCEEDED",
        jobId: job.id,
      });
      return {
        outcome: "master_bake_ok",
        jobId: job.id,
        kind: "SFM_MASTER_BAKE",
        frames: bake.frames,
        durationMs: bake.durationMs,
      };
    }

    // SFM_QUALITY_ENCODE — re-bake from immutable snapshot + encode + promote.
    const quality = requireSfmQualityFromJob(job.sfmQuality ?? null);
    const bake = await d.bakeMasterPcmFromSnapshot(validation);
    qcSfmMasterBakePcm(bake);
    const encode = d.encodeQuality ?? encodeSfmQualityFromBake;
    const encoded = await encode(quality, bake);
    const finalize =
      d.finalizeQualityArtifact ??
      (async (params: { jobId: string; encoded: SfmEncodedArtifact }) => {
        const result = await finalizeSfmQualityArtifactAfterEncode(params);
        return { artifactId: result.artifactId, promoted: result.promoted };
      });
    // finalizeSfmQualityArtifactAfterEncode marks job SUCCEEDED itself.
    const fin = await finalize({ jobId: job.id, encoded });
    // Treat successful finalize return as terminal job success for catch safety.
    jobMarkedSucceeded = true;
    return {
      outcome: "quality_encode_ok",
      jobId: job.id,
      kind: "SFM_QUALITY_ENCODE",
      quality,
      artifactId: fin.artifactId,
      promoted: fin.promoted,
    };
  } catch (error) {
    if (jobMarkedSucceeded) {
      // Do not demote SUCCEEDED job / do not FAIL the stage. Re-throw as failure
      // of this invocation (caller must not treat as full success).
      throw error;
    }
    const mapped = mapFailCode(error);
    await d.markJobFailed(job.id, mapped.code, mapped.message);
    try {
      if (kind === "SFM_MIX_PREPARE" || kind === "SFM_MASTER_BAKE") {
        await d.completeDomainStageAfterJob({
          versionId,
          jobKind: kind,
          status: "FAILED",
          jobId: job.id,
          errorCode: mapped.code,
        });
      }
    } catch {
      // Stage complete failure must not hide original bake error.
    }
    throw error;
  }
}

/**
 * Entry used by a future SFM-only worker host (not Contabo STUDIO poller).
 * Claims via claimNextSfmExecutorJobForWorker then bakes.
 */
export { claimNextSfmExecutorJobForWorker } from "@/lib/sfm/sfm-executor-service";
