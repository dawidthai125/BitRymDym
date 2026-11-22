/**
 * Anonymous funnel counters (public.funnel_events, service role only).
 * Writes never throw: a failed counter must not break a page or a click.
 */

import "server-only";

import type { FunnelProduct, FunnelTier } from "@/lib/funnel/funnel-request";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type FunnelEventInput =
  | { event: "premium_view" }
  | { event: "buy_click"; product: FunnelProduct; tier: FunnelTier | null };

export async function recordFunnelEvent(input: FunnelEventInput): Promise<boolean> {
  try {
    const row: { event: string; product: string | null; tier: string | null } =
      input.event === "buy_click"
        ? { event: input.event, product: input.product, tier: input.tier }
        : { event: input.event, product: null, tier: null };
    const { error } = await createSupabaseAdminClient().from("funnel_events").insert(row);
    return !error;
  } catch {
    return false;
  }
}
