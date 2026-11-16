/**
 * 1-tap mild beat ducker — sidechain on the lead vocal (existing bus key).
 * Producent: −2.5 dB ≈ depth 0.25; attack 12 / release 120.
 * FX sidechain has no band param (wanted 200–4500 Hz) — depth/time only.
 */

import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import { upsertFx } from "@/lib/studio/mix-autofix/plan";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { StudioTrackRole } from "@/config/studio";

/** −2.5 dB duck ≈ 1 − 10^(−2.5/20). */
export const BEAT_DUCKER_DEPTH = 0.25;
export const BEAT_DUCKER_ATTACK_MS = 12;
export const BEAT_DUCKER_RELEASE_MS = 120;

export type BeatDuckerTrack = {
  id: string;
  trackRole: StudioTrackRole;
  effectsChain: StudioFxChainV1;
};

export function planBeatDuckerOps(params: {
  tracks: readonly BeatDuckerTrack[];
  createId?: () => string;
}): MixWorkingOp[] {
  const createId = params.createId ?? (() => crypto.randomUUID());
  const leads = params.tracks.filter((t) => t.trackRole === "lead_vocal");
  const targets = leads.length > 0 ? leads : params.tracks.filter((t) => t.trackRole !== "beat" && t.trackRole !== "instrument");
  const ops: MixWorkingOp[] = [];
  for (const track of targets) {
    const next = upsertFx(
      track.effectsChain,
      "sidechain",
      () => ({
        depth: BEAT_DUCKER_DEPTH,
        attackMs: BEAT_DUCKER_ATTACK_MS,
        releaseMs: BEAT_DUCKER_RELEASE_MS,
      }),
      createId,
    );
    if (!next) continue;
    if (JSON.stringify(next) === JSON.stringify(track.effectsChain)) continue;
    ops.push({ op: "set_track_fx", trackId: track.id, effectsChain: next });
  }
  return ops;
}
