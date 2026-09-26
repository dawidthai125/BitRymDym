import "server-only";

import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DownloadHistoryItem = {
  beatId: string;
  title: string;
  producer: string | null;
  lastDownloadedAt: string;
};

/**
 * Minimal authenticated "Moje pobrane" — distinct beats, latest download time.
 * Relies on RLS: user can SELECT only own events.
 */
export async function listMyDownloadHistory(): Promise<DownloadHistoryItem[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("beat_download_events")
    .select("beat_id, created_at, beats(title, producer)")
    .eq("actor_type", "USER")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load download history: ${error.message}`);
  }

  const byBeat = new Map<string, DownloadHistoryItem>();
  for (const row of data ?? []) {
    const beatId = row.beat_id as string;
    if (byBeat.has(beatId)) continue;
    const beat = row.beats as
      | { title: string; producer: string | null }
      | { title: string; producer: string | null }[]
      | null;
    const meta = Array.isArray(beat) ? beat[0] : beat;
    byBeat.set(beatId, {
      beatId,
      title: meta?.title ?? "Bit",
      producer: meta?.producer ?? null,
      lastDownloadedAt: row.created_at as string,
    });
  }

  return Array.from(byBeat.values()).sort(
    (a, b) =>
      new Date(b.lastDownloadedAt).getTime() -
      new Date(a.lastDownloadedAt).getTime(),
  );
}
