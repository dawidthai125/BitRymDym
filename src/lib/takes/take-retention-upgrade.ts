import "server-only";

/**
 * Plan policy — after an upgrade, takes that are still alive get the new plan's
 * validity (expires_at = greatest(expires_at, created_at + plan TTL); never shortens).
 * Free takes are valid 24 h; e.g. Free → Silver turns a 4 h old take into 60 h.
 * Best effort: a failure never blocks the grant / recording flow.
 */
import { takeTtlSecondsForTier } from "@/config/plan-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PremiumTier } from "@/types/premium";

export async function extendTakeRetentionForTier(userId: string, tier: PremiumTier): Promise<number> {
  if (tier === "FREE") return 0;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("extend_take_retention_for_owner", {
      p_owner_id: userId,
      p_ttl_seconds: takeTtlSecondsForTier(tier),
    });
    if (error) {
      // PGRST202 = migration not applied yet → nothing to do.
      if (error.code !== "PGRST202" && error.code !== "42883") console.error("[take-retention-upgrade]", error.message);
      return 0;
    }
    return typeof data === "number" ? data : 0;
  } catch (e) {
    console.error("[take-retention-upgrade]", e instanceof Error ? e.message : e);
    return 0;
  }
}
