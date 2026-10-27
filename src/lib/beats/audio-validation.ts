import type {
  BeatAudioAssetStatus,
  BeatAudioPurpose,
  BeatOwnershipType,
} from "@/types/domain";
import {
  BEAT_AUDIO_ASSET_STATUSES,
  BEAT_AUDIO_PURPOSES,
} from "@/types/domain";

export const BEAT_AUDIO_BUCKET = "beat-audio";
export const BEAT_AUDIO_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB interim
export const BEAT_AUDIO_PLAYBACK_TTL_SECONDS = 120;
export const BEAT_AUDIO_DOWNLOAD_TTL_SECONDS = 300;

/**
 * OD-SC-02 catalog original gates — independent of beat MASTER allowlist.
 * Bucket `beat-audio` stays 50 MiB + FLAC for masters. Catalog v1 is 20 MiB,
 * no FLAC, max 180 s. Do not reuse `validateAudioUploadMeta` for catalog.
 */
export const CATALOG_ORIGINAL_MAX_BYTES = 20 * 1024 * 1024;
export const CATALOG_ORIGINAL_MAX_SECONDS = 180;
export const CATALOG_ORIGINAL_MIME_ALLOWLIST = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
] as const;

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

/** Beat / asset ids are uuid columns; anything else can never match a row. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function assertUuidSegment(value: string, label: string): string | null {
  if (!UUID_RE.test(value)) {
    return `${label} must be a uuid`;
  }
  return null;
}

/**
 * Community Wave 1 prep — server-chosen USER object key (WRITE SSOT).
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
 * FAR-01 deterministic legacy MASTER twin (READ compatibility only).
 * FORBIDDEN for new Storage writes / dual-write / seeding (OD-KEY-04 / OD-KEY-06).
 * Built only from authorized DB/context identities — never from a client path.
 */
export function buildLegacyUserBeatMasterObjectKey(params: {
  ownerId: string;
  beatId: string;
  assetId: string;
}): string {
  return `user/${params.ownerId}/${params.beatId}/master/${params.assetId}.bin`;
}

/**
 * FAR-01 DR-A: whether `objectKey` is an authorized representation of this asset.
 *
 * Identities MUST come from authorized DB/context (owner, beat, asset) — never from
 * parsing `objectKey` to establish ownership. PATH ≠ AUTHORIZATION.
 *
 * Accepts only:
 * 1. canonical WRITE key for MASTER, or
 * 2. deterministic legacy MASTER twin for the same identities.
 */
export function isAuthorizedUserBeatObjectKeyRepresentation(params: {
  objectKey: string;
  ownerId: string;
  beatId: string;
  assetId: string;
}): boolean {
  if (!params.objectKey || typeof params.objectKey !== "string") {
    return false;
  }
  if (params.objectKey.includes("..") || params.objectKey.includes("//")) {
    return false;
  }
  if (!params.objectKey.startsWith("user/")) {
    return false;
  }

  const canonical = buildUserBeatAudioObjectKey({
    ownerId: params.ownerId,
    beatId: params.beatId,
    assetId: params.assetId,
    purpose: "MASTER",
  });
  if (params.objectKey === canonical) {
    return true;
  }

  const legacyTwin = buildLegacyUserBeatMasterObjectKey({
    ownerId: params.ownerId,
    beatId: params.beatId,
    assetId: params.assetId,
  });
  return params.objectKey === legacyTwin;
}

/** OD-SC-01 design direction: `catalog/{catalogAssetId}/original.bin`. */
export function buildCatalogOriginalObjectKey(catalogAssetId: string): string {
  return `catalog/${catalogAssetId.toLowerCase()}/original.bin`;
}

/**
 * Validate object key shape. Accepts platform/, user/, and catalog/ prefixes.
 * USER accepts canonical `.../{assetId}/{purpose}.bin` and FAR-01 legacy
 * `.../master/{assetId}.bin` as structural shapes only — NOT authorization.
 * Catalog accepts only `catalog/{catalogAssetId}/original.bin`.
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
    if (parts.length !== 5) {
      return "user object key must be user/{ownerId}/{beatId}/{assetId}/{purpose}.bin or legacy user/{ownerId}/{beatId}/master/{assetId}.bin";
    }
    const ownerErr = assertUuidSegment(parts[1]!, "ownerId");
    if (ownerErr) return ownerErr;
    const beatErr = assertUuidSegment(parts[2]!, "beatId");
    if (beatErr) return beatErr;

    // FAR-01 legacy MASTER shape (structural only): user/{owner}/{beat}/master/{asset}.bin
    if (parts[3] === "master") {
      const file = parts[4]!;
      if (!file.endsWith(".bin")) {
        return "legacy user object key must end with {assetId}.bin";
      }
      const assetId = file.slice(0, -".bin".length);
      const assetErr = assertUuidSegment(assetId, "assetId");
      if (assetErr) return assetErr;
      return null;
    }

    // Canonical: user / ownerId / beatId / assetId / purpose.bin
    const assetErr = assertUuidSegment(parts[3]!, "assetId");
    if (assetErr) return assetErr;
    return null;
  }
  if (objectKey.startsWith("catalog/")) {
    const parts = objectKey.split("/");
    if (parts.length !== 3 || parts[2] !== "original.bin") {
      return "catalog object key must be catalog/{catalogAssetId}/original.bin";
    }
    const idErr = assertUuidSegment(parts[1]!, "catalogAssetId");
    if (idErr) return idErr;
    return null;
  }
  return "object key must start with platform/, user/, or catalog/";
}

export type CatalogContentSniffError =
  | "CATALOG_CONTENT_BYTES_REQUIRED"
  | "CATALOG_CONTENT_EMPTY"
  | "CATALOG_CONTENT_TYPE_MISMATCH"
  | "CATALOG_CONTENT_UNSUPPORTED";

function asciiAt(bytes: Uint8Array, start: number, length: number): string {
  const end = Math.min(start + length, bytes.byteLength);
  let out = "";
  for (let i = start; i < end; i++) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

/**
 * Magic-byte container sniff (WAV / MPEG / MP4 / AAC / FLAC).
 * Canonical detector — reused by catalog OD-SC-02 and Storage backup verify.
 * Does not log or return raw payload bytes.
 */
export function sniffAudioContainer(bytes: Uint8Array): {
  mimeGuess: string;
  wavHeader: boolean;
  readable: boolean;
} {
  const readable = bytes.byteLength > 0;
  if (!readable) {
    return { mimeGuess: "application/octet-stream", wavHeader: false, readable };
  }

  const wavHeader =
    bytes.byteLength >= 12 &&
    asciiAt(bytes, 0, 4) === "RIFF" &&
    asciiAt(bytes, 8, 4) === "WAVE";
  if (wavHeader) {
    return { mimeGuess: "audio/wav", wavHeader: true, readable };
  }
  if (bytes.byteLength >= 8 && asciiAt(bytes, 4, 4) === "ftyp") {
    return { mimeGuess: "audio/mp4", wavHeader: false, readable };
  }
  if (bytes.byteLength >= 4 && asciiAt(bytes, 0, 4) === "fLaC") {
    return { mimeGuess: "audio/flac", wavHeader: false, readable };
  }
  if (bytes.byteLength >= 3 && asciiAt(bytes, 0, 3) === "ID3") {
    return { mimeGuess: "audio/mpeg", wavHeader: false, readable };
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0xff) {
    // AAC ADTS: 12-bit sync + layer bits 00.
    if ((bytes[1]! & 0xf6) === 0xf0) {
      return { mimeGuess: "audio/aac", wavHeader: false, readable };
    }
    if ((bytes[1]! & 0xe0) === 0xe0) {
      return { mimeGuess: "audio/mpeg", wavHeader: false, readable };
    }
  }
  return { mimeGuess: "application/octet-stream", wavHeader: false, readable };
}

function normalizeDeclaredCatalogContentType(contentType: string): string {
  return contentType.split(";")[0]!.trim().toLowerCase();
}

function catalogDeclaredMatchesSniff(
  declaredContentType: string,
  sniffedMime: string,
): boolean {
  const declared = normalizeDeclaredCatalogContentType(declaredContentType);
  if (sniffedMime === "audio/wav") {
    return declared === "audio/wav" || declared === "audio/x-wav";
  }
  return declared === sniffedMime;
}

/**
 * Fourth OD-SC-02 gate: real-file content vs declared MIME.
 * Client Content-Type is never treated as proof.
 */
export function validateCatalogOriginalContentSniff(params: {
  bytes?: Uint8Array | null;
  declaredContentType: string;
}):
  | { ok: true; sniffedContentType: string }
  | { ok: false; error: CatalogContentSniffError; details: string[] } {
  if (params.bytes == null) {
    return {
      ok: false,
      error: "CATALOG_CONTENT_BYTES_REQUIRED",
      details: ["original bytes are required for content sniff"],
    };
  }
  if (params.bytes.byteLength === 0) {
    return {
      ok: false,
      error: "CATALOG_CONTENT_EMPTY",
      details: ["original bytes are empty"],
    };
  }

  const sniff = sniffAudioContainer(params.bytes);
  if (
    !(CATALOG_ORIGINAL_MIME_ALLOWLIST as readonly string[]).includes(
      sniff.mimeGuess,
    )
  ) {
    return {
      ok: false,
      error: "CATALOG_CONTENT_UNSUPPORTED",
      details: ["sniffed container is not in catalog original allow-list"],
    };
  }
  if (!catalogDeclaredMatchesSniff(params.declaredContentType, sniff.mimeGuess)) {
    return {
      ok: false,
      error: "CATALOG_CONTENT_TYPE_MISMATCH",
      details: ["declared contentType does not match sniffed container"],
    };
  }
  return { ok: true, sniffedContentType: sniff.mimeGuess };
}

export function validateCatalogOriginalUploadMeta(params: {
  contentType: string;
  byteSize: number;
  durationSeconds: number;
}): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (
    !(CATALOG_ORIGINAL_MIME_ALLOWLIST as readonly string[]).includes(
      params.contentType,
    )
  ) {
    errors.push("contentType is not in catalog original allow-list");
  }
  if (
    typeof params.byteSize !== "number" ||
    !Number.isInteger(params.byteSize) ||
    params.byteSize <= 0
  ) {
    errors.push("byteSize must be a positive integer");
  } else if (params.byteSize > CATALOG_ORIGINAL_MAX_BYTES) {
    errors.push(`byteSize must be at most ${CATALOG_ORIGINAL_MAX_BYTES}`);
  }
  if (
    typeof params.durationSeconds !== "number" ||
    !Number.isInteger(params.durationSeconds) ||
    params.durationSeconds <= 0
  ) {
    errors.push("durationSeconds must be a positive integer");
  } else if (params.durationSeconds > CATALOG_ORIGINAL_MAX_SECONDS) {
    errors.push(
      `durationSeconds must be at most ${CATALOG_ORIGINAL_MAX_SECONDS}`,
    );
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

/**
 * Bind a user/ key to expected owner + beat + asset (IDOR defense).
 * FAR-01 DR-A: accepts canonical MASTER key or deterministic legacy twin only.
 * Shape validation is not sufficient — representation must match authorized identities.
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
  if (
    !isAuthorizedUserBeatObjectKeyRepresentation({
      objectKey: params.objectKey,
      ownerId: params.ownerId,
      beatId: params.beatId,
      assetId: params.assetId,
    })
  ) {
    return {
      ok: false,
      error: "object key does not match owner/beat/asset binding",
    };
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
 * P0 — user-facing original beat master DOWNLOAD.
 * PLATFORM masters are NEVER downloadable via product DOWNLOAD purpose
 * (including ADMIN using the user-facing Access Gate).
 * Privileged OPS export is a separate path — see requestPlatformBeatOpsExport.
 *
 * AccountLevel / Premium tier intentionally unused here.
 */
export function canDownloadOriginalBeatMaster(params: {
  actor: AudioAccessActor;
  beatStatus: string;
  ownershipType: BeatOwnershipType | string | null | undefined;
}): boolean {
  if (params.ownershipType === "PLATFORM") {
    return false;
  }
  if (params.ownershipType !== "USER") {
    // Fail closed when ownership is missing/unknown on DOWNLOAD.
    return false;
  }
  if (params.actor === "ADMIN") {
    return true;
  }
  if (params.actor === "MODERATOR") {
    return false;
  }
  return params.beatStatus === "PUBLISHED";
}

/**
 * Phase 1.5 Access Gate + P0 PLATFORM master DOWNLOAD deny.
 * PLAYBACK ignores ownership (PUBLISHED for all; staff non-published).
 * DOWNLOAD requires ownershipType and never allows PLATFORM masters.
 */
export function canRequestBeatAudioAccess(params: {
  actor: AudioAccessActor;
  beatStatus: string;
  purpose: AudioAccessPurpose;
  /** Required for DOWNLOAD — omit/unknown → DENY. Unused for PLAYBACK. */
  ownershipType?: BeatOwnershipType | string | null;
}): boolean {
  const { actor, beatStatus, purpose } = params;

  if (purpose === "PLAYBACK") {
    if (beatStatus === "PUBLISHED") {
      return true;
    }
    return actor === "ADMIN" || actor === "MODERATOR";
  }

  // DOWNLOAD — user-facing product path only (≠ OPS export, ≠ PLAYBACK).
  return canDownloadOriginalBeatMaster({
    actor,
    beatStatus,
    ownershipType: params.ownershipType,
  });
}

export function signedUrlTtlSeconds(purpose: AudioAccessPurpose): number {
  return purpose === "PLAYBACK"
    ? BEAT_AUDIO_PLAYBACK_TTL_SECONDS
    : BEAT_AUDIO_DOWNLOAD_TTL_SECONDS;
}
