import "server-only";

/**
 * Full-file playback guard (Owner 2026-11-12, option "make copying harder").
 * Studio, the recording page and the Windows program need the full Bit to monitor and mix, so it cannot be closed
 * technically. What we can do: a short link (120 s, see signedUrlTtlSeconds), a per-user/hour request limit, a cap on
 * how many different Bits one account pulls per hour (a catalogue scraper), and a log of who got which full file.
 * Short catalogue/guest previews are not counted.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const PLAYBACK_MAX_PER_HOUR = 60;
export const PLAYBACK_MAX_DISTINCT_BEATS_PER_HOUR = 12;
const HOUR_MS = 3_600_000;

export type PlaybackLogRow = { beat_id: string; created_at: string };

/** Pure: may this user fetch the full file of `beatId` now? Re-fetching a Bit already in use is cheap; new Bits are capped. */
export function decidePlaybackGuard(rows: readonly PlaybackLogRow[], beatId: string, now = Date.now()): { allowed: boolean; reason?: "per_hour" | "distinct_beats" } {
  const recent = rows.filter((r) => now - new Date(r.created_at).getTime() < HOUR_MS);
  if (recent.length >= PLAYBACK_MAX_PER_HOUR) return { allowed: false, reason: "per_hour" };
  const beats = new Set(recent.map((r) => r.beat_id));
  if (!beats.has(beatId) && beats.size >= PLAYBACK_MAX_DISTINCT_BEATS_PER_HOUR) return { allowed: false, reason: "distinct_beats" };
  return { allowed: true };
}

/** Fail open on infrastructure errors (the log table is not allowed to break the Studio); fail closed on a real limit. */
export async function checkFullPlaybackAllowed(userId: string, beatId: string): Promise<{ allowed: boolean; reason?: "per_hour" | "distinct_beats" }> {
  try {
    const since = new Date(Date.now() - HOUR_MS).toISOString();
    const { data, error } = await createSupabaseAdminClient()
      .from("beat_audio_playback_log")
      .select("beat_id, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(PLAYBACK_MAX_PER_HOUR + 1);
    if (error) return { allowed: true }; // table missing or transient error: never break the Studio
    return decidePlaybackGuard((data as PlaybackLogRow[] | null) ?? [], beatId);
  } catch {
    return { allowed: true };
  }
}

export async function logFullPlayback(userId: string, beatId: string, assetId: string): Promise<void> {
  try {
    await createSupabaseAdminClient().from("beat_audio_playback_log").insert({ user_id: userId, beat_id: beatId, asset_id: assetId });
  } catch {
    /* logging must never break playback */
  }
}
