import "server-only";

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
