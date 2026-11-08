import "server-only";

import {
  engineerRequestsPerMonthForTier,
  maxFxEffectsForTier,
  minimumTierFor,
  separatorFilesForTier,
} from "@/config/plan-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { StudioPlanFeatureError } from "@/lib/studio/presets/fx-presets-server";
import { warsawMonthWindow } from "@/lib/studio/studio-plan-limits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PremiumTier } from "@/types/premium";

import { chainHasSidechain, effectCountOf, fxChainWriteAllowed } from "./plan-feature-gates";

export type FxWriteTarget = { raw: unknown; projectId: string; trackId: string | null };

async function tierFor(auth: AuthContext): Promise<PremiumTier> {
  return (await resolveProductEntitlementForAuthContext(auth)).premiumTier;
}

async function storedEffectCount(projectId: string, trackId: string | null): Promise<number> {
  const admin = createSupabaseAdminClient();
  if (trackId) {
    const { data, error } = await admin
      .from("studio_tracks")
      .select("effects_chain")
      .eq("id", trackId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error || !data) return 0;
    return effectCountOf((data as { effects_chain?: unknown }).effects_chain);
  }
  const { data, error } = await admin.from("studio_projects").select("master_fx_chain").eq("id", projectId).maybeSingle();
  if (error || !data) return 0;
  return effectCountOf((data as { master_fx_chain?: unknown }).master_fx_chain);
}

/** Reject a new sidechain below Silver, and a chain that is over the cap and not shrinking. */
export async function assertFxWritesAllowed(writes: readonly FxWriteTarget[]): Promise<void> {
  const flagged = writes.filter((write) => chainHasSidechain(write.raw) || effectCountOf(write.raw) > maxFxEffectsForTier("FREE"));
  if (flagged.length === 0) return;
  const auth = await requireUser();
  const tier = await tierFor(auth);
  for (const write of writes) {
    const nextCount = effectCountOf(write.raw);
    const cap = maxFxEffectsForTier(tier);
    const previousCount = nextCount > cap ? await storedEffectCount(write.projectId, write.trackId) : nextCount;
    const decision = fxChainWriteAllowed({
      tier,
      nextCount,
      previousCount,
      nextHasSidechain: chainHasSidechain(write.raw),
    });
    if (decision.ok) continue;
    if (decision.reason === "sidechain") {
      throw new StudioPlanFeatureError(
        "sidechain",
        tier,
        minimumTierFor((policy) => policy.studio.sidechain),
        "Ściszanie pod bit jest od planu Silver.",
      );
    }
    throw new StudioPlanFeatureError(
      "fx_chain_length",
      tier,
      minimumTierFor((policy) => policy.studio.maxFxEffects > maxFxEffectsForTier("FREE")),
      `Na tym planie maks. ${decision.cap} efektów. Dłuższy łańcuch jest od Silver.`,
    );
  }
}

export function fxWritesFromMixOps(projectId: string, ops: unknown): FxWriteTarget[] {
  if (!Array.isArray(ops)) return [];
  const writes: FxWriteTarget[] = [];
  for (const op of ops) {
    if (!op || typeof op !== "object") continue;
    const kind = (op as { op?: unknown }).op;
    if (kind === "set_track_fx") {
      const trackId = (op as { trackId?: unknown }).trackId;
      writes.push({
        raw: (op as { effectsChain?: unknown }).effectsChain,
        projectId,
        trackId: typeof trackId === "string" ? trackId : "",
      });
    } else if (kind === "set_master_fx") {
      writes.push({ raw: (op as { effectsChain?: unknown }).effectsChain, projectId, trackId: null });
    }
  }
  return writes;
}

export async function assertSeparatorEnqueueAllowed(): Promise<void> {
  const auth = await requireUser();
  const tier = await tierFor(auth);
  if (separatorFilesForTier(tier)) return;
  throw new StudioPlanFeatureError(
    "separator",
    tier,
    minimumTierFor((policy) => policy.studio.maxStems > 0),
    "Pliki z rozcięcia są od planu Silver.",
  );
}

export async function countEngineerRequestsThisMonth(ownerId: string, now = new Date()): Promise<number> {
  const { startIso } = warsawMonthWindow(now);
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("studio_engineer_requests")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", startIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function engineerQuotaForUser(auth: AuthContext, now = new Date()): Promise<{ limit: number; used: number; tier: PremiumTier }> {
  const tier = await tierFor(auth);
  const limit = engineerRequestsPerMonthForTier(tier);
  const used = limit > 0 ? await countEngineerRequestsThisMonth(auth.userId, now) : 0;
  return { limit, used, tier };
}

export async function assertEngineerRequestAllowed(auth: AuthContext): Promise<{ limit: number; used: number }> {
  const quota = await engineerQuotaForUser(auth);
  if (quota.limit <= 0 || quota.used >= quota.limit) {
    throw new StudioPlanFeatureError(
      "engineer",
      quota.tier,
      minimumTierFor((policy) => policy.studio.engineerRequestsPerMonth > 0),
      quota.limit <= 0
        ? "Pytania do realizatora są od planu Silver."
        : "W tym miesiącu limit pytań do realizatora jest wykorzystany.",
    );
  }
  return { limit: quota.limit, used: quota.used };
}
