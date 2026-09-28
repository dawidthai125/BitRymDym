import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AUDIO_ARTIFACT_TIERS = ["BASIC_MP3", "HQ_MP3", "WAV"] as const;
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
  if (
    !(AUDIO_ARTIFACT_TIERS as readonly string[]).includes(params.tier)
  ) {
    throw new Error("Invalid artifact tier");
  }
  const ext = extensionForTier(params.tier);
  return `user/${params.ownerId}/mix/${params.mixSessionId}/jobs/${params.jobId}/${params.tier}.${ext}`;
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

export function isAudioArtifactsBucket(bucket: string): boolean {
  return bucket === AUDIO_ARTIFACTS_BUCKET;
}
