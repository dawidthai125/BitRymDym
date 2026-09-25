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
  created_at: string;
  updated_at: string;
};

export function mapBeatRow(row: BeatRow): Beat {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  };
}
