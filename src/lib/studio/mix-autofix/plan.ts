/**
 * Stage 2 — BITEK auto-fixes for the Mix step (pure, deterministic).
 *
 * Input: project document + measured metrics + verdict (+ BPM from project).
 * Output: allowlisted Mix Working ops (ordinary FX / controls of the existing
 * chain) and first-person BITEK notes (i18n keys + params).
 *
 * Targets follow the roadmap "Auto-poprawki" section:
 *  - mix peak ≈ −6 dBTP headroom, no clipping tracks
 *  - lead vocal +1…+3 LU over the beat (target +1.5), adlibs ≈ −6 dB under
 *    the lead, doubles/backing ≈ −8 dB
 *  - vocal HPF 80–120 Hz, vocal mud cut 250 Hz, presence 3.5 kHz,
 *    beat cut 1–4 kHz (2.5 kHz bell)
 *  - de-esser 6.5 kHz (5–9 kHz band), ≤ 6 dB reduction
 *  - vocal compression 2.5–3:1, ~3–6 dB GR
 *  - delay 1/8 (lead) or 1/4 (adlibs) from BPM, deeper reverb on adlibs
 *  - lead centre, adlibs alternating L/R 40–55 %, doubles wide 70 %
 *  - gentle gate/expander (range 12–20 dB) on noisy vocals
 */

import type { StudioTrackRole } from "@/config/studio";
import type { MixMetrics, TrackMetrics } from "@/lib/studio/mix-analysis/metrics";
import type { MixCardId, MixCardStatus, MixVerdict } from "@/lib/studio/mix-analysis/verdict";
import {
  defaultStudioFxParams,
  STUDIO_FX_CHAIN_MAX_EFFECTS,
  type StudioFxChainV1,
  type StudioFxInstance,
  type StudioFxParamsByType,
  type StudioFxType,
} from "@/lib/studio/studio-fx-chain";
import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

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

export const MIX_AUTOFIX_TARGETS = {
  masterPeakDbtp: -6,
  trackPeakDbfs: -6,
  balanceLu: 1.5,
  adlibUnderLeadDb: 6,
  doubleUnderLeadDb: 8,
  maxGainStepDb: 9,
  defaultBpm: 90,
} as const;

/** Canonical insert order for new effects (existing order is preserved). */
const FX_ORDER: readonly StudioFxType[] = [
  "highpass",
  "gate",
  "tune",
  "eq",
  "compressor",
  "deesser",
  "delay",
  "reverb",
  "limiter",
];

export type MixAutofixNote = {
  /** i18n key under studio.mixStep.autofix.notes.<key> (first-person BITEK). */
  key: string;
  params: Record<string, string | number>;
};

export type MixAutofixPlan = {
  fixes: MixAutofixId[];
  ops: MixWorkingOp[];
  notes: MixAutofixNote[];
  /** Fixes that had nothing to change (for "already fine" copy). */
  unchanged: MixAutofixId[];
};

type TrackState = {
  id: string;
  name: string;
  role: StudioTrackRole;
  gainDb: number;
  pan: number;
  chain: StudioFxChainV1;
  metrics: TrackMetrics | null;
};

type State = {
  tracks: TrackState[];
  masterGainDb: number;
};

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
};

function note(ctx: Ctx, key: string, params: Record<string, string | number> = {}) {
  ctx.notes.push({ key, params });
}

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
    if (!m || !active(t)) continue;
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
  const shift = clamp(r1(T.masterPeakDbtp - tp), -12, 6);
  const needDown = tp > -3 && shift <= -1;
  const needUp = I < -35 && shift >= 1;
  if (needDown || needUp) {
    ctx.state.masterGainDb = clamp(r1(ctx.state.masterGainDb + shift), -24, 12);
    note(ctx, shift < 0 ? "gainMasterDown" : "gainMasterUp", { db: fmtDb(shift) });
  }
}

function fixBalance(ctx: Ctx): void {
  const T = MIX_AUTOFIX_TARGETS;
  const d = ctx.metrics.vocalVsBeatLu;
  const leads = ctx.state.tracks.filter((t) => t.role === "lead_vocal" && active(t));
  const beats = ctx.state.tracks.filter((t) => BEATS.includes(t.role) && active(t));
  let leadShift = 0;
  if (d !== null && Number.isFinite(d) && beats.length > 0) {
    const delta = T.balanceLu - d;
    if (Math.abs(delta) >= 0.5) {
      const vocalUp = clamp(r1(delta / 2), -T.maxGainStepDb, T.maxGainStepDb);
      const beatDown = clamp(r1(delta - vocalUp), -T.maxGainStepDb, T.maxGainStepDb);
      const voxTargets = leads.length > 0 ? leads : vocals(ctx.state);
      for (const t of voxTargets) t.gainDb = clamp(r1(t.gainDb + vocalUp), -24, 12);
      for (const t of beats) t.gainDb = clamp(r1(t.gainDb - beatDown), -24, 12);
      leadShift = vocalUp;
      if (delta > 0) note(ctx, "balanceVocalUp", { up: fmtDb(vocalUp), down: fmtDb(beatDown) });
      else note(ctx, "balanceVocalDown", { up: fmtDb(beatDown), down: fmtDb(vocalUp) });
    }
  }
  // Adlibs / doubles relative to the loudest lead.
  const leadLufs = Math.max(
    ...leads.map((t) => (t.metrics?.integratedLufs ?? -Infinity) + leadShift),
  );
  if (!Number.isFinite(leadLufs)) return;
  for (const t of ctx.state.tracks) {
    if (!active(t) || !["adlib", "double", "backing"].includes(t.role)) continue;
    const under = t.role === "adlib" ? T.adlibUnderLeadDb : T.doubleUnderLeadDb;
    const cur = t.metrics!.integratedLufs;
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
    const thresholdDb = clamp(Math.round(lufs + 2), -40, -6);
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
      note(ctx, lead ? "compLead" : "compSide", { track: t.name, ratio, threshold: thresholdDb });
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
      note(ctx, "eqBeatCut", { track: t.name, db: fmtDb(cut) });
    }
  }
  for (const t of vocals(ctx.state)) {
    const hz = t.role === "lead_vocal" ? 90 : 120;
    if (withFx(ctx, t, "highpass", () => ({ frequencyHz: hz, q: 0.707 }))) {
      note(ctx, "eqVocalHighpass", { track: t.name, hz });
    }
    if (
      withFx(ctx, t, "eq", (p) => ({
        ...p,
        low: { frequencyHz: 250, gainDb: -2, q: p.low.q },
        mid: { frequencyHz: 3500, gainDb: 2, q: 1 },
      }))
    ) {
      note(ctx, "eqVocalPresence", { track: t.name });
    }
  }
}

function fixDeesser(ctx: Ctx): void {
  const s = status(ctx.verdict, "sibilance");
  const red = s === "red";
  for (const t of vocals(ctx.state)) {
    const lufs = t.metrics!.integratedLufs;
    if (!Number.isFinite(lufs)) continue;
    const thresholdDb = clamp(Math.round(lufs - (red ? 9 : 6)), -50, -12);
    const ratio = red ? 6 : 4;
    if (withFx(ctx, t, "deesser", () => ({ frequencyHz: 6500, thresholdDb, ratio }))) {
      note(ctx, red ? "deesserStrong" : "deesserSoft", { track: t.name });
    }
  }
}

function fixDenoise(ctx: Ctx): void {
  for (const t of vocals(ctx.state)) {
    const floor = t.metrics!.noiseFloorDbfs;
    if (floor === null || floor <= -60) continue;
    const thresholdDb = clamp(Math.round(floor + 6), -90, -20);
    const rangeDb = floor > -45 ? 20 : 12;
    if (withFx(ctx, t, "gate", () => ({ thresholdDb, rangeDb, releaseMs: 150 }))) {
      note(ctx, "denoiseGate", { track: t.name, db: rangeDb });
    }
    if (!t.chain.effects.some((e) => e.type === "highpass")) {
      const hz = t.role === "lead_vocal" ? 90 : 120;
      if (withFx(ctx, t, "highpass", () => ({ frequencyHz: hz, q: 0.707 }))) {
        note(ctx, "denoiseRumble", { track: t.name, hz });
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
    if (!active(t)) continue;
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
  const decayBase = clamp(120 / bpm, 0.8, 2.5);
  for (const t of vocals(ctx.state)) {
    const lead = t.role === "lead_vocal";
    const timeMs = Math.round(clamp(lead ? quarterMs / 2 : quarterMs, 1, 2000));
    const okDelay = withFx(ctx, t, "delay", () => ({
      mix: lead ? 0.12 : 0.22,
      timeMs,
      feedback: lead ? 0.2 : 0.3,
    }));
    const decaySeconds = r1(clamp(lead ? decayBase : decayBase * 1.3, 0.1, 6));
    const okRev = withFx(ctx, t, "reverb", () => ({ mix: lead ? 0.12 : 0.25, decaySeconds }));
    if (okDelay || okRev) {
      note(ctx, lead ? "spaceLead" : "spaceSide", {
        track: t.name,
        note: lead ? "1/8" : "1/4",
        bpm: Math.round(bpm),
        ms: timeMs,
        decay: decaySeconds.toFixed(1),
      });
    }
  }
}

const RUNNERS: Record<MixAutofixId, (ctx: Ctx) => void> = {
  gain: fixGain,
  balance: fixBalance,
  compression: fixCompression,
  eq: fixEq,
  deesser: fixDeesser,
  denoise: fixDenoise,
  panorama: fixPanorama,
  space: fixSpace,
};

/** Effective BPM for sync (project tempo, sane fallback). */
export function autofixBpm(doc: StudioProjectDocument): number {
  const bpm = doc.project.tempoBpm;
  return Number.isFinite(bpm) && bpm >= 40 && bpm <= 250 ? bpm : MIX_AUTOFIX_TARGETS.defaultBpm;
}

export function planMixAutofix(params: {
  doc: StudioProjectDocument;
  metrics: MixMetrics;
  verdict: MixVerdict;
  fixes: readonly MixAutofixId[];
  createId?: () => string;
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
      pan: t.pan,
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
  };
  const order = MIX_AUTOFIX_IDS.filter((id) => params.fixes.includes(id));
  const unchanged: MixAutofixId[] = [];
  for (const id of order) {
    const before = ctx.notes.length;
    RUNNERS[id](ctx);
    if (ctx.notes.length === before) unchanged.push(id);
  }

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
    if (JSON.stringify(t.chain) !== JSON.stringify(orig.effectsChain)) {
      ops.push({ op: "set_track_fx", trackId: t.id, effectsChain: t.chain });
    }
  }
  return { fixes: order, ops, notes: ctx.notes, unchanged };
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
