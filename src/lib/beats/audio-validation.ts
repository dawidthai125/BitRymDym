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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuidSegment(value: string, label: string): string | null {
  if (!UUID_RE.test(value)) {
    return `${label} must be a uuid`;
  }
  return null;
}

/**
 * Community Wave 1 prep — server-chosen USER object key.
 * Client must never supply ownerId/beatId/assetId path segments.
 */
export function buildUserBeatAudioObjectKey(params: {
  ownerId: string;
  beatId: string;
  assetId: string;
  purpose: BeatAudioPurpose;
}): string {
  const purposeLower = params.purpose.toLowerCase();
  return `user/${params.ownerId}/${params.beatId}/${params.assetId}/${purposeLower}.bin`;
}

/**
 * Validate object key shape. Accepts platform/ and user/ prefixes.
 * Returns error message or null if ok.
 */
export function validateObjectKey(objectKey: string): string | null {
  if (!objectKey || typeof objectKey !== "string") {
    return "object key is required";
  }
  if (objectKey.includes("..") || objectKey.includes("//")) {
    return "object key must not contain path traversal";
  }
  if (!objectKey.endsWith(".bin")) {
    return "object key must end with .bin";
  }
  if (objectKey.startsWith("platform/")) {
    const parts = objectKey.split("/");
    // platform / beatId / assetId / purpose.bin
    if (parts.length !== 4) {
      return "platform object key must be platform/{beatId}/{assetId}/{purpose}.bin";
    }
    const beatErr = assertUuidSegment(parts[1]!, "beatId");
    if (beatErr) return beatErr;
    const assetErr = assertUuidSegment(parts[2]!, "assetId");
    if (assetErr) return assetErr;
    return null;
  }
  if (objectKey.startsWith("user/")) {
    const parts = objectKey.split("/");
    // user / ownerId / beatId / assetId / purpose.bin
    if (parts.length !== 5) {
      return "user object key must be user/{ownerId}/{beatId}/{assetId}/{purpose}.bin";
    }
    const ownerErr = assertUuidSegment(parts[1]!, "ownerId");
    if (ownerErr) return ownerErr;
    const beatErr = assertUuidSegment(parts[2]!, "beatId");
    if (beatErr) return beatErr;
    const assetErr = assertUuidSegment(parts[3]!, "assetId");
    if (assetErr) return assetErr;
    return null;
  }
  return "object key must start with platform/ or user/";
}

/**
 * Bind a user/ key to expected owner + beat + asset (IDOR defense for Wave 2).
 */
export function assertUserBeatObjectKeyBinding(params: {
  objectKey: string;
  ownerId: string;
  beatId: string;
  assetId: string;
}): { ok: true } | { ok: false; error: string } {
  const shape = validateObjectKey(params.objectKey);
  if (shape) {
    return { ok: false, error: shape };
  }
  if (!params.objectKey.startsWith("user/")) {
    return { ok: false, error: "expected user/ object key prefix" };
  }
  const expected = buildUserBeatAudioObjectKey({
    ownerId: params.ownerId,
    beatId: params.beatId,
    assetId: params.assetId,
    purpose: "MASTER",
  });
  // Allow any purpose suffix matching purpose.bin — rebuild for MASTER only above;
  // compare path prefix through assetId.
  const prefix = `user/${params.ownerId}/${params.beatId}/${params.assetId}/`;
  if (!params.objectKey.startsWith(prefix)) {
    return { ok: false, error: "object key does not match owner/beat/asset binding" };
  }
  if (params.objectKey !== expected && !params.objectKey.startsWith(prefix)) {
    return { ok: false, error: "object key binding mismatch" };
  }
  return { ok: true };
}

/**
 * Resolve interim MIME from File.type or filename extension.
 * Client hint only — server still validates against allow-list.
 */
export function resolveAudioContentType(params: {
  fileType?: string | null;
  filename?: string | null;
}): string | null {
  const typed = (params.fileType ?? "").trim().toLowerCase();
  if (
    (BEAT_AUDIO_INTERIM_MIME_ALLOWLIST as readonly string[]).includes(typed)
  ) {
    return typed;
  }

  const name = (params.filename ?? "").trim().toLowerCase();
  const ext = name.includes(".") ? name.replace(/^.*\./, "") : "";
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    default:
      return typed || null;
  }
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
