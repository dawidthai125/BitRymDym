/**
 * SFM Stage D — F02b artifact object keys (audio-artifacts bucket).
 * Legacy F02 STUDIO_EXPORT WAV remains in artifact-object-key.ts.
 */

import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";
import {
  isSfmQuality,
  SFM_QUALITY_TECH,
  type SfmQuality,
} from "@/lib/sfm/sfm-plan-matrix";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} must be a uuid`);
  }
}

export function extensionForSfmQuality(quality: SfmQuality): "mp3" | "wav" {
  return SFM_QUALITY_TECH[quality].container === "wav" ? "wav" : "mp3";
}

/**
 * F02b — multi-quality Final Mix key.
 * user/{ownerId}/studio-export/{projectId}/versions/{versionId}/qualities/{QUALITY}/{jobId}.{ext}
 */
export function buildSfmQualityArtifactObjectKey(params: {
  ownerId: string;
  projectId: string;
  versionId: string;
  quality: SfmQuality | unknown;
  jobId: string;
}): string {
  assertUuid(params.ownerId, "ownerId");
  assertUuid(params.projectId, "projectId");
  assertUuid(params.versionId, "versionId");
  assertUuid(params.jobId, "jobId");
  if (!isSfmQuality(params.quality)) {
    throw new Error(`Invalid SFM quality token: ${String(params.quality)}`);
  }
  const ext = extensionForSfmQuality(params.quality);
  return (
    `user/${params.ownerId}/studio-export/${params.projectId}` +
    `/versions/${params.versionId}/qualities/${params.quality}/${params.jobId}.${ext}`
  );
}

export function expectedSfmQualityArtifactObjectKey(params: {
  ownerId: string;
  projectId: string;
  versionId: string;
  quality: SfmQuality | unknown;
  jobId: string;
  objectKey: string;
}): boolean {
  try {
    return params.objectKey === buildSfmQualityArtifactObjectKey(params);
  } catch {
    return false;
  }
}

/** Legacy F02 STUDIO_EXPORT WAV (read-compatible; no rename). */
export function isLegacyStudioExportWavObjectKey(objectKey: string): boolean {
  return /^user\/[0-9a-f-]{36}\/studio-export\/[0-9a-f-]{36}\/jobs\/[0-9a-f-]{36}\/WAV\.wav$/i.test(
    objectKey,
  );
}

export function isSfmF02bObjectKey(objectKey: string): boolean {
  return /^user\/[0-9a-f-]{36}\/studio-export\/[0-9a-f-]{36}\/versions\/[0-9a-f-]{36}\/qualities\/(MP3_128|MP3_192|MP3_320|WAV)\/[0-9a-f-]{36}\.(mp3|wav)$/i.test(
    objectKey,
  );
}

export function sfmArtifactsBucket(): string {
  return AUDIO_ARTIFACTS_BUCKET;
}
