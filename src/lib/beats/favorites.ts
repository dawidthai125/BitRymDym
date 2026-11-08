import "server-only";

import { AuthError, requireUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/beats/audio-validation";
import { withPublicAuthors } from "@/lib/beats/public-author";
import {
  BEAT_SELECT_PUBLIC,
  mapPublicBeatRow,
  type BeatRow,
} from "@/lib/beats/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function listFavoriteBeatIds(userId: string): Promise<string[]> {
  if (!isUuid(userId)) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beat_favorites")
    .select("beat_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String((row as { beat_id: string }).beat_id));
}

/** Returns true when the beat is saved after the call. */
export async function toggleBeatFavorite(beatId: string): Promise<boolean> {
  const context = await requireUser();
  if (!isUuid(beatId)) throw new AuthError("NOT_FOUND", "No such beat.");
  const supabase = await createSupabaseServerClient();
  const beat = await supabase
    .from("beats")
    .select("id")
    .eq("id", beatId)
    .eq("status", "PUBLISHED")
    .eq("visibility", "public")
    .maybeSingle();
  if (beat.error) throw new Error(beat.error.message);
  if (!beat.data) throw new AuthError("NOT_FOUND", "No such beat.");

  const existing = await supabase
    .from("beat_favorites")
    .select("beat_id")
    .eq("user_id", context.userId)
    .eq("beat_id", beatId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    const removed = await supabase
      .from("beat_favorites")
      .delete()
      .eq("user_id", context.userId)
      .eq("beat_id", beatId);
    if (removed.error) throw new Error(removed.error.message);
    return false;
  }
  const inserted = await supabase
    .from("beat_favorites")
    .insert({ user_id: context.userId, beat_id: beatId });
  if (inserted.error) throw new Error(inserted.error.message);
  return true;
}

export type FavoriteBeatCard = {
  id: string;
  title: string;
  producer: string;
  bpm: number;
};

export async function listFavoriteBeats(userId: string): Promise<FavoriteBeatCard[]> {
  const ids = await listFavoriteBeatIds(userId);
  if (ids.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_SELECT_PUBLIC)
    .in("id", ids)
    .eq("status", "PUBLISHED");
  if (error) throw new Error(error.message);
  const beats = await withPublicAuthors(((data as BeatRow[] | null) ?? []).map(mapPublicBeatRow));
  const order = new Map(ids.map((id, index) => [id, index]));
  return beats
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((beat) => ({
      id: beat.id,
      title: beat.title,
      producer: beat.producer ?? "",
      bpm: beat.bpm,
    }));
}
