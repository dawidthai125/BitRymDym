import "server-only";

import { minimumTierFor } from "@/config/plan-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { requireUser } from "@/lib/auth/session";
import { StudioPlanFeatureError } from "@/lib/studio/presets/fx-presets-server";
import { parseStudioFxChainForWrite } from "@/lib/studio/studio-fx-chain";

import { findLockedTuneEffect } from "./tune";

function mentionsTune(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const effects = (raw as { effects?: unknown }).effects;
  return Array.isArray(effects) && effects.some((e) => (e as { type?: unknown } | null)?.type === "tune");
}

/**
 * Plan gate for FX writes (track FX PATCH, Mix Working apply): Free/Bronze may
 * store BRD Tune only in the natural style. No tune in the payload → no
 * entitlement lookup at all. Invalid chains are left to the write path.
 */
export async function assertTuneChainsAllowedForUser(chains: readonly unknown[]): Promise<void> {
  const withTune = chains.filter(mentionsTune);
  if (withTune.length === 0) return;
  const auth = await requireUser();
  const tier = (await resolveProductEntitlementForAuthContext(auth)).premiumTier;
  for (const raw of withTune) {
    let chain;
    try {
      chain = parseStudioFxChainForWrite(raw, { role: "track" });
    } catch {
      continue;
    }
    if (findLockedTuneEffect(tier, chain)) {
      throw new StudioPlanFeatureError(
        "pitch_correction_custom",
        tier,
        minimumTierFor((p) => p.tools.pitchCorrection.custom),
        "Twardy styl strojenia i własne ustawienia są w planie Silver.",
      );
    }
  }
}

/** Track FX chains carried by Mix Working ops (set_track_fx). */
export function tuneChainsInMixOps(ops: unknown): unknown[] {
  if (!Array.isArray(ops)) return [];
  return ops
    .filter((op) => (op as { op?: unknown } | null)?.op === "set_track_fx")
    .map((op) => (op as { effectsChain?: unknown }).effectsChain);
}
