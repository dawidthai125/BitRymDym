/**
 * BITEK chat "Apply" / "Undo" (browser side, pure): a list of values → one Mix Working apply.
 * Several changes of one track build on each other (one chain per track), so none overwrites another.
 */
import { clampChainToPlan } from "@/lib/studio/mix-autofix/plan";
import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { TuneKey } from "@/lib/studio/tune/tune";
import type { PremiumTier } from "@/types/premium";

import type { BitekClientContext } from "./client-context";
import { bitekSpaceChain } from "./space-apply";
import { bitekTuneChain } from "./tune-apply";
import { BITEK_MASTER_REF, type BitekJob, type BitekMasterSetting, type BitekProposal, type BitekSpaceLevel, type BitekTuneLevel } from "./types";

/** The refs a reply uses → the track ids they meant when it was written. */
export function refsToTrackIds(
  trackIdByRef: Readonly<Record<string, string>>,
  proposals: readonly BitekProposal[],
  jobs: readonly BitekJob[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ref of [...proposals.map((p) => p.trackRef), ...jobs.map((j) => (j.kind === "trackFx" ? j.trackRef : ""))]) {
    const id = trackIdByRef[ref];
    if (id) out[ref] = id;
  }
  return out;
}

const REF = /^t\d{1,3}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server: the client's ref map, only well-formed pairs. */
export function parseTrackIds(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [ref, id] of Object.entries(raw as Record<string, unknown>).slice(0, 64)) {
    if (REF.test(ref) && typeof id === "string" && UUID.test(id)) out[ref] = id;
  }
  return out;
}

/** Track a reply's proposal means now; null when that track is gone or the reply is too old to know. */
export function bitekProposalTarget(
  ref: string,
  trackIds: Readonly<Record<string, string>> | null,
  current: Readonly<Record<string, string>>,
): string | null {
  if (ref === BITEK_MASTER_REF) return BITEK_MASTER_REF;
  const id = trackIds?.[ref];
  return id && Object.values(current).includes(id) ? id : null;
}

export type BitekChangePlan =
  | {
      ok: true;
      ops: MixWorkingOp[];
      master: { key: BitekMasterSetting; value: number }[];
      /** Value before, per item. */
      from: (number | boolean)[];
      names: string[];
    }
  | { ok: false; reason: "missing" | "limit" };

export function planBitekChanges(params: {
  client: Pick<BitekClientContext, "context" | "trackIdByRef" | "effectsChainByTrackId">;
  items: readonly { target: string; param: BitekProposal["param"]; value: number | boolean }[];
  beatKey: TuneKey | null;
  tier: PremiumTier;
  /** Whole-song settings can be applied (Mastering step). */
  canMaster: boolean;
  maxEffects?: number;
  allowSidechain?: boolean;
  createId?: () => string;
}): BitekChangePlan {
  const { context, trackIdByRef, effectsChainByTrackId } = params.client;
  const chains = new Map<string, StudioFxChainV1>();
  const controls = new Map<string, Extract<MixWorkingOp, { op: "set_track_controls" }>>();
  const master: { key: BitekMasterSetting; value: number }[] = [];
  const from: (number | boolean)[] = [];
  const names = new Set<string>();
  for (const item of params.items) {
    if (item.target === BITEK_MASTER_REF) {
      if (!params.canMaster || typeof item.value !== "number") return { ok: false, reason: "missing" };
      const key = item.param as BitekMasterSetting;
      from.push(context.master?.settings[key] ?? 0);
      master.push({ key, value: item.value });
      continue;
    }
    const ref = Object.keys(trackIdByRef).find((r) => trackIdByRef[r] === item.target);
    const track = context.tracks.find((x) => x.ref === ref);
    if (!track) return { ok: false, reason: "missing" };
    names.add(track.name);
    if (item.param === "tune" || item.param === "space") {
      const original = effectsChainByTrackId[item.target];
      if (!original || typeof item.value !== "number") return { ok: false, reason: "missing" };
      const chain = chains.get(item.target) ?? original;
      const next =
        item.param === "tune"
          ? bitekTuneChain({ chain, level: item.value as BitekTuneLevel, beatKey: params.beatKey, tier: params.tier, createId: params.createId })
          : bitekSpaceChain({ chain, level: item.value as BitekSpaceLevel, createId: params.createId });
      const fitted = next && clampChainToPlan(next, original, { maxEffects: params.maxEffects, allowSidechain: params.allowSidechain });
      const needed = item.param === "tune" ? "tune" : "reverb";
      if (!fitted || (item.value > 0 && !fitted.effects.some((e) => e.type === needed))) return { ok: false, reason: "limit" };
      chains.set(item.target, fitted);
      from.push((item.param === "tune" ? track.tune : track.space) ?? 0);
      continue;
    }
    if (item.param !== "gainDb" && item.param !== "pan" && item.param !== "muted") return { ok: false, reason: "missing" };
    from.push(track[item.param]);
    controls.set(item.target, { ...(controls.get(item.target) ?? { op: "set_track_controls", trackId: item.target }), [item.param]: item.value });
  }
  const ops: MixWorkingOp[] = [...controls.values()];
  for (const [trackId, effectsChain] of chains) {
    if (JSON.stringify(effectsChain) !== JSON.stringify(effectsChainByTrackId[trackId])) ops.push({ op: "set_track_fx", trackId, effectsChain });
  }
  return { ok: true, ops, master, from, names: [...names] };
}
