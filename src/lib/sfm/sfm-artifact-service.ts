/**
 * SFM Stage D — finalize READY artifact (is_current=false) then promote.
 * Contabo / STUDIO poller must not call this. Download cutover OUT (OD-SFM-ID-06).
 */

import "server-only";

import { createHash } from "node:crypto";

import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";
import {
  canCompleteRenderJobSuccess,
  RenderJobDomainError,
} from "@/lib/audio/render-job-core";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RenderJobStatus, RenderJobTier } from "@/types/domain";
import {
  buildSfmQualityArtifactObjectKey,
  expectedSfmQualityArtifactObjectKey,
} from "@/lib/sfm/sfm-artifact-object-key";
import {
  mapSfmRpcErrorMessage,
  SfmDomainError,
} from "@/lib/sfm/sfm-domain";
import { isSfmQuality, type SfmQuality } from "@/lib/sfm/sfm-plan-matrix";
import {
  qcSfmQualityBytes,
  renderJobTierForSfmQuality,
  type SfmEncodedArtifact,
} from "@/lib/sfm/sfm-quality-encode";
import { resolveSfmArtifactExpiresAtIso } from "@/lib/sfm/sfm-retention";
import { uploadSetsIsCurrent } from "@/lib/sfm/sfm-promote-guards";

export type SfmFinalizeArtifactResult = {
  artifactId: string;
  objectKey: string;
  isCurrent: boolean;
  promoted: boolean;
  jobId: string;
  quality: SfmQuality;
  expiresAt: string;
};

function throwMapped(error: { message: string }): never {
  const code = mapSfmRpcErrorMessage(error.message);
  throw new SfmDomainError(error.message, code);
}

/**
 * After successful encode+QC: upload, insert READY with is_current=false,
 * mark job SUCCEEDED, then atomic promote. Failures before promote never set current.
 */
export async function finalizeSfmQualityArtifactAfterEncode(params: {
  jobId: string;
  encoded: SfmEncodedArtifact;
}): Promise<SfmFinalizeArtifactResult> {
  // Never trust qcPassed alone — re-QC the exact bytes about to be stored.
  if (
    params.encoded.byteSize <= 0 ||
    params.encoded.bytes.byteLength !== params.encoded.byteSize
  ) {
    throw new RenderJobDomainError("Invalid encoded byte size.", "INVALID");
  }
  await qcSfmQualityBytes(params.encoded.quality, params.encoded.bytes);
  const checksumSha256 = `sha256:${createHash("sha256")
    .update(params.encoded.bytes)
    .digest("hex")}`;
  if (params.encoded.checksumSha256 !== checksumSha256) {
    throw new SfmDomainError(
      "SFM checksum mismatch vs encoded bytes.",
      "QC_FAILED",
    );
  }
  // Contract anchor — upload path must not set is_current.
  if (uploadSetsIsCurrent() !== false) {
    throw new SfmDomainError("is_current contract broken.", "INVALID");
  }

  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("render_jobs")
    .select(
      "id, owner_id, project_id, kind, requested_tier, status, sfm_version_id, sfm_quality",
    )
    .eq("id", params.jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) {
    throw new RenderJobDomainError("Render job not found.", "NOT_FOUND");
  }

  if (!canCompleteRenderJobSuccess(row.status as RenderJobStatus)) {
    throw new RenderJobDomainError(
      `Cannot complete job in status ${row.status}.`,
      "CONFLICT",
    );
  }
  if ((row.kind as string) !== "SFM_QUALITY_ENCODE") {
    throw new RenderJobDomainError(
      "SFM finalize requires kind=SFM_QUALITY_ENCODE.",
      "INVALID",
    );
  }

  const versionId = row.sfm_version_id as string | null;
  const qualityRaw = row.sfm_quality as string | null;
  const projectId = row.project_id as string | null;
  if (!versionId || !projectId || !isSfmQuality(qualityRaw)) {
    throw new RenderJobDomainError(
      "SFM job missing version/project/quality bind.",
      "INVALID",
    );
  }
  if (qualityRaw !== params.encoded.quality) {
    throw new RenderJobDomainError(
      "Encoded quality mismatch vs job.sfm_quality.",
      "INVALID",
    );
  }

  const expectedTier = renderJobTierForSfmQuality(qualityRaw);
  if ((row.requested_tier as RenderJobTier) !== expectedTier) {
    throw new RenderJobDomainError(
      "quality_tier mismatch vs job.requested_tier.",
      "INVALID",
    );
  }

  const objectKey = buildSfmQualityArtifactObjectKey({
    ownerId: row.owner_id as string,
    projectId,
    versionId,
    quality: qualityRaw,
    jobId: row.id as string,
  });
  if (
    !expectedSfmQualityArtifactObjectKey({
      ownerId: row.owner_id as string,
      projectId,
      versionId,
      quality: qualityRaw,
      jobId: row.id as string,
      objectKey,
    })
  ) {
    throw new RenderJobDomainError(
      "Client/arbitrary object_key rejected.",
      "FORBIDDEN",
    );
  }

  const { data: version, error: verError } = await admin
    .from("studio_final_versions")
    .select("id, owner_id, project_id, status, expires_at")
    .eq("id", versionId)
    .maybeSingle();
  if (verError) throw new Error(verError.message);
  if (!version) {
    throw new SfmDomainError("SFM version not found.", "NOT_FOUND");
  }
  if (version.owner_id !== row.owner_id || version.project_id !== projectId) {
    throw new SfmDomainError("Version bind mismatch.", "CONFLICT");
  }
  if (version.status !== "EXPORTS_ELIGIBLE") {
    throw new SfmDomainError("Version not exports-eligible.", "NOT_ELIGIBLE");
  }

  const expiresAt = resolveSfmArtifactExpiresAtIso({
    versionExpiresAt: version.expires_at as string | null,
  });

  const { error: uploadError } = await admin.storage
    .from(AUDIO_ARTIFACTS_BUCKET)
    .upload(objectKey, params.encoded.bytes, {
      contentType: params.encoded.contentType,
      upsert: true, // same jobId retry only (path includes jobId); F-02 recovery
    });
  if (uploadError) {
    throw new RenderJobDomainError(uploadError.message, "INVALID");
  }

  const { data: fresh, error: freshError } = await admin
    .from("render_jobs")
    .select("status")
    .eq("id", params.jobId)
    .maybeSingle();
  if (freshError) throw new Error(freshError.message);
  if (!fresh || fresh.status !== "RUNNING") {
    await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([objectKey]);
    throw new RenderJobDomainError(
      `Cannot complete job in status ${fresh?.status ?? "missing"}.`,
      "CONFLICT",
    );
  }

  const finishedAt = new Date().toISOString();

  // Idempotent: existing READY for this job
  const { data: existingArt } = await admin
    .from("audio_artifacts")
    .select("id, object_key, status, is_current")
    .eq("render_job_id", row.id)
    .maybeSingle();

  let artifactId: string;
  if (
    existingArt &&
    existingArt.status === "READY" &&
    existingArt.object_key === objectKey
  ) {
    artifactId = existingArt.id as string;
    await admin
      .from("render_jobs")
      .update({
        status: "SUCCEEDED",
        finished_at: finishedAt,
        progress: 100,
        error_code: null,
        error_message: null,
      })
      .eq("id", params.jobId)
      .eq("status", "RUNNING");
  } else {
    const { data: artifact, error: artError } = await admin
      .from("audio_artifacts")
      .insert({
        owner_id: row.owner_id,
        mix_session_id: null,
        take_id: null,
        project_id: projectId,
        sfm_version_id: versionId,
        sfm_quality: qualityRaw,
        is_current: false,
        render_job_id: row.id,
        format: params.encoded.contentType,
        quality_tier: expectedTier,
        storage_bucket: AUDIO_ARTIFACTS_BUCKET,
        object_key: objectKey,
        byte_size: params.encoded.byteSize,
        duration_ms: params.encoded.durationMs,
        checksum: checksumSha256,
        sample_rate: params.encoded.sampleRate,
        bitrate_kbps: params.encoded.bitrateKbps,
        status: "READY",
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (artError || !artifact) {
      await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([objectKey]);
      throw new RenderJobDomainError(
        artError?.message ?? "Failed to insert SFM audio_artifacts.",
        "INVALID",
      );
    }
    artifactId = artifact.id as string;

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
      .select("id")
      .maybeSingle();
    if (succError) throw new Error(succError.message);
    if (!succeeded) {
      await admin.from("audio_artifacts").delete().eq("id", artifactId);
      await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([objectKey]);
      throw new RenderJobDomainError(
        "Job left RUNNING during SFM complete.",
        "CONFLICT",
      );
    }
  }

  const { data: promoteData, error: promoteError } = await admin.rpc(
    "sfm_promote_current_artifact",
    { p_artifact_id: artifactId },
  );

  if (promoteError) {
    // Race loser: artifact remains READY non-current history — not a silent overwrite.
    const code = mapSfmRpcErrorMessage(promoteError.message);
    if (code === "CONFLICT") {
      return {
        artifactId,
        objectKey,
        isCurrent: false,
        promoted: false,
        jobId: params.jobId,
        quality: qualityRaw,
        expiresAt,
      };
    }
    throwMapped(promoteError);
  }

  const promoteRow = Array.isArray(promoteData) ? promoteData[0] : promoteData;
  const isCurrent = Boolean(
    promoteRow &&
      typeof promoteRow === "object" &&
      (promoteRow as { is_current?: boolean }).is_current,
  );

  return {
    artifactId,
    objectKey,
    isCurrent,
    promoted: isCurrent,
    jobId: params.jobId,
    quality: qualityRaw,
    expiresAt,
  };
}

/** Service-role promote entry (worker). */
export async function promoteSfmCurrentArtifactForWorker(
  artifactId: string,
): Promise<{ artifactId: string; isCurrent: boolean }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("sfm_promote_current_artifact", {
    p_artifact_id: artifactId,
  });
  if (error) throwMapped(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new SfmDomainError("Promote RPC returned no row.", "CONFLICT");
  }
  return {
    artifactId: String((row as { artifact_id: string }).artifact_id),
    isCurrent: Boolean((row as { is_current: boolean }).is_current),
  };
}
