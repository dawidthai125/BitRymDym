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