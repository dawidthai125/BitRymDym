import "server-only";

import { STUDIO_MAX_SONG_MS } from "@/config/studio";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Title of the beat attached to a Studio project, for the "BIT" picker label.
 * The beat track itself is always named "Bit", so the picker showed only "Bit ▾" (audit 2026-11-21).
 * Called after getStudioProjectDocument() has checked ownership; a missing title is not an error.
 */
export async function loadStudioBeatTitle(beatId: string | null): Promise<string | null> {
  if (!beatId) return null;
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("beats")
      .select("title")
      .eq("id", beatId)
      .maybeSingle();
    if (error || !data) return null;
    const title = typeof data.title === "string" ? data.title.trim() : "";
    return title || null;
  } catch {
    return null;
  }
}

/** Full length of the project's Bit as the timeline seeds it; null when unknown. */
export async function loadStudioBeatDurationMs(beatId: string | null): Promise<number | null> {
  if (!beatId) return null;
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("beats")
      .select("duration_seconds")
      .eq("id", beatId)
      .maybeSingle();
    const seconds = Number(data?.duration_seconds);
    if (error || !Number.isFinite(seconds) || seconds <= 0) return null;
    return Math.min(STUDIO_MAX_SONG_MS, Math.max(1000, Math.round(seconds * 1000)));
  } catch {
    return null;
  }
}
