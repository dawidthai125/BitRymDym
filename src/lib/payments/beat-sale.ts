import "server-only";

import { isUuid } from "@/lib/beats/audio-validation";
import { catalogLaneOf } from "@/lib/beats/catalog-lane";
import { isPurchasedWavContentType } from "@/lib/payments/beat-wav";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type BeatSaleState = {
  id: string;
  title: string;
  fileReady: boolean;
  owned: boolean;
  /** A pending order for this beat opened inside the last hour. */
  open: boolean;
};

/**
 * A published PLATFORM beat on the paid lane. The wav must be the active READY master.
 * Free-lane beats and user beats are not for sale.
 */
export async function loadBeatSale(beatId: string, userId: string | null, now = new Date()): Promise<BeatSaleState | null> {
  if (!isUuid(beatId)) return null;
  const admin = createSupabaseAdminClient();
  const beat = await admin
    .from("beats")
    .select("id, title, status, ownership_type, catalog_lane")
    .eq("id", beatId)
    .maybeSingle();
  if (beat.error || !beat.data) return null;
  const row = beat.data as {
    id?: string;
    title?: string | null;
    status?: string;
    ownership_type?: string;
    catalog_lane?: string | null;
  };
  if (row.id !== beatId || row.status !== "PUBLISHED" || row.ownership_type !== "PLATFORM" || catalogLaneOf(row.catalog_lane) !== "paid") {
    return null;
  }

  const asset = await admin
    .from("beat_audio_assets")
    .select("content_type")
    .eq("beat_id", beatId)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();
  const fileReady = !asset.error && isPurchasedWavContentType((asset.data as { content_type?: string | null } | null)?.content_type);

  let owned = false;
  let open = false;
  if (userId && isUuid(userId)) {
    const purchase = await admin.from("beat_purchases").select("id").eq("user_id", userId).eq("beat_id", beatId).maybeSingle();
    if (purchase.error) return null;
    owned = purchase.data != null;
    const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const pending = await admin
      .from("payment_orders")
      .select("id")
      .eq("user_id", userId)
      .eq("beat_id", beatId)
      .eq("product_kind", "beat")
      .eq("status", "pending")
      .gte("created_at", since)
      .limit(1);
    if (pending.error) return null;
    open = (pending.data ?? []).length > 0;
  }

  return {
    id: beatId,
    title: typeof row.title === "string" ? row.title.trim() : "",
    fileReady,
    owned,
    open,
  };
}
