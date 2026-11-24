import "server-only";

import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Public copy of a published sample (row + file). Without its sample row nothing would guard it any more.
 * The sample must no longer point at it (FK RESTRICT). The row goes first: a file alone cannot be copied.
 */
export async function removeCatalogAsset(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  catalogAssetId: unknown,
): Promise<void> {
  if (typeof catalogAssetId !== "string" || !catalogAssetId) return;
  const { data } = await admin.from("catalog_assets").select("object_key").eq("id", catalogAssetId).maybeSingle();
  const removed = await admin.from("catalog_assets").delete().eq("id", catalogAssetId);
  if (removed.error) {
    console.error("[catalog-asset] catalog asset not removed", catalogAssetId);
    return;
  }
  const key = (data as { object_key?: string | null } | null)?.object_key;
  if (key) await admin.storage.from(BEAT_AUDIO_BUCKET).remove([key]);
}
