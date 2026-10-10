import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AUDIO_ARTIFACT_TIERS = [
  "BASIC_MP3",
  "MP3_192",
  "HQ_MP3",
  "WAV",
] as const;
export type AudioArtifactTier = (typeof AUDIO_ARTIFACT_TIERS)[number];

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} must be a uuid`);
  }
}

function extensionForTier(tier: AudioArtifactTier): "mp3" | "wav" {
  if (tier === "WAV") return "wav";
  return "mp3";
}

/**
 * Server-chosen durable mix artifact object key (OAD-07).
 * Client must never supply owner / session / job path segments.
 * MIX never uses MP3_192 (P4 take-export only).
 */
export function buildAudioArtifactObjectKey(params: {
  ownerId: string;
  mixSessionId: string;
  jobId: string;
  tier: AudioArtifactTier;
}): string {
  assertUuid(params.ownerId, "ownerId");
  assertUuid(params.mixSessionId, "mixSessionId");
  assertUuid(params.jobId, "jobId");
  if (params.tier === "MP3_192") {
    throw new Error("MP3_192 is take-export only");
  }
  if (
    params.tier !== "BASIC_MP3" &&
    params.tier !== "HQ_MP3" &&
    params.tier !== "WAV"
  ) {
    throw new Error("Invalid artifact tier");
  }
  const ext = extensionForTier(params.tier);
  return `user/${params.ownerId}/mix/${params.mixSessionId}/jobs/${params.jobId}/${params.tier}.${ext}`;
}

/**
 * P4.6 — take-export artifact key (audio-artifacts bucket, not take-audio).
 * user/{ownerId}/take-export/{takeId}/jobs/{jobId}/{TIER}.{ext}
 */
export function buildTakeExportArtifactObjectKey(params: {
  ownerId: string;
  takeId: string;
  jobId: string;
  tier: AudioArtifactTier;
}): string {
  assertUuid(params.ownerId, "ownerId");
  assertUuid(params.takeId, "takeId");
  assertUuid(params.jobId, "jobId");
  if (!(AUDIO_ARTIFACT_TIERS as readonly string[]).includes(params.tier)) {
    throw new Error("Invalid artifact tier");
  }
  const ext = extensionForTier(params.tier);
  return `user/${params.ownerId}/take-export/${params.takeId}/jobs/${params.jobId}/${params.tier}.${ext}`;
}

export function expectedAudioArtifactObjectKey(params: {
  ownerId: string;
  mixSessionId: string;
  jobId: string;
  tier: AudioArtifactTier;
  objectKey: string;
}): boolean {
  try {
    return params.objectKey === buildAudioArtifactObjectKey(params);
  } catch {
    return false;
  }
}

export function expectedTakeExportArtifactObjectKey(params: {
  ownerId: string;
  takeId: string;
  jobId: string;
  tier: AudioArtifactTier;
  objectKey: string;
}): boolean {
  try {
    return params.objectKey === buildTakeExportArtifactObjectKey(params);
  } catch {
    return false;
  }
}

/**
 * OD-SFM-F02 — Studio Final Mix export artifact key (audio-artifacts bucket).
 * user/{ownerId}/studio-export/{projectId}/jobs/{jobId}/WAV.wav
 * MVP tier is WAV only; server builds path from verified UUIDs.
 */
export function buildStudioExportArtifactObjectKey(params: {
  ownerId: string;
  projectId: string;
  jobId: string;
  tier?: AudioArtifactTier;
}): string {
  assertUuid(params.ownerId, "ownerId");
  assertUuid(params.projectId, "projectId");
  assertUuid(params.jobId, "jobId");
  const tier = params.tier ?? "WAV";
  if (tier !== "WAV") {
    throw new Error("STUDIO_EXPORT MVP supports WAV tier only");
  }
  return `user/${params.ownerId}/studio-export/${params.projectId}/jobs/${params.jobId}/WAV.wav`;
}

export function expectedStudioExportArtifactObjectKey(params: {
  ownerId: string;
  projectId: string;
  jobId: string;
  tier?: AudioArtifactTier;
  objectKey: string;
}): boolean {
  try {
    return params.objectKey === buildStudioExportArtifactObjectKey(params);
  } catch {
    return false;
  }
}

export function isAudioArtifactsBucket(bucket: string): boolean {
  return bucket === AUDIO_ARTIFACTS_BUCKET;
}
