/**
 * Stage 2 — BITEK auto-fixes for the Mix step (pure, deterministic).
 *
 * Input: project document + measured metrics + verdict (+ BPM from project).
 * Output: allowlisted Mix Working ops (ordinary FX / controls of the existing
 * chain) and first-person BITEK notes (i18n keys + params).
 *
 * Targets follow the roadmap "Auto-poprawki" section:
 *  - mix peak ≈ −6 dBTP headroom, no clipping tracks
 *  - lead vocal +1…+3 LU over the beat (target +1.5): the vocal moves first, up to its
 *    peak ceiling; the beat gives way only for the rest and never below −6 dB; adlibs ≈ −6 dB under
 *    the lead, doubles/backing ≈ −8 dB
 *  - vocal HPF 80–120 Hz, vocal mud cut 250 Hz, presence 3.5 kHz,
 *    beat cut 1–4 kHz (2.5 kHz bell)
 *  - de-esser 6.5 kHz (5–9 kHz band), ≤ 6 dB reduction
 *  - vocal compression 2.5–3:1, ~3–6 dB GR
 *  - 200 Hz dip (7-band EQ): −3.5 dB on vocals, −2 dB on the beat
 *  - delay 1/8 (lead) or 1/4 (adlibs) from BPM, short quiet reverb, deeper on adlibs
 *  - lead centre, adlibs alternating L/R 40–55 %, doubles wide 70 %
 *  - gentle gate/expander (~8 dB range, Producent P0 start) on noisy vocals
 */

import type { StudioTrackRole } from "@/config/studio";
import type { MixMetrics, TrackMetrics } from "@/lib/studio/mix-analysis/metrics";
import type { MixCardId, MixCardStatus, MixVerdict } from "@/lib/studio/mix-analysis/verdict";
import {
  P0_DENOISE_RANGE_DB,
  P0_GATE_ATTACK_MS,
  P0_GATE_HOLD_MS,
  P0_GATE_RELEASE_MS,
  P0_HPF_HZ,
  P0_RIDE_MAX_DB,
} from "@/lib/studio/p0-hiphop-start";
import {
  defaultStudioFxParams,
  STUDIO_FX_CHAIN_MAX_EFFECTS,
  type StudioFxChainV1,
  type StudioFxInstance,
  type StudioFxParamsByType,
  type StudioFxType,
} from "@/lib/studio/studio-fx-chain";
import { automationLane } from "@/lib/studio/studio-automation";
import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { TUNE_STYLES, type TuneKey } from "@/lib/studio/tune/tune";

export const MIX_AUTOFIX_IDS = [
  "gain",
  "balance",
  "compression",
  "eq",
  "deesser",
  "denoise",
  "panorama",
  "space",
] as const;

export type MixAutofixId = (typeof MIX_AUTOFIX_IDS)[number];

/** Pocket, rider, harmony, voice and light Tune are separate buttons. They are not part of „Popraw wszystko”. */
export type MixPlanFixId = MixAutofixId | "pocket" | "rider" | "harmony" | "voice" | "tune";

/** Which fixes a card's „Popraw” runs. `stereo` has no automatic fix. */
export const MIX_CARD_FIXES: Record<MixCardId, readonly MixAutofixId[]> = {
  loudness: ["gain"],
  clipping: ["gain"],
  balance: ["balance", "compression"],
  presence: ["eq"],
  masking: ["eq"],
  sibilance: ["deesser"],
  noise: ["denoise"],
  panorama: ["panorama"],
  stereo: [],
};

/** „Popraw wszystko” — everything incl. BPM-synced space. */
export const MIX_AUTOFIX_ALL: readonly MixAutofixId[] = MIX_AUTOFIX_IDS;

/** What „Jak Nova” turns: measured fixes plus the existing pocket and rider. Harmony stays a separate button. */
export const NOVA_PASS_FIXES: readonly MixPlanFixId[] = [...MIX_AUTOFIX_ALL, "pocket", "rider"];

export const MIX_AUTOFIX_TARGETS = {
  masterPeakDbtp: -6,
  trackPeakDbfs: -6,
  balanceLu: 1.5,
  adlibUnderLeadDb: 6,
  doubleUnderLeadDb: 8,
  maxGainStepDb: 9,
  /** Most the balance raises a vocal in one pass (the fader itself stops at +12). */
  maxVocalUpDb: 12,
  /** Raised vocal peaks stay here: under the −1 dBFS that fixGain trims, so the two never fight. */
  vocalPeakCeilDbfs: -2,
  /** The balance never takes a beat fader below this; the vocal has to come up instead. */
  beatFaderFloorDb: -6,
  defaultBpm: 90,
  /** Denoise: the voice must be this far above the noise floor for the deeper gate. */
  cleanGapDb: 24,
  /** Threshold above the RMS noise floor that clears the noise peaks. */
  noisePeakMarginDb: 20,
  /** The threshold stays at least this far under the voice, so soft syllables pass. */
  gateUnderVoiceDb: 10,
  deepGateRangeDb: 18,
  /** Dip around 200–350 Hz. */
  vocalMudCutDb: -3.5,
  beatMudCutDb: -2,
} as const;

/** Canonical insert order for new effects (existing order is preserved). */
const FX_ORDER: readonly StudioFxType[] = [
  "highpass",
  "gate",
  "tune",
  "voice",
  "harmony",
  "eq",
  "spectrum",
  "rider",
  "compressor",
  "deesser",
  "delay",
  "reverb",
  "saturate",
  "pocket",
  "limiter",
];

export type MixAutofixNote = {
  /** i18n key under studio.mixStep.autofix.notes.<key> (first-person BITEK). */
  key: string;
  params: Record<string, string | number>;
  /** Effects this note announces; when the plan clamp dropped them all, the note goes too. */
  fx?: { trackIds: readonly string[]; types: readonly StudioFxType[] };
};

export type MixAutofixPlan = {
  fixes: MixPlanFixId[];
  ops: MixWorkingOp[];
  notes: MixAutofixNote[];
  /** Fixes that had nothing to change (for "already fine" copy). */
  unchanged: MixPlanFixId[];
  /** The plan's effect limit kept at least one effect out. */
  limited: boolean;
};

type TrackState = {
  id: string;
  name: string;
  role: StudioTrackRole;
  gainDb: number;
  /** Fader when the mix was measured: gainDb − measuredGainDb = moved by earlier fixes of this pass. */
  measuredGainDb: number;
  pan: number;
  /** A drawn volume / pan curve replaces the fader / knob: moving them would change nothing. */
  gainDrawn: boolean;
  panDrawn: boolean;
  chain: StudioFxChainV1;
  metrics: TrackMetrics | null;
};

type State = {
  tracks: TrackState[];
  masterGainDb: number;
};

/** Master gain stays inside this loudness window (LUFS) when autofix moves it. */
const MASTER_QUIET_FLOOR_LUFS = -24;
const MASTER_LOUD_CEIL_LUFS = -14;

const VOCALS: readonly StudioTrackRole[] = ["lead_vocal", "adlib", "double", "backing"];
const BEATS: readonly StudioTrackRole[] = ["beat", "instrument"];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const fmtDb = (v: number) => (Math.round(Math.abs(v) * 10) / 10).toFixed(1).replace(/\.0$/, "");

function status(verdict: MixVerdict, id: MixCardId): MixCardStatus {
  return verdict.cards.find((c) => c.id === id)?.status ?? "na";
}

function severe(...s: MixCardStatus[]): "red" | "yellow" | null {
  if (s.includes("red")) return "red";
  if (s.includes("yellow")) return "yellow";
  return null;
}

function active(t: TrackState): boolean {
  return Boolean(t.metrics?.audible && t.metrics.hasAudio);
}

function vocals(state: State): TrackState[] {
  return state.tracks.filter((t) => VOCALS.includes(t.role) && active(t));
}

/** Insert or update one effect of `type` (first of that type wins). */
export function upsertFx<T extends StudioFxType>(
  chain: StudioFxChainV1,
  type: T,
  params: (prev: StudioFxParamsByType[T]) => StudioFxParamsByType[T],
  createId: () => string,
): StudioFxChainV1 | null {
  const at = chain.effects.findIndex((e) => e.type === type);
  if (at >= 0) {
    const prev = chain.effects[at] as Extract<StudioFxInstance, { type: T }>;
    const prevParams = structuredClone(prev.params) as StudioFxParamsByType[T];
    const next = { ...prev, enabled: true, params: params(prevParams) };
    const effects = chain.effects.slice();
    effects[at] = next as StudioFxInstance;
    return { ...chain, effects };
  }
  if (chain.effects.length >= STUDIO_FX_CHAIN_MAX_EFFECTS) return null;
  const effect = {
    id: createId(),
    type,
    enabled: true,
    params: params(defaultStudioFxParams(type)),
  } as StudioFxInstance;
  const rank = FX_ORDER.indexOf(type);
  let insertAt = chain.effects.length;
  for (let i = 0; i < chain.effects.length; i++) {
    const other = FX_ORDER.indexOf(chain.effects[i]!.type);
    if (other > rank) {
      insertAt = i;
      break;
    }
  }
  const effects = chain.effects.slice();
  effects.splice(insertAt, 0, effect);
  return { ...chain, effects };
}

type Ctx = {
  state: State;
  metrics: MixMetrics;
  verdict: MixVerdict;
  bpm: number;
  createId: () => string;
  notes: MixAutofixNote[];
  beatKey: TuneKey | null;
};

function note(ctx: Ctx, key: string, params: Record<string, string | number> = {}, fx?: MixAutofixNote["fx"]) {
  ctx.notes.push(fx ? { key, params, fx } : { key, params });
}

const fxOf = (t: TrackState, ...types: StudioFxType[]): MixAutofixNote["fx"] => ({ trackIds: [t.id], types });

function withFx<T extends StudioFxType>(
  ctx: Ctx,
  t: TrackState,
  type: T,
  params: (prev: StudioFxParamsByType[T]) => StudioFxParamsByType[T],
): boolean {
  const next = upsertFx(t.chain, type, params, ctx.createId);
  if (!next) {
    note(ctx, "chainFull", { track: t.name });
    return false;
  }
  if (JSON.stringify(next) === JSON.stringify(t.chain)) return false;
  t.chain = next;
  return true;
}

// ── Fixes ──────────────────────────────────────────────────────────────

function fixGain(ctx: Ctx): void {
  const T = MIX_AUTOFIX_TARGETS;
  for (const t of ctx.state.tracks) {
    const m = t.metrics;
    if (!m || !active(t) || t.gainDrawn) continue;
    if (m.clipEvents > 0 || m.samplePeakDbfs > -1) {
      const trim = clamp(r1(T.trackPeakDbfs - m.samplePeakDbfs), -12, 0);
      if (trim <= -0.5) {
        t.gainDb = clamp(r1(t.gainDb + trim), -24, 12);
        note(ctx, m.clipEvents > 0 ? "gainClipTrack" : "gainTrimTrack", { track: t.name, db: fmtDb(trim) });
      }
    }
  }
  const tp = ctx.metrics.master.truePeakDbtp;
  const I = ctx.metrics.master.integratedLufs;
  if (!Number.isFinite(tp) || !Number.isFinite(I)) return;
  let shift = clamp(r1(T.masterPeakDbtp - tp), -12, 6);
  // The track fixes above also change the level, so never push the master into a very quiet mix
  // (a -12 dB cut on top of them gave -35 LUFS) and let a later pass bring a quiet mix back up.
  // Only an extreme peak is suspect (measured before the track fixes); a small over is cut in full.
  if (shift < 0 && tp > 3) shift = Math.max(shift, Math.min(0, MASTER_QUIET_FLOOR_LUFS - I));
  if (shift > 0) shift = Math.min(shift, Math.max(0, MASTER_LOUD_CEIL_LUFS - I));
  shift = r1(shift);
  const needDown = tp > -3 && shift <= -0.5;
  const needUp = I < MASTER_QUIET_FLOOR_LUFS && tp < T.masterPeakDbtp - 3 && shift >= 1;
  if (needDown || needUp) {
    ctx.state.masterGainDb = clamp(r1(ctx.state.masterGainDb + shift), -24, 12);
    note(ctx, shift < 0 ? "gainMasterDown" : "gainMasterUp", { db: fmtDb(shift) });
  }
}

/**
 * Level at the effects' input: effects run before the fader, so the fader at measuring time comes off.
 * (Fader moves made in this pass do not reach the effects at all.)
 */
const atFxInput = (t: TrackState, level: number) => level - t.measuredGainDb;

const moved = (t: TrackState) => t.gainDb - t.measuredGainDb;

function loudest(tracks: readonly TrackState[]): TrackState | null {
  let best: TrackState | null = null;
  for (const t of tracks) if (!best || t.metrics!.integratedLufs > best.metrics!.integratedLufs) best = t;
  return best;
}

/** How far these vocals can go up: step limit, fader end and the peak ceiling. */
function vocalRoomDb(targets: readonly TrackState[]): number {
  const T = MIX_AUTOFIX_TARGETS;
  let room: number = T.maxVocalUpDb;
  for (const t of targets) {
    const peak = t.metrics!.samplePeakDbfs + moved(t);
    room = Math.min(room, 12 - t.gainDb, T.vocalPeakCeilDbfs - peak);
  }
  return Math.max(0, room);
}

/** How far the beats can go down before one reaches the floor (tracks already under it do not count). */
function beatRoomDb(beats: readonly TrackState[]): number {
  const floor = MIX_AUTOFIX_TARGETS.beatFaderFloorDb;
  const above = beats.filter((t) => t.gainDb > floor);
  return above.length === 0 ? 0 : Math.min(...above.map((t) => t.gainDb - floor));
}

function fixBalance(ctx: Ctx): void {
  const T = MIX_AUTOFIX_TARGETS;
  const d = ctx.metrics.vocalVsBeatLu;
  const leads = ctx.state.tracks.filter((t) => t.role === "lead_vocal" && active(t));
  const beats = ctx.state.tracks.filter((t) => BEATS.includes(t.role) && active(t));
  const vox = leads.length > 0 ? leads : vocals(ctx.state);
  const topVox = loudest(vox);
  const topBeat = loudest(beats);
  if (d !== null && Number.isFinite(d) && topVox && topBeat) {
    // A peak trim made earlier in this pass already changed the balance (a hot beat is −6 dB by now).
    const delta = r1(T.balanceLu - (d + moved(topVox) - moved(topBeat)));
    if (delta >= 0.5) {
      const up = topVox.gainDrawn ? 0 : r1(Math.min(delta, vocalRoomDb(vox.filter((t) => !t.gainDrawn))));
      const down = topBeat.gainDrawn ? 0 : r1(Math.min(delta - up, beatRoomDb(beats.filter((t) => !t.gainDrawn))));
      for (const t of vox) if (!t.gainDrawn) t.gainDb = clamp(r1(t.gainDb + up), -24, 12);
      // A beat or instrument already under the floor stays where it is.
      if (down > 0) for (const t of beats) if (!t.gainDrawn && t.gainDb > T.beatFaderFloorDb) t.gainDb = clamp(r1(t.gainDb - down), -24, 12);
      if (up > 0 && down > 0) note(ctx, "balanceVocalUp", { up: fmtDb(up), down: fmtDb(down) });
      else if (up > 0) note(ctx, "balanceVocalOnlyUp", { up: fmtDb(up) });
      else if (down > 0) note(ctx, "balanceBeatOnlyDown", { down: fmtDb(down) });
      const left = r1(delta - up - down);
      if (left >= 3 && topVox.gainDrawn) note(ctx, "balanceVocalDrawn", { track: topVox.name, db: fmtDb(left) });
      else if (left >= 3 && (up > 0 || down > 0)) note(ctx, "balanceVocalTooQuiet", { db: fmtDb(left) });
    } else if (delta <= -0.5) {
      // Too loud: the beat comes up only as far as its own peaks allow, the vocal does the rest.
      const beatRoom = Math.max(0, Math.min(...beats.map((t) => Math.min(12 - t.gainDb, T.trackPeakDbfs - (t.metrics!.samplePeakDbfs + moved(t))))));
      const beatUp = topBeat.gainDrawn ? 0 : r1(Math.min(-delta / 2, beatRoom, T.maxGainStepDb));
      const down = topVox.gainDrawn ? 0 : r1(Math.min(-delta - beatUp, T.maxGainStepDb));
      for (const t of vox) if (!t.gainDrawn) t.gainDb = clamp(r1(t.gainDb - down), -24, 12);
      if (beatUp > 0) for (const t of beats) if (!t.gainDrawn) t.gainDb = clamp(r1(t.gainDb + beatUp), -24, 12);
      if (beatUp > 0 && down > 0) note(ctx, "balanceVocalDown", { up: fmtDb(beatUp), down: fmtDb(down) });
      else if (down > 0) note(ctx, "balanceVocalOnlyDown", { down: fmtDb(down) });
    }
  }
  // Adlibs / doubles relative to the loudest lead.
  const leadLufs = Math.max(
    ...leads.map((t) => (t.metrics?.integratedLufs ?? -Infinity) + moved(t)),
  );
  if (!Number.isFinite(leadLufs)) return;
  for (const t of ctx.state.tracks) {
    if (!active(t) || t.gainDrawn || !["adlib", "double", "backing"].includes(t.role)) continue;
    const under = t.role === "adlib" ? T.adlibUnderLeadDb : T.doubleUnderLeadDb;
    const cur = t.metrics!.integratedLufs + moved(t);
    if (!Number.isFinite(cur)) continue;
    const step = clamp(r1(leadLufs - under - cur), -T.maxGainStepDb, T.maxGainStepDb);
    if (Math.abs(step) >= 1.5) {
      t.gainDb = clamp(r1(t.gainDb + step), -24, 12);
      note(ctx, step < 0 ? "balanceSideDown" : "balanceSideUp", {
        track: t.name,
        db: fmtDb(step),
        under,
      });
    }
  }
}

function fixCompression(ctx: Ctx): void {
  for (const t of vocals(ctx.state)) {
    const lufs = t.metrics!.integratedLufs;
    if (!Number.isFinite(lufs)) continue;
    const lead = t.role === "lead_vocal";
    const thresholdDb = clamp(Math.round(atFxInput(t, lufs) + 2), -40, -6);
    const ratio = lead ? 3 : 2.5;
    if (
      withFx(ctx, t, "compressor", () => ({
        thresholdDb,
        ratio,
        attackMs: 10,
        releaseMs: 120,
        makeupDb: 2,
      }))
    ) {
      note(ctx, lead ? "compLead" : "compSide", { track: t.name, ratio, threshold: thresholdDb }, fxOf(t, "compressor"));
    }
  }
}

function fixEq(ctx: Ctx): void {
  const sev = severe(status(ctx.verdict, "presence"), status(ctx.verdict, "masking")) ?? "yellow";
  const cut = sev === "red" ? -3.5 : -2;
  for (const t of ctx.state.tracks) {
    if (!active(t) || !BEATS.includes(t.role)) continue;
    if (
      withFx(ctx, t, "eq", (p) => ({ ...p, mid: { frequencyHz: 2500, gainDb: cut, q: 0.9 } }))
    ) {
      note(ctx, "eqBeatCut", { track: t.name, db: fmtDb(cut) }, fxOf(t, "eq"));
    }
  }
  for (const t of vocals(ctx.state)) {
    const hz = t.role === "lead_vocal" ? 90 : 120;
    if (withFx(ctx, t, "highpass", () => ({ frequencyHz: hz, q: 0.707 }))) {
      note(ctx, "eqVocalHighpass", { track: t.name, hz }, fxOf(t, "highpass"));
    }
    if (
      withFx(ctx, t, "eq", (p) => ({
        ...p,
        low: { frequencyHz: 250, gainDb: -2, q: p.low.q },
        mid: { frequencyHz: 3500, gainDb: 2, q: 1 },
      }))
    ) {
      note(ctx, "eqVocalPresence", { track: t.name }, fxOf(t, "eq"));
    }
    cutMud(ctx, t, MIX_AUTOFIX_TARGETS.vocalMudCutDb);
  }
  // The pad of the beat sits in the same place as the chest of the voice.
  if (vocals(ctx.state).length > 0) {
    for (const t of ctx.state.tracks) {
      if (active(t) && BEATS.includes(t.role)) cutMud(ctx, t, MIX_AUTOFIX_TARGETS.beatMudCutDb);
    }
  }
}

/**
 * A dip around 200–350 Hz (the 200 Hz bell of the 7-band EQ, wide enough to reach 300 Hz).
 * The 3-band EQ has only a shelf down there, which would also thin the whole low end.
 * A 7-band EQ the user (or an earlier pass) already set stays as it is.
 */
function cutMud(ctx: Ctx, t: TrackState, db: number): void {
  if (t.chain.effects.some((e) => e.type === "spectrum")) return;
  if (withFx(ctx, t, "spectrum", (p) => ({ ...p, b1: db }))) {
    note(ctx, "eqMud", { track: t.name, db: fmtDb(db) }, fxOf(t, "spectrum"));
  }
}

function fixDeesser(ctx: Ctx): void {
  const s = status(ctx.verdict, "sibilance");
  const red = s === "red";
  for (const t of vocals(ctx.state)) {
    const lufs = t.metrics!.integratedLufs;
    if (!Number.isFinite(lufs)) continue;
    const thresholdDb = clamp(Math.round(atFxInput(t, lufs) - (red ? 11 : 9)), -50, -12);
    const ratio = red ? 6 : 4;
    if (withFx(ctx, t, "deesser", () => ({ frequencyHz: 6500, thresholdDb, ratio }))) {
      note(ctx, red ? "deesserStrong" : "deesserSoft", { track: t.name }, fxOf(t, "deesser"));
    }
  }
}

/**
 * The gate listens to peaks, while the noise floor is an average (RMS): noise peaks sit about 12–14 dB
 * above it, so "floor + 6" never closed the gate (test against Cryo Mix, 2026-11-27).
 * When the voice is far above the noise, the threshold goes over the noise peaks and the cut is deeper,
 * never closer than 10 dB under the voice (word frames lose about 0.01 dB in the model of the test take). A noisy take with little room keeps the gentle old setting.
 */
export function denoiseGate(floorDbfs: number, voiceLufs: number): { thresholdDb: number; rangeDb: number } {
  const T = MIX_AUTOFIX_TARGETS;
  const gentle = { thresholdDb: clamp(Math.round(floorDbfs + 6), -90, -20), rangeDb: P0_DENOISE_RANGE_DB };
  if (!Number.isFinite(voiceLufs) || voiceLufs - floorDbfs < T.cleanGapDb) return gentle;
  const thresholdDb = clamp(Math.round(Math.min(floorDbfs + T.noisePeakMarginDb, voiceLufs - T.gateUnderVoiceDb)), -90, -20);
  return { thresholdDb, rangeDb: T.deepGateRangeDb };
}

function fixDenoise(ctx: Ctx): void {
  for (const t of vocals(ctx.state)) {
    const floor = t.metrics!.noiseFloorDbfs;
    if (floor === null || floor <= -60) continue;
    // A gate that is already on stays as it is: a later pass would measure the noise behind it and set
    // the next gate from the wrong number (looser or tighter on every round).
    const planned = denoiseGate(atFxInput(t, floor), atFxInput(t, t.metrics!.integratedLufs));
    const old = t.chain.effects.find((e) => e.type === "gate" && e.enabled);
    const { thresholdDb, rangeDb } = old?.type === "gate" ? old.params : planned;
    if (
      !old &&
      withFx(ctx, t, "gate", () => ({
        thresholdDb,
        rangeDb,
        attackMs: P0_GATE_ATTACK_MS,
        holdMs: P0_GATE_HOLD_MS,
        releaseMs: P0_GATE_RELEASE_MS,
      }))
    ) {
      note(ctx, "denoiseGate", { track: t.name, db: rangeDb }, fxOf(t, "gate"));
    }
    if (!t.chain.effects.some((e) => e.type === "highpass")) {
      if (withFx(ctx, t, "highpass", () => ({ frequencyHz: P0_HPF_HZ, q: 0.707 }))) {
        note(ctx, "denoiseRumble", { track: t.name, hz: P0_HPF_HZ }, fxOf(t, "highpass"));
      }
    }
  }
}

function fixPanorama(ctx: Ctx): void {
  const adlibPans = [-0.4, 0.4, -0.55, 0.55];
  const doublePans = [-0.7, 0.7];
  let a = 0;
  let d = 0;
  for (const t of ctx.state.tracks) {
    if (!active(t) || t.panDrawn) continue;
    let target: number | null = null;
    if (t.role === "lead_vocal") target = 0;
    else if (t.role === "adlib") target = adlibPans[a++ % adlibPans.length]!;
    else if (t.role === "double" || t.role === "backing") target = doublePans[d++ % doublePans.length]!;
    if (target === null || Math.abs(t.pan - target) < 0.05) continue;
    t.pan = target;
    if (target === 0) note(ctx, "panLeadCenter", { track: t.name });
    else
      note(ctx, target < 0 ? "panLeft" : "panRight", {
        track: t.name,
        pct: Math.round(Math.abs(target) * 100),
      });
  }
}

function fixSpace(ctx: Ctx): void {
  const bpm = ctx.bpm;
  const quarterMs = 60000 / bpm;
  // Short and quiet: long tails smeared the consonants of fast rap (test against Cryo Mix, 2026-11-27).
  const decayBase = clamp(76 / bpm, 0.6, 1.6);
  for (const t of vocals(ctx.state)) {
    const lead = t.role === "lead_vocal";
    const timeMs = Math.round(clamp(lead ? quarterMs / 2 : quarterMs, 1, 2000));
    const okDelay = withFx(ctx, t, "delay", () => ({
      mix: lead ? 0.04 : 0.16,
      timeMs,
      feedback: lead ? 0.2 : 0.3,
    }));
    const decaySeconds = r1(clamp(lead ? decayBase : decayBase * 1.3, 0.1, 6));
    const okRev = withFx(ctx, t, "reverb", () => ({ mix: lead ? 0.04 : 0.18, decaySeconds }));
    if (okDelay || okRev) {
      note(ctx, lead ? "spaceLead" : "spaceSide", {
        track: t.name,
        note: lead ? "1/8" : "1/4",
        bpm: Math.round(bpm),
        ms: timeMs,
        decay: decaySeconds.toFixed(1),
      }, fxOf(t, "delay", "reverb"));
    }
  }
}

const RUNNERS: Record<MixPlanFixId, (ctx: Ctx) => void> = {
  gain: fixGain,
  balance: fixBalance,
  compression: fixCompression,
  eq: fixEq,
  deesser: fixDeesser,
  denoise: fixDenoise,
  panorama: fixPanorama,
  space: fixSpace,
  pocket: fixPocket,
  rider: fixRider,
  harmony: fixHarmony,
  voice: fixVoice,
  tune: fixTune,
};

function fixPocket(ctx: Ctx): void {
  const leads = ctx.state.tracks.filter((t) => t.role === "lead_vocal");
  if (leads.length === 0) return;
  let changed = false;
  for (const t of leads) {
    const before = JSON.stringify(t.chain);
    const sat = upsertFx(t.chain, "saturate", (p) => p, ctx.createId);
    if (!sat) {
      note(ctx, "chainFull", { track: t.name });
      continue;
    }
    const pocket = upsertFx(sat, "pocket", (p) => p, ctx.createId);
    if (!pocket) {
      t.chain = sat;
      note(ctx, "chainFull", { track: t.name });
      continue;
    }
    t.chain = pocket;
    if (JSON.stringify(t.chain) !== before) changed = true;
  }
  if (changed) note(ctx, "pocket", {}, { trackIds: leads.map((t) => t.id), types: ["saturate", "pocket"] });
}

function fixRider(ctx: Ctx): void {
  const leads = ctx.state.tracks.filter((t) => t.role === "lead_vocal");
  if (leads.length === 0) return;
  let changed = false;
  for (const t of leads) {
    const before = JSON.stringify(t.chain);
    const next = upsertFx(
      t.chain,
      "rider",
      (p) => ({ ...p, maxBoostDb: P0_RIDE_MAX_DB, maxCutDb: P0_RIDE_MAX_DB }),
      ctx.createId,
    );
    if (!next) {
      note(ctx, "chainFull", { track: t.name });
      continue;
    }
    t.chain = next;
    if (JSON.stringify(t.chain) !== before) changed = true;
  }
  if (changed) note(ctx, "rider", {}, { trackIds: leads.map((t) => t.id), types: ["rider"] });
}

function fixVoice(ctx: Ctx): void {
  const leads = ctx.state.tracks.filter((t) => t.role === "lead_vocal");
  if (leads.length === 0) return;
  let changed = false;
  for (const t of leads) {
    const before = JSON.stringify(t.chain);
    const next = upsertFx(t.chain, "voice", (p) => p, ctx.createId);
    if (!next) {
      note(ctx, "chainFull", { track: t.name });
      continue;
    }
    t.chain = next;
    if (JSON.stringify(t.chain) !== before) changed = true;
  }
  if (changed) note(ctx, "voice", {}, { trackIds: leads.map((t) => t.id), types: ["voice"] });
}

function fixHarmony(ctx: Ctx): void {
  const leads = ctx.state.tracks.filter((t) => t.role === "lead_vocal");
  if (leads.length === 0) return;
  let changed = false;
  for (const t of leads) {
    const before = JSON.stringify(t.chain);
    const next = upsertFx(t.chain, "harmony", (p) => p, ctx.createId);
    if (!next) {
      note(ctx, "chainFull", { track: t.name });
      continue;
    }
    t.chain = next;
    if (JSON.stringify(t.chain) !== before) changed = true;
  }
  if (changed) note(ctx, "harmony", {}, { trackIds: leads.map((t) => t.id), types: ["harmony"] });
}

/** Light BRD Tune on lead (natural) — discoverability tile; no Antares. */
function fixTune(ctx: Ctx): void {
  const leads = ctx.state.tracks.filter((t) => t.role === "lead_vocal");
  if (leads.length === 0) return;
  let changed = false;
  for (const t of leads) {
    const before = JSON.stringify(t.chain);
    const next = upsertFx(
      t.chain,
      "tune",
      // A tune slot the user already has keeps its key; a new one takes the beat's key.
      (p) => ({ ...p, ...(!t.chain.effects.some((e) => e.type === "tune") && ctx.beatKey ? ctx.beatKey : {}), ...TUNE_STYLES.natural }),
      ctx.createId,
    );
    if (!next) {
      note(ctx, "chainFull", { track: t.name });
      continue;
    }
    t.chain = next;
    if (JSON.stringify(t.chain) !== before) changed = true;
  }
  if (changed) note(ctx, "tune", {}, { trackIds: leads.map((t) => t.id), types: ["tune"] });
}

/** Effective BPM for sync (project tempo, sane fallback). */
export function autofixBpm(doc: StudioProjectDocument): number {
  const bpm = doc.project.tempoBpm;
  return Number.isFinite(bpm) && bpm >= 40 && bpm <= 250 ? bpm : MIX_AUTOFIX_TARGETS.defaultBpm;
}

/** Optional effects Bitek drops first when a plan caps the chain length (least essential first). */
const CLAMP_DROP_ORDER: readonly string[] = ["saturate", "reverb", "delay", "spectrum", "pocket", "harmony", "rider", "voice", "gate", "tune", "limiter", "deesser", "highpass", "compressor", "eq"];

/**
 * Fit an auto-fixed chain to the user's plan. Only effects Bitek ADDED are dropped (never the user's own).
 * Mirrors the server rule in fxChainWriteAllowed: reject when next > cap AND next >= previous.
 * Returns null when the chain cannot be made valid (the caller then leaves the chain untouched).
 */
export function clampChainToPlan(
  chain: StudioFxChainV1,
  original: StudioFxChainV1,
  limits: { maxEffects?: number; allowSidechain?: boolean },
): StudioFxChainV1 | null {
  const originalIds = new Set(original.effects.map((e) => e.id));
  let effects = chain.effects.slice();
  if (limits.allowSidechain === false) {
    effects = effects.filter((e) => e.type !== "sidechain" || originalIds.has(e.id));
  }
  const cap = limits.maxEffects;
  if (cap !== undefined) {
    const over = () => effects.length > cap && effects.length >= original.effects.length;
    while (over()) {
      const added = effects.filter((e) => !originalIds.has(e.id));
      if (added.length === 0) return null;
      added.sort((a, b) => {
        const ia = CLAMP_DROP_ORDER.indexOf(a.type);
        const ib = CLAMP_DROP_ORDER.indexOf(b.type);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      const victim = added[0]!;
      effects = effects.filter((e) => e.id !== victim.id);
    }
  }
  return effects.length === chain.effects.length ? chain : { ...chain, effects };
}

export function planMixAutofix(params: {
  doc: StudioProjectDocument;
  metrics: MixMetrics;
  verdict: MixVerdict;
  fixes: readonly MixPlanFixId[];
  createId?: () => string;
  /** Plan limits (FREE/BRONZE: 4 effects per chain, no sidechain). Omitted = no limit. */
  maxEffects?: number;
  allowSidechain?: boolean;
  /** Key of the project's beat (light pitch correction tunes to it). */
  beatKey?: TuneKey | null;
}): MixAutofixPlan {
  const { doc, metrics, verdict } = params;
  const byId = new Map(metrics.tracks.map((m) => [m.trackId, m]));
  const state: State = {
    masterGainDb: doc.project.masterGainDb,
    tracks: doc.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.trackRole,
      gainDb: t.gainDb,
      measuredGainDb: t.gainDb,
      pan: t.pan,
      gainDrawn: automationLane(t.automation, "gainDb") !== null,
      panDrawn: automationLane(t.automation, "pan") !== null,
      chain: structuredClone(t.effectsChain),
      metrics: byId.get(t.id) ?? null,
    })),
  };
  const ctx: Ctx = {
    state,
    metrics,
    verdict,
    bpm: autofixBpm(doc),
    createId: params.createId ?? (() => crypto.randomUUID()),
    notes: [],
    beatKey: params.beatKey ?? null,
  };
  const order = ([...MIX_AUTOFIX_IDS, "pocket", "rider", "harmony", "voice", "tune"] as const).filter((id) =>
    params.fixes.includes(id),
  );
  const unchanged: MixPlanFixId[] = [];
  for (const id of order) {
    const before = ctx.notes.length;
    RUNNERS[id](ctx);
    if (ctx.notes.length === before) unchanged.push(id);
  }

  let limited = ctx.notes.some((n) => n.key === "chainFull");
  const fittedByTrack = new Map<string, StudioFxChainV1>();
  const limitNotes: MixAutofixNote[] = [];
  const ops: MixWorkingOp[] = [];
  if (state.masterGainDb !== doc.project.masterGainDb) {
    ops.push({ op: "set_master_mix", masterGainDb: state.masterGainDb });
  }
  for (const t of state.tracks) {
    const orig = doc.tracks.find((x) => x.id === t.id)!;
    const controls: Extract<MixWorkingOp, { op: "set_track_controls" }> = {
      op: "set_track_controls",
      trackId: t.id,
    };
    if (t.gainDb !== orig.gainDb) controls.gainDb = t.gainDb;
    if (t.pan !== orig.pan) controls.pan = t.pan;
    if (controls.gainDb !== undefined || controls.pan !== undefined) ops.push(controls);
    const fitted =
      params.maxEffects === undefined && params.allowSidechain === undefined
        ? t.chain
        : clampChainToPlan(t.chain, orig.effectsChain, { maxEffects: params.maxEffects, allowSidechain: params.allowSidechain });
    fittedByTrack.set(t.id, fitted ?? orig.effectsChain);
    if (fitted !== t.chain) {
      limited = true;
      limitNotes.push({ key: "planLimit", params: { track: t.name, max: params.maxEffects ?? STUDIO_FX_CHAIN_MAX_EFFECTS } });
    }
    if (fitted && JSON.stringify(fitted) !== JSON.stringify(orig.effectsChain)) {
      ops.push({ op: "set_track_fx", trackId: t.id, effectsChain: fitted });
    }
  }
  // Never announce an effect the plan limit kept out.
  const notes = ctx.notes.filter(
    (n) =>
      !n.fx ||
      n.fx.trackIds.some((id) => n.fx!.types.every((type) => fittedByTrack.get(id)?.effects.some((e) => e.type === type))),
  );
  return { fixes: order, ops, notes: [...notes, ...limitNotes], unchanged, limited };
}

/**
 * Red / yellow cards whose „Popraw” would change nothing (the effect is already on). The card must not
 * offer a button that does nothing: a red noise card then left the user stuck before Mastering.
 */
export function cardsWithNothingToFix(params: Omit<Parameters<typeof planMixAutofix>[0], "fixes" | "createId">): Set<MixCardId> {
  const out = new Set<MixCardId>();
  for (const card of params.verdict.cards) {
    const fixes = MIX_CARD_FIXES[card.id];
    if ((card.status !== "red" && card.status !== "yellow") || fixes.length === 0) continue;
    const plan = planMixAutofix({ ...params, fixes, createId: () => "probe" });
    if (plan.ops.length === 0 && !plan.limited) out.add(card.id);
  }
  return out;
}

/** Inverse ops (restore previous controls / chains) for undo. */
export function inverseMixAutofixOps(
  doc: StudioProjectDocument,
  ops: readonly MixWorkingOp[],
): MixWorkingOp[] {
  const out: MixWorkingOp[] = [];
  for (const op of ops) {
    if (op.op === "set_master_mix") {
      out.push({
        op: "set_master_mix",
        ...(op.masterGainDb !== undefined ? { masterGainDb: doc.project.masterGainDb } : {}),
        ...(op.masterPan !== undefined ? { masterPan: doc.project.masterPan } : {}),
      });
    } else if (op.op === "set_master_fx") {
      out.push({ op: "set_master_fx", effectsChain: doc.project.masterFxChain });
    } else {
      const t = doc.tracks.find((x) => x.id === op.trackId);
      if (!t) continue;
      if (op.op === "set_track_fx") {
        out.push({ op: "set_track_fx", trackId: t.id, effectsChain: t.effectsChain });
      } else {
        out.push({
          op: "set_track_controls",
          trackId: t.id,
          ...(op.gainDb !== undefined ? { gainDb: t.gainDb } : {}),
          ...(op.pan !== undefined ? { pan: t.pan } : {}),
          ...(op.muted !== undefined ? { muted: t.muted } : {}),
          ...(op.solo !== undefined ? { solo: t.solo } : {}),
        });
      }
    }
  }
  return out;
}

/** Apply ops to an in-memory document (client mirror of the server apply). */
export function applyMixOpsToDocument(
  doc: StudioProjectDocument,
  ops: readonly MixWorkingOp[],
): StudioProjectDocument {
  const project = { ...doc.project };
  const tracks = doc.tracks.map((t) => ({ ...t }));
  for (const op of ops) {
    if (op.op === "set_master_mix") {
      if (op.masterGainDb !== undefined) project.masterGainDb = op.masterGainDb;
      if (op.masterPan !== undefined) project.masterPan = op.masterPan;
    } else if (op.op === "set_master_fx") {
      project.masterFxChain = op.effectsChain;
    } else {
      const t = tracks.find((x) => x.id === op.trackId);
      if (!t) continue;
      if (op.op === "set_track_fx") t.effectsChain = op.effectsChain;
      else {
        if (op.gainDb !== undefined) t.gainDb = op.gainDb;
        if (op.pan !== undefined) t.pan = op.pan;
        if (op.muted !== undefined) t.muted = op.muted;
        if (op.solo !== undefined) t.solo = op.solo;
      }
    }
  }
  return { ...doc, project, tracks };
}
