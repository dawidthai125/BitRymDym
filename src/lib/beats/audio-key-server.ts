import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import {
  beatKeyDetectedLabel,
  parseBeatKeySuggestion,
} from "@/lib/beats/audio-key";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Store the analyze-step key suggestion on the owner's USER beat
 * (beats.key_detected / key_confidence — advisory, shown as a hint on the
 * edit page; the real key/scale stay owner-controlled). Analyze itself never
 * writes the beat (E1), so the form echoes the suggestion at finalize; it is
 * validated and pinned to the owner. Best effort — never fails finalize.
 */
export async function recordOwnBeatKeySuggestion(params: {
  context: AuthContext;
  beatId: string;
  suggestion: unknown;
}): Promise<void> {
  const parsed = parseBeatKeySuggestion(params.suggestion);
  try {
    const { error } = await createSupabaseAdminClient()
      .from("beats")
      .update({
        key_detected: parsed ? beatKeyDetectedLabel(parsed) : null,
        key_confidence: parsed ? parsed.confidence : null,
      })
      .eq("id", params.beatId)
      .eq("owner_id", params.context.userId)
      .eq("ownership_type", "USER");
    if (error) console.error("[beats] key_detected write failed:", error.message);
  } catch (error) {
    console.error("[beats] key_detected write failed:", error);
  }
}
