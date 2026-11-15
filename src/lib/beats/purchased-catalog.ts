import "server-only";

import { isUuid } from "@/lib/beats/audio-validation";
import { catalogLaneOf } from "@/lib/beats/catalog-lane";
import { BEAT_SELECT_PUBLIC, mapPublicBeatRow, type BeatRow } from "@/lib/beats/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PurchasedCatalogBeat = {
  id: string;
  title: string;
  producer: string | null;
  bpm: number;
};

/** Beats this user bought, newest purchase first. Unpublished or free-lane rows stay out. */
export async function listPurchasedCatalog(userId: string): Promise<PurchasedCatalogBeat[]> {
  const rows = await loadPurchasedRows(userId);
  return rows.map((beat) => ({
    id: beat.id,
    title: beat.title,
    producer: beat.producer,
    bpm: beat.bpm,
  }));
}

export async function listPurchasedBeatIds(userId: string): Promise<string[]> {
  const rows = await loadPurchasedRows(userId);
  return rows.map((beat) => beat.id);
}

async function loadPurchasedRows(userId: string) {
  if (!isUuid(userId)) return [];
  const admin = createSupabaseAdminClient();
  const purchases = await admin
    .from("beat_purchases")
    .select("beat_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (purchases.error || !purchases.data?.length) return [];
  const orderedIds = purchases.data
    .map((row) => (row as { beat_id?: string }).beat_id)
    .filter((id): id is string => typeof id === "string" && isUuid(id));
  if (orderedIds.length === 0) return [];
  const beats = await admin.from("beats").select(BEAT_SELECT_PUBLIC).in("id", orderedIds);
  if (beats.error || !beats.data) return [];
  const byId = new Map(
    (beats.data as BeatRow[])
      .map(mapPublicBeatRow)
      .filter(
        (beat) =>
          beat.status === "PUBLISHED" &&
          beat.ownershipType === "PLATFORM" &&
          catalogLaneOf(beat.catalogLane) === "paid",
      )
      .map((beat) => [beat.id, beat]),
  );
  return orderedIds.flatMap((id) => {
    const beat = byId.get(id);
    return beat ? [beat] : [];
  });
}
