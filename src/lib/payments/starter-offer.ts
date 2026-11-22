import "server-only";

import { STARTER_PACK_OFFER } from "@/config/plan-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Owner 2026-11-22 starter offer (-30% on one pack, 48 h from signup). Server-side qualification;
 * the price itself is money.ts checkoutPrice. The atomic "one per account" guard is
 * create_payment_order_capped (migration 20261122120000); this read only decides what to offer.
 */

const HOUR_MS = 60 * 60 * 1000;

export type StarterOffer = {
  /** End of the 48 h window (ISO). */
  endsAt: string;
  /** Whole hours left, rounded up, at least 1. */
  hoursLeft: number;
};

/** Pure: the open window for an account created at `createdAt`, or null when it has passed. */
export function starterOfferWindow(createdAt: string | null | undefined, now: Date): StarterOffer | null {
  if (!createdAt) return null;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created) || created > now.getTime() + 5 * 60 * 1000) return null;
  const ends = created + STARTER_PACK_OFFER.windowHours * HOUR_MS;
  const left = ends - now.getTime();
  if (left <= 0) return null;
  return { endsAt: new Date(ends).toISOString(), hoursLeft: Math.max(1, Math.ceil(left / HOUR_MS)) };
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * The offer for this account now, or null (window passed, a discounted order is pending / paid /
 * refunded, or anything failed to read — including the promo_code column before the migration).
 */
export async function loadStarterOffer(userId: string, now: Date, admin: AdminClient = createSupabaseAdminClient()): Promise<StarterOffer | null> {
  try {
    const found = await admin.auth.admin.getUserById(userId);
    if (found.error || !found.data?.user) return null;
    const window = starterOfferWindow(found.data.user.created_at, now);
    if (!window) return null;
    const used = await admin
      .from("payment_orders")
      .select("id")
      .eq("user_id", userId)
      .not("promo_code", "is", null)
      .neq("status", "failed")
      .limit(1);
    if (used.error) return null;
    if ((used.data ?? []).length > 0) return null;
    return window;
  } catch {
    return null;
  }
}
