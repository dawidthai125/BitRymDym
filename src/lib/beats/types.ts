import type { Beat, BeatOwnershipType, BeatStatus } from "@/types/domain";

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
  created_at: string;
  updated_at: string;
};

/** Public catalog / detail — never select or map rejection_reason. */
export const BEAT_SELECT_PUBLIC =
  "id, owner_id, ownership_type, title, producer, description, genre, style, bpm, key, scale, duration_seconds, tags, cover_ref, status, created_at, updated_at";

/** Owner / staff — includes rejection_reason. */
export const BEAT_SELECT_FULL = `${BEAT_SELECT_PUBLIC}, rejection_reason`;

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPublicBeatRow(row: BeatRow): Beat {
  return mapBeatRow(row, { includeRejectionReason: false });
}

export function toBeatInsertPayload(value: {
  ownershipType: BeatOwnershipType;
  ownerId: string | null;
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
  rejectionReason?: string | null;
}) {
  return {
    ownership_type: value.ownershipType,
    owner_id: value.ownerId,
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
    status: value.status,
    ...(value.rejectionReason !== undefined
      ? { rejection_reason: value.rejectionReason }
      : {}),
  };
}
