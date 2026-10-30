/**
 * BITEK "tune" proposal → track FX chain (browser side). Reuses the Mix
 * autofix upsert (canonical FX order: tune after gate) and the plan clamp, so
 * a Free user asking for hard tuning gets the natural style, never a 403.
 */
import { upsertFx } from "@/lib/studio/mix-autofix/plan";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import { clampTuneChainForTier, TUNE_STYLES, type TuneKey } from "@/lib/studio/tune/tune";
import type { PremiumTier } from "@/types/premium";

import type { BitekTuneLevel } from "./types";

export function bitekTuneChain(params: {
  chain: StudioFxChainV1;
  level: BitekTuneLevel;
  beatKey: TuneKey | null;
  tier: PremiumTier;
  createId?: () => string;
}): StudioFxChainV1 | null {
  const { chain, level, beatKey, tier } = params;
  if (level === 0) {
    if (!chain.effects.some((e) => e.type === "tune" && e.enabled)) return chain;
    return { ...chain, effects: chain.effects.map((e) => (e.type === "tune" ? { ...e, enabled: false } : e)) };
  }
  const isNew = !chain.effects.some((e) => e.type === "tune");
  const style = TUNE_STYLES[level === 2 ? "hard" : "natural"];
  const next = upsertFx(
    chain,
    "tune",
    (prev) => ({
      ...prev,
      // A new insert follows the beat key; an existing one keeps the user's key.
      ...(isNew && beatKey ? { keyRoot: beatKey.keyRoot, scale: beatKey.scale } : {}),
      ...style,
    }),
    params.createId ?? (() => crypto.randomUUID()),
  );
  return next ? clampTuneChainForTier(tier, next) : null;
}
