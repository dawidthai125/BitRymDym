import type {
  Beat,
  BeatCoverStatus,
  BeatOwnershipType,
  BeatStatus,
  BeatVisibility,
} from "@/types/domain";

export type BeatRow = {
  id: string;
  owner_id: string | null;
  ownership_type: BeatOwnershipType;
  title: string;
  producer: string | null;
  description: string | null;
  genre: string | null;
  style: string | null;
  bpm: number;
  key: string | null;
  scale: string | null;
  duration_seconds: number;
  tags: string[] | null;
  cover_ref: string | null;
  status: BeatStatus;
  rejection_reason?: string | null;
  last_submitted_at?: string | null;
  created_at: string;
  updated_at: string;
  visibility?: BeatVisibility | null;
  allow_download?: boolean | null;
  allow_studio_use?: boolean | null;
  cover_status?: BeatCoverStatus | null;
  cover_updated_at?: string | null;
  cover_rejection_reason?: string | null;
  key_detected?: string | null;
  key_confidence?: number | null;
};

/** Public catalog / detail — never select rejection_reason or last_submitted_at. */
export const BEAT_SELECT_PUBLIC =
  "id, owner_id, ownership_type, title, producer, description, genre, style, bpm, key, scale, duration_seconds, tags, cover_ref, status, created_at, updated_at, visibility, allow_download, allow_studio_use, cover_status, cover_updated_at";

/** Owner / staff — includes rejection_reason + submit cooldown cursor. */
export const BEAT_SELECT_FULL = `${BEAT_SELECT_PUBLIC}, rejection_reason, last_submitted_at, cover_rejection_reason, key_detected, key_confidence`;

/** @deprecated Prefer BEAT_SELECT_PUBLIC or BEAT_SELECT_FULL. */
export const BEAT_SELECT = BEAT_SELECT_FULL;

export function mapBeatRow(
  row: BeatRow,
  options?: { includeRejectionReason?: boolean },
): Beat {
  const include = options?.includeRejectionReason ?? true;
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownershipType: row.ownership_type,
    title: row.title,
    producer: row.producer,
    description: row.description,
    genre: row.genre,
    style: row.style,
    bpm: row.bpm,
    key: row.key,
    scale: row.scale,
    durationSeconds: row.duration_seconds,
    tags: row.tags ?? [],
    coverRef: row.cover_ref,
    status: row.status,
    rejectionReason: include ? (row.rejection_reason ?? null) : null,
    lastSubmittedAt: include ? (row.last_submitted_at ?? null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    visibility: row.visibility === "private" ? "private" : "public",
    allowDownload: row.allow_download !== false,
    allowStudioUse: row.allow_studio_use !== false,
    coverStatus: row.cover_status ?? "none",
    coverUpdatedAt: row.cover_updated_at ?? null,
    coverRejectionReason: include ? (row.cover_rejection_reason ?? null) : null,
    keyDetected: include ? (row.key_detected ?? null) : null,
    keyConfidence: include ? (row.key_confidence ?? null) : null,
  };
}

export function mapPublicBeatRow(row: BeatRow): Beat {
  return mapBeatRow(row, { includeRejectionReason: false });
}

type BeatMetadataValue = {
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
};

/** Metadata columns only — never ownership, status or rejection_reason. */
export function toBeatMetadataPayload(value: BeatMetadataValue) {
  return {
    title: value.title,
    producer: value.producer,
    description: value.description,
    genre: value.genre,
    style: value.style,
    bpm: value.bpm,
    key: value.key,
    scale: value.scale,
    duration_seconds: value.durationSeconds,
    tags: value.tags,
    cover_ref: value.coverRef,
  };
}

export function toBeatInsertPayload(
  value: BeatMetadataValue & {
    ownershipType: BeatOwnershipType;
    ownerId: string | null;
    status: BeatStatus;
    rejectionReason?: string | null;
  },
) {
  return {
    ownership_type: value.ownershipType,
    owner_id: value.ownerId,
    ...toBeatMetadataPayload(value),
    status: value.status,
    ...(value.rejectionReason !== undefined
      ? { rejection_reason: value.rejectionReason }
      : {}),
  };
}
