/**
 * E3.2 / W2-A — Server load of premium_entitlements → effective audio entitlement.
 * Uses service-role read so AuthZ paths do not depend on caller RLS alone.
 * Mutations remain service_role-only (E3.1 triggers) — this module is READ-ONLY.
 */

import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import {
  resolveEffectiveAudioEntitlement,
  type EffectiveAudioEntitlement,
  type PremiumEntitlementSnapshot,
} from "@/lib/audio/effective-entitlement";
import { resolveProductEntitlement } from "@/lib/entitlements/product-entitlement";
import type { ProductEntitlement } from "@/lib/entitlements/product-entitlement";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPremiumTier } from "@/types/premium";

type PremiumEntitlementRow = {
  user_id: string;
  active: boolean;
  source: string;
  expires_at: string | null;
  tier: string | null;
};

function mapPremiumRow(row: PremiumEntitlementRow): PremiumEntitlementSnapshot {
  return {
    userId: row.user_id,
    active: row.active,
    source: row.source,
    expiresAt: row.expires_at,
    tier: isPremiumTier(row.tier) ? row.tier : null,
  };
}

/**
 * Load the active overlay row for a user (if any).
 * Expiry is evaluated by the pure resolver — not by filtering expires_at in SQL —
 * so expired-but-still-active flags degrade correctly without a cron.
 */
export async function loadPremiumEntitlementSnapshot(
  userId: string,
): Promise<PremiumEntitlementSnapshot | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("premium_entitlements")
    .select("user_id, active, source, expires_at, tier")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load premium_entitlements: ${error.message}`);
  }
  if (!data) return null;
  return mapPremiumRow(data as PremiumEntitlementRow);
}

/** Session → overlay → effective capabilities (server authority). */
export async function resolveAudioEntitlementForAuthContext(
  context: AuthContext,
  nowMs?: number,
): Promise<EffectiveAudioEntitlement> {
  const premium = await loadPremiumEntitlementSnapshot(context.userId);
  return resolveEffectiveAudioEntitlement({
    userId: context.userId,
    accountLevel: context.profile.accountLevel,
    experienceTotal: context.profile.experienceTotal ?? 0,
    premium,
    nowMs,
  });
}

/** Full product entitlement (rank + experience + premium + limits). */
export async function resolveProductEntitlementForAuthContext(
  context: AuthContext,
  nowMs?: number,
): Promise<ProductEntitlement> {
  const premium = await loadPremiumEntitlementSnapshot(context.userId);
  return resolveProductEntitlement({
    userId: context.userId,
    accountLevel: context.profile.accountLevel,
    experienceTotal: context.profile.experienceTotal ?? 0,
    premium,
    nowMs,
  });
}
