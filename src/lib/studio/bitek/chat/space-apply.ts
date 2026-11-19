/**
 * BITEK "space" proposal (reverb + echo amount on a vocal track) → track FX chain, browser side.
 * Four fixed levels, so the button says what it does and Ctrl+Z / "cofnij" land on a known value.
 * Reuses the Mix autofix upsert (canonical FX order, chain cap) like the tune proposal.
 */
import { upsertFx } from "@/lib/studio/mix-autofix/plan";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";

import type { BitekSpaceLevel } from "./types";

const REVERB_MIX = [0, 0.12, 0.22, 0.35] as const;
const REVERB_DECAY = [1.2, 1.2, 1.6, 2.0] as const;
const DELAY_MIX = [0, 0.08, 0.14, 0.22] as const;
const DELAY_FEEDBACK = [0.25, 0.25, 0.3, 0.35] as const;

/** Level a chain is at now: the louder of reverb and echo (thresholds sit between the four presets). */
export function bitekSpaceLevelOf(chain: StudioFxChainV1 | null | undefined): BitekSpaceLevel {
  let level: BitekSpaceLevel = 0;
  for (const e of chain?.effects ?? []) {
    if (!e.enabled) continue;
    if (e.type === "reverb") {
      const m = e.params.mix;
      const l: BitekSpaceLevel = m < 0.04 ? 0 : m < 0.17 ? 1 : m < 0.29 ? 2 : 3;
      if (l > level) level = l;
    } else if (e.type === "delay") {
      const m = e.params.mix;
      const l: BitekSpaceLevel = m < 0.03 ? 0 : m < 0.11 ? 1 : m < 0.18 ? 2 : 3;
      if (l > level) level = l;
    }
  }
  return level;
}

export function bitekSpaceChain(params: {
  chain: StudioFxChainV1;
  level: BitekSpaceLevel;
  createId?: () => string;
}): StudioFxChainV1 | null {
  const { chain, level } = params;
  const createId = params.createId ?? (() => crypto.randomUUID());
  if (level === 0) {
    if (!chain.effects.some((e) => (e.type === "reverb" || e.type === "delay") && e.enabled)) return chain;
    return { ...chain, effects: chain.effects.map((e) => (e.type === "reverb" || e.type === "delay" ? { ...e, enabled: false } : e)) };
  }
  const withReverb = upsertFx(chain, "reverb", (prev) => ({ ...prev, mix: REVERB_MIX[level], decaySeconds: REVERB_DECAY[level] }), createId);
  if (!withReverb) return null;
  // Echo is best effort: when the chain is full the reverb alone still gives the asked space.
  const withDelay = upsertFx(withReverb, "delay", (prev) => ({ ...prev, mix: DELAY_MIX[level], feedback: DELAY_FEEDBACK[level] }), createId);
  return withDelay ?? withReverb;
}
