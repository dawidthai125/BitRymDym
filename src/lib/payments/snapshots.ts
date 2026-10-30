import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPremiumTier } from "@/types/premium";
import type { PremiumTier } from "@/types/premium";

import type { AddonSnapshot, PlanSnapshot } from "@/lib/payments/entitlement-grant";

export async function loadPlanSnapshot(userId: string): Promise<PlanSnapshot> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("premium_entitlements")
    .select("tier, active, expires_at")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error("PLAN_READ_FAILED");
  if (!data) return null;
  const tier: PremiumTier = isPremiumTier(data.tier) ? data.tier : "FREE";
  return {
    tier,
    active: data.active === true,
    expiresAt: typeof data.expires_at === "string" ? data.expires_at : null,
  };
}

export async function loadAddonSnapshot(userId: string): Promise<AddonSnapshot> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("plan_addon_entitlements")
    .select("ends_at")
    .eq("user_id", userId)
    .eq("addon", "reference_mastering")
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error("ADDON_READ_FAILED");
  if (!data) return null;
  return { endsAt: typeof data.ends_at === "string" ? data.ends_at : null };
}
