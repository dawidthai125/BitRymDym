/**
 * SFM worker bake — pure validation / QC (no DB · no Storage · no Contabo).
 * Domain stages SFM_MIX/SFM_MASTER ≠ executor kinds (OD-SFM-ID-07).
 */

import { AUDIO_CODEC } from "@/config/audio-render";
import type { BakePcmInput } from "@/lib/audio/mp3-encode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  assertStudioDocumentWithinExportLimits,
  collectStudioExportSourceRefs,
  digestStudioDocument,
  type StudioExportSourceRefs,
} from "@/lib/audio/studio-export-document-snapshot";
import {
  isSfmExecutorKind,
} from "@/lib/sfm/sfm-executor-kinds";
import { SfmDomainError } from "@/lib/sfm/sfm-domain";
import {
  SFM_ACCEPT_SNAPSHOT_KIND,
  type SfmAcceptContentSnapshotV1,
} from "@/lib/sfm/sfm-version-snapshot";
import { isSfmQuality, type SfmQuality } from "@/lib/sfm/sfm-plan-matrix";
import type { SfmExecutorJobKind } from "@/types/domain";
import { mapJobKind } from "@/lib/audio/render-job-core";

/**
 * Fields required by `runAlreadyClaimedSfmWorkerJob` after `claim_next_sfm_job`.
 * Single SSOT for poller core + pipeline (no server-only import).
 * Shape aligns with RenderJobRecord fields used by the SFM bake pipeline.
 */
export type SfmAlreadyClaimedWorkerJob = {
  id: string;
  kind: string;
  status: string;
  ownerId: string;
  projectId?: string | null;
  sfmVersionId?: string | null;
  sfmQuality?: string | null;
};

/**
 * Explicit field pick — prevents accidental {id,kind,status}-only strip at wiring.
 * Runtime-complete for TypeScript assignability into the pipeline.
 */
export function toSfmAlreadyClaimedWorkerJob(
  job: SfmAlreadyClaimedWorkerJob,
): SfmAlreadyClaimedWorkerJob {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    ownerId: job.ownerId,
    projectId: job.projectId ?? null,
    sfmVersionId: job.sfmVersionId ?? null,
    sfmQuality: job.sfmQuality ?? null,
  };
}

/** Fail-closed: only the three OD-SFM-ID-07 executor kinds. */
export function requireSfmExecutorJobKind(
  kind: string | null | undefined,
): SfmExecutorJobKind {
  // mapJobKind rejects unknown; also rejects MIX/TAKE/STUDIO falling into bake.
  const mapped = mapJobKind(kind);
  if (!isSfmExecutorKind(mapped)) {
    throw new RenderJobDomainError(
      `SFM worker rejects non-SFM kind: ${String(kind ?? "null")}`,
      "INVALID",
    );
  }
  return mapped;
}

export function parseSfmAcceptContentSnapshot(
  raw: unknown,
): SfmAcceptContentSnapshotV1 {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SfmDomainError("SFM version content_snapshot missing.", "INVALID");
  }
  const row = raw as Record<string, unknown>;
  if (row.snapshotKind !== SFM_ACCEPT_SNAPSHOT_KIND) {
    throw new SfmDomainError(
      "SFM content_snapshot.snapshotKind must be SFM_ACCEPT.",
      "INVALID",
    );
  }
  if (typeof row.ownerId !== "string" || row.ownerId.length < 8) {
    throw new SfmDomainError("SFM snapshot ownerId invalid.", "INVALID");
  }
  if (typeof row.projectId !== "string" || row.projectId.length < 8) {
    throw new SfmDomainError("SFM snapshot projectId invalid.", "INVALID");
  }
  if (
    typeof row.documentVersion !== "number" ||
    !Number.isInteger(row.documentVersion) ||
    row.documentVersion < 1
  ) {
    throw new SfmDomainError("SFM snapshot documentVersion invalid.", "INVALID");
  }
  if (typeof row.documentDigest !== "string" || row.documentDigest.length < 16) {
    throw new SfmDomainError("SFM snapshot documentDigest invalid.", "INVALID");
  }
  if (row.document == null || typeof row.document !== "object") {
    throw new SfmDomainError("SFM snapshot document missing.", "INVALID");
  }

  return raw as SfmAcceptContentSnapshotV1;
}

export type SfmMixPrepareValidation = {
  snapshot: SfmAcceptContentSnapshotV1;
  sourceRefs: StudioExportSourceRefs;
  documentDigest: string;
};

/**
 * SFM_MIX_PREPARE — validate frozen Accept snapshot (immutable document).
 * Does not mutate Storage; does not encode product qualities.
 */
export function validateSfmMixPrepareSnapshot(
  rawSnapshot: unknown,
  expected: {
    ownerId: string;
    projectId: string;
  },
): SfmMixPrepareValidation {
  const snapshot = parseSfmAcceptContentSnapshot(rawSnapshot);

  if (snapshot.ownerId !== expected.ownerId) {
    throw new SfmDomainError("SFM snapshot owner mismatch vs job.", "NOT_OWNER");
  }
  if (snapshot.projectId !== expected.projectId) {
    throw new SfmDomainError(
      "SFM snapshot project mismatch vs job.",
      "NOT_ELIGIBLE",
    );
  }
  if (snapshot.document.project.id !== expected.projectId) {
    throw new SfmDomainError(
      "SFM snapshot document.project.id mismatch.",
      "INVALID",
    );
  }

  try {
    assertStudioDocumentWithinExportLimits(snapshot.document);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Studio document.";
    throw new SfmDomainError(message, "INVALID");
  }

  let sourceRefs: StudioExportSourceRefs;
  try {
    sourceRefs = collectStudioExportSourceRefs(snapshot.document);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Studio sources.";
    if (/at least one TAKE or BEAT_REF/i.test(message)) {
      throw new SfmDomainError(
        "Session has no TAKE or BEAT_REF sources for finalization.",
        "INVALID_SESSION",
      );
    }
    throw new SfmDomainError(message, "INVALID");
  }

  const documentDigest = digestStudioDocument(snapshot.document);
  if (documentDigest !== snapshot.documentDigest) {
    throw new SfmDomainError(
      "SFM snapshot documentDigest mismatch (tamper/corruption).",
      "CONFLICT",
    );
  }

  return { snapshot, sourceRefs, documentDigest };
}

/** Master bake PCM must match product WAV target geometry before encode. */
export function qcSfmMasterBakePcm(bake: BakePcmInput): void {
  if (bake.channels !== 2) {
    throw new RenderJobDomainError(
      `SFM master bake channels must be 2, got ${bake.channels}.`,
      "INVALID",
    );
  }
  if (bake.sampleRate !== AUDIO_CODEC.WAV_SAMPLE_RATE) {
    throw new RenderJobDomainError(
      `SFM master bake sampleRate must be ${AUDIO_CODEC.WAV_SAMPLE_RATE}, got ${bake.sampleRate}.`,
      "INVALID",
    );
  }
  if (bake.frames < 1 || bake.interleaved.length < 2) {
    throw new RenderJobDomainError("SFM master bake PCM empty.", "INVALID");
  }
  if (bake.interleaved.length !== bake.frames * 2) {
    throw new RenderJobDomainError(
      "SFM master bake interleaved length mismatch.",
      "INVALID",
    );
  }
  for (let i = 0; i < Math.min(bake.interleaved.length, 64); i++) {
    const s = bake.interleaved[i];
    if (!Number.isFinite(s)) {
      throw new RenderJobDomainError(
        "SFM master bake PCM contains non-finite samples.",
        "INVALID",
      );
    }
  }
}

export function requireSfmQualityFromJob(
  raw: string | null | undefined,
): SfmQuality {
  if (!isSfmQuality(raw)) {
    throw new RenderJobDomainError(
      "SFM_QUALITY_ENCODE requires valid sfm_quality.",
      "INVALID",
    );
  }
  return raw;
}

/** Terminal SFM jobs must not auto-retry to QUEUED (contract lock). */
export function sfmWorkerAllowsAutoRequeue(): false {
  return false;
}
