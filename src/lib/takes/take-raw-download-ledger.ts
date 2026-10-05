/**
 * P4.5 — RAW own-take download ledger (GOLD daily C).
 * Never reuse beat_download_events.
 */

import "server-only";

import { utcDayWindowStart } from "@/lib/downloads/limits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export { assertUnderOwnTakeRawDailyCap } from "@/lib/takes/take-raw-download-limits";

export async function countOwnTakeRawDownloadsToday(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const admin = createSupabaseAdminClient();
  const dayStart = utcDayWindowStart(now).toISOString();
  const { count, error } = await admin
    .from("take_download_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", dayStart);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Insert ledger row only after successful signed URL issuance. */
export async function recordOwnTakeRawDownloadEvent(params: {
  userId: string;
  takeId: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("take_download_events").insert({
    user_id: params.userId,
    take_id: params.takeId,
  });
  if (error) throw new Error(error.message);
}
