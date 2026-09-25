import type {
  BeatAudioAssetStatus,
  BeatAudioPurpose,
} from "@/types/domain";
import {
  BEAT_AUDIO_ASSET_STATUSES,
  BEAT_AUDIO_PURPOSES,
} from "@/types/domain";

export const BEAT_AUDIO_BUCKET = "beat-audio";
export const BEAT_AUDIO_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB interim
export const BEAT_AUDIO_PLAYBACK_TTL_SECONDS = 120;
export const BEAT_AUDIO_DOWNLOAD_TTL_SECONDS = 300;

/** OD-12 OPEN — interim MIME allow-list only (not final codec SSOT). */
export const BEAT_AUDIO_INTERIM_MIME_ALLOWLIST = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/mp4",
  "audio/aac",
] as const;

export type AudioAccessPurpose = "PLAYBACK" | "DOWNLOAD";

export function isBeatAudioPurpose(value: unknown): value is BeatAudioPurpose {
  return (
    typeof value === "string" &&
    (BEAT_AUDIO_PURPOSES as readonly string[]).includes(value)
  );
}

export function isBeatAudioAssetStatus(
  value: unknown,
): value is BeatAudioAssetStatus {
  return (
    typeof value === "string" &&
    (BEAT_AUDIO_ASSET_STATUSES as readonly string[]).includes(value)
  );
}

export function isAudioAccessPurpose(
  value: unknown,
): value is AudioAccessPurpose {
  return value === "PLAYBACK" || value === "DOWNLOAD";
}

export function buildBeatAudioObjectKey(params: {
  beatId: string;
  assetId: string;
  purpose: BeatAudioPurpose;
}): string {
  const purposeLower = params.purpose.toLowerCase();
  return `platform/${params.beatId}/${params.assetId}/${purposeLower}.bin`;
}

export function validateObjectKey(objectKey: string): string | null {
  if (!objectKey.endsWith(".bin")) {
    return "object key must end with .bin";
  }
  if (!objectKey.startsWith("platform/")) {
    return "object key must start with platform/";
  }
  return null;
}

export function validateAudioUploadMeta(params: {
  contentType: string;
  byteSize: number;
}): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (
    !(BEAT_AUDIO_INTERIM_MIME_ALLOWLIST as readonly string[]).includes(
      params.contentType,
    )
  ) {
    errors.push(`contentType is not in interim allow-list`);
  }
  if (
    typeof params.byteSize !== "number" ||
    !Number.isInteger(params.byteSize) ||
    params.byteSize <= 0
  ) {
    errors.push("byteSize must be a positive integer");
  } else if (params.byteSize > BEAT_AUDIO_MAX_BYTES) {
    errors.push(`byteSize must be at most ${BEAT_AUDIO_MAX_BYTES}`);
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

export type AudioAccessActor = "ANON" | "USER" | "MODERATOR" | "ADMIN";

/**
 * Phase 1.5 frozen Access Gate business rules.
 * AccountLevel is intentionally unused.
 */
export function canRequestBeatAudioAccess(params: {
  actor: AudioAccessActor;
  beatStatus: string;
  purpose: AudioAccessPurpose;
}): boolean {
  const { actor, beatStatus, purpose } = params;

  if (purpose === "PLAYBACK") {
    if (beatStatus === "PUBLISHED") {
      return true;
    }
    return actor === "ADMIN" || actor === "MODERATOR";
  }

  // DOWNLOAD
  if (actor === "ADMIN") {
    return true;
  }
  // FROZEN: MODERATOR download DENY (including PUBLISHED).
  if (actor === "MODERATOR") {
    return false;
  }
  return beatStatus === "PUBLISHED";
}

export function signedUrlTtlSeconds(purpose: AudioAccessPurpose): number {
  return purpose === "PLAYBACK"
    ? BEAT_AUDIO_PLAYBACK_TTL_SECONDS
    : BEAT_AUDIO_DOWNLOAD_TTL_SECONDS;
}
