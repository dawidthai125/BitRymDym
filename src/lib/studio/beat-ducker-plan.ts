/**
 * 1-tap "quieter beat under the vocal": the existing pocket effect on the lead, which ducks the beat
 * mids while the vocal is up (live: pocket worklet → beat trim; mix/master: applyRapPocket).
 * The sidechain effect cannot do it: its key is the BEAT, so on a vocal it ducks the vocal.
 * Section levels stay at 0 dB and the hook double at its minimum, so only the beat moves.
 */

import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import { upsertFx } from "@/lib/studio/mix-autofix/plan";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { StudioTrackRole } from "@/config/studio";

/** −2.5 dB duck ≈ 1 − 10^(−2.5/20). */
export const BEAT_DUCKER_DEPTH = 0.25;
/** What the button wrote before it was fixed (a sidechain that ducked the vocal instead). */
const LEGACY_SIDECHAIN = { depth: 0.25, attackMs: 12, releaseMs: 120 } as const;

export type BeatDuckerTrack = {
  id: string;
  trackRole: StudioTrackRole;
  effectsChain: StudioFxChainV1;
};

export type BeatDuckerPlan = {
  ops: MixWorkingOp[];
  /** Why nothing was planned (or null). */
  reason: "no-lead" | "already" | "limit" | null;
};

function withoutLegacy(chain: StudioFxChainV1): StudioFxChainV1 {
  const effects = chain.effects.filter(
    (e) =>
      !(
        e.type === "sidechain" &&
        e.params.depth === LEGACY_SIDECHAIN.depth &&
        e.params.attackMs === LEGACY_SIDECHAIN.attackMs &&
        e.params.releaseMs === LEGACY_SIDECHAIN.releaseMs
      ),
  );
  return effects.length === chain.effects.length ? chain : { ...chain, effects };
}

export function planBeatDucker(params: {
  tracks: readonly BeatDuckerTrack[];
  /** Plan cap on effects per chain (the server enforces the same). */
  maxEffects?: number;
  createId?: () => string;
}): BeatDuckerPlan {
  const createId = params.createId ?? (() => crypto.randomUUID());
  const leads = params.tracks.filter((t) => t.trackRole === "lead_vocal");
  if (leads.length === 0) return { ops: [], reason: "no-lead" };
  const ops: MixWorkingOp[] = [];
  let full = false;
  for (const track of leads) {
    const base = withoutLegacy(track.effectsChain);
    const had = base.effects.some((e) => e.type === "pocket");
    const next = upsertFx(
      base,
      "pocket",
      (p) =>
        had
          ? { ...p, depth: Math.max(p.depth, BEAT_DUCKER_DEPTH) }
          : { verseDb: 0, hookDb: 0, depth: BEAT_DUCKER_DEPTH, doubleMs: 20, doubleCents: 0, doubleDb: -24 },
      createId,
    );
    const cap = params.maxEffects;
    if (!next || (!had && cap !== undefined && next.effects.length > cap)) {
      full = true;
      continue;
    }
    if (JSON.stringify(next) === JSON.stringify(track.effectsChain)) continue;
    ops.push({ op: "set_track_fx", trackId: track.id, effectsChain: next });
  }
  return { ops, reason: ops.length > 0 ? null : full ? "limit" : "already" };
}
