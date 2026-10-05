/**
 * Domain enums from Master SSOT / OD-03.
 * Role ≠ Account Level — never conflate these.
 */

export const SYSTEM_ROLES = ["ADMIN", "MODERATOR", "USER"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Account levels — OD-09 OPEN for final labels; OD-19 CLOSED: signup default BEGINNER_RAPPER. */
export const ACCOUNT_LEVELS = [
  "BEGINNER_RAPPER",
  "PRO_RAPPER",
  "LEGEND_RAPPER",
] as const;
export type AccountLevel = (typeof ACCOUNT_LEVELS)[number];

export const BEAT_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "REJECTED",
  "ARCHIVED",
] as const;
export type BeatStatus = (typeof BEAT_STATUSES)[number];

export const BEAT_OWNERSHIP_TYPES = ["PLATFORM", "USER"] as const;
export type BeatOwnershipType = (typeof BEAT_OWNERSHIP_TYPES)[number];

export const BEAT_AUDIO_PURPOSES = ["MASTER", "PLAYBACK", "DOWNLOAD"] as const;
export type BeatAudioPurpose = (typeof BEAT_AUDIO_PURPOSES)[number];

export const BEAT_AUDIO_ASSET_STATUSES = [
  "PENDING_UPLOAD",
  "READY",
  "FAILED",
  "ARCHIVED",
  "REPLACED",
] as const;
export type BeatAudioAssetStatus = (typeof BEAT_AUDIO_ASSET_STATUSES)[number];

/** Phase 1.4 beat domain metadata (no audio asset fields). */
export type Beat = {
  id: string;
  ownerId: string | null;
  ownershipType: BeatOwnershipType;
  title: string;
  producer: string | null;
  description: string | null;
  genre: string | null;
  style: string | null;
  bpm: number;
  key: string | null;
  scale: string | null;
  durationSeconds: number;
  tags: string[];
  coverRef: string | null;
  status: BeatStatus;
  /** Own / staff only — never expose on public catalog APIs. */
  rejectionReason: string | null;
  /** Wave 5: server-managed submit cooldown cursor (null after REJECTED→DRAFT). */
  lastSubmittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Recording Wave 1 — take lifecycle (MIC TAKE, not beat asset). */
export const TAKE_STATUSES = [
  "PENDING_UPLOAD",
  "READY",
  "FAILED",
  "EXPIRED",
  "DELETED",
] as const;
export type TakeStatus = (typeof TAKE_STATUSES)[number];

export const TAKE_RECORDING_MODES = ["QUICK", "FULL"] as const;
export type TakeRecordingMode = (typeof TAKE_RECORDING_MODES)[number];

/** Recording Wave 1 take row (bytes in private take-audio Storage). */
export type Take = {
  id: string;
  ownerId: string | null;
  anonymousTokenHash: string | null;
  beatId: string;
  status: TakeStatus;
  recordingMode: TakeRecordingMode;
  durationSeconds: number | null;
  byteSize: number | null;
  contentType: string | null;
  storageBucket: string;
  objectKey: string;
  beatDurationSecondsSnapshot: number;
  recordingMaxSecondsSnapshot: number;
  beatBpmSnapshot: number | null;
  audioOffsetMs: number;
  expiresAt: string;
  deletedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Phase 1.5 audio asset metadata (bytes live in private Storage). */
export type BeatAudioAsset = {
  id: string;
  beatId: string;
  purpose: BeatAudioPurpose;
  status: BeatAudioAssetStatus;
  storageBucket: string;
  objectKey: string;
  contentType: string | null;
  byteSize: number | null;
  checksumSha256: string | null;
  originalFilename: string | null;
  isActive: boolean;
  replacedByAssetId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** E3.1 — Mix session lifecycle (params only; no product Mix UI yet). */
export const MIX_SESSION_STATUSES = [
  "DRAFT",
  "READY_TO_RENDER",
  "SOURCE_UNAVAILABLE",
] as const;
export type MixSessionStatus = (typeof MIX_SESSION_STATUSES)[number];

/** E3.1 — Render job lifecycle (IP-03 timeout from RUNNING). */
export const RENDER_JOB_STATUSES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMEOUT",
] as const;
export type RenderJobStatus = (typeof RENDER_JOB_STATUSES)[number];

/** Mix + take-export quality tiers. MIX create path rejects MP3_192 (P4). */
export const RENDER_JOB_TIERS = [
  "BASIC_MP3",
  "MP3_192",
  "HQ_MP3",
  "WAV",
] as const;
export type RenderJobTier = (typeof RENDER_JOB_TIERS)[number];

/** E3 mix create/claim quality set — excludes P4 take-only MP3_192. */
export const MIX_RENDER_JOB_TIERS = ["BASIC_MP3", "HQ_MP3", "WAV"] as const;
export type MixRenderJobTier = (typeof MIX_RENDER_JOB_TIERS)[number];

export const RENDER_JOB_KINDS = ["MIX", "TAKE_EXPORT"] as const;
export type RenderJobKind = (typeof RENDER_JOB_KINDS)[number];

export const AUDIO_ARTIFACT_STATUSES = [
  "READY",
  "FAILED",
  "EXPIRED",
  "DELETED",
] as const;
export type AudioArtifactStatus = (typeof AUDIO_ARTIFACT_STATUSES)[number];
