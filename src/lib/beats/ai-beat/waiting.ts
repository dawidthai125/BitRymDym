import "server-only";

import { GENERATED_BEAT_TAG } from "@/lib/beats/catalog-lane";
import { requireAdminPlatformBeatsAccess } from "@/lib/beats/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BeatCoverStatus } from "@/types/domain";

export type WaitingGeneratedBeat = {
  id: string;
  title: string;
  producer: string;
  description: string | null;
  style: string | null;
  bpm: number;
  durationSeconds: number;
  coverStatus: BeatCoverStatus;
  coverUpdatedAt: string | null;
};

const COVER_STATUSES: readonly BeatCoverStatus[] = [
  "none",
  "pending",
  "approved",
  "rejected",
];

function coverStatusOf(value: unknown): BeatCoverStatus {
  return COVER_STATUSES.includes(value as BeatCoverStatus)
    ? (value as BeatCoverStatus)
    : "none";
}

function producerOf(value: unknown): string {
  if (typeof value !== "string") return "BitRymDym";
  const name = value.replace(/\s+/g, " ").trim();
  return name.length > 0 ? name : "BitRymDym";
}

/**
 * Platform drafts from the generator, newest first.
 * catalog_lane is not selected: the lane is chosen at release.
 */
export async function listWaitingGeneratedBeats(): Promise<WaitingGeneratedBeat[]> {
  await requireAdminPlatformBeatsAccess();
  const { data, error } = await createSupabaseAdminClient()
    .from("beats")
    .select(
      "id, title, producer, description, style, bpm, duration_seconds, cover_status, cover_updated_at",
    )
    .eq("ownership_type", "PLATFORM")
    .eq("status", "DRAFT")
    .contains("tags", [GENERATED_BEAT_TAG])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    producer: string | null;
    description: string | null;
    style: string | null;
    bpm: number;
    duration_seconds: number;
    cover_status: string | null;
    cover_updated_at: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    producer: producerOf(row.producer),
    description: row.description,
    style: row.style,
    bpm: row.bpm,
    durationSeconds: row.duration_seconds,
    coverStatus: coverStatusOf(row.cover_status),
    coverUpdatedAt: row.cover_updated_at ?? null,
  }));
}
