/**
 * E3.2 — Server load of premium_entitlements → effective audio entitlement.
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
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type PremiumEntitlementRow = {
  user_id: string;
  active: boolean;
  source: string;
  expires_at: string | null;
};

function mapPremiumRow(row: PremiumEntitlementRow): PremiumEntitlementSnapshot {
  return {
    userId: row.user_id,
    active: row.active,
    source: row.source,
    expiresAt: row.expires_at,
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
    .select("user_id, active, source, expires_at")
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
    premium,
    nowMs,
  });
}
