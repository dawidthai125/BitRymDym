/**
 * Plan locks for studio writes. Pure: the server decides, the UI only mirrors.
 * Owner 2026-11-08.
 */
import { PLAN_POLICY, maxFxEffectsForTier } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

export function effectCountOf(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const effects = (raw as { effects?: unknown }).effects;
  return Array.isArray(effects) ? effects.length : 0;
}

export function chainHasSidechain(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const effects = (raw as { effects?: unknown }).effects;
  return Array.isArray(effects) && effects.some((effect) => (effect as { type?: unknown } | null)?.type === "sidechain");
}

/** Zero cents and an unchanged value stay allowed, so tempo and a reset still save. */
export function clipPitchChangeAllowed(tier: PremiumTier, nextCents: number, storedCents: number): boolean {
  const next = Math.round(nextCents);
  const stored = Math.round(storedCents);
  if (next === 0 || next === stored) return true;
  return PLAN_POLICY[tier].studio.clipPitch;
}

export function fxChainWriteAllowed(args: {
  tier: PremiumTier;
  nextCount: number;
  previousCount: number;
  nextHasSidechain: boolean;
}): { ok: true } | { ok: false; reason: "sidechain" | "length"; cap: number } {
  const cap = maxFxEffectsForTier(args.tier);
  if (args.nextHasSidechain && !PLAN_POLICY[args.tier].studio.sidechain) {
    return { ok: false, reason: "sidechain", cap };
  }
  if (args.nextCount > cap && args.nextCount >= args.previousCount) {
    return { ok: false, reason: "length", cap };
  }
  return { ok: true };
}
