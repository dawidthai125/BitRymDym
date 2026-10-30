/**
 * Vocal sound presets (gaps P0 #3).
 *
 * A preset is ONLY a regular track FX chain v1 built from the existing
 * effect types and their validated parameter ranges — no new DSP. The same
 * chain drives the Web Audio preview (studio-fx-graph) and the E3 offline
 * render (studio-offline-fx), so preview == server render by construction.
 */
import type { StudioTrackRole } from "@/config/studio";
import {
  parseStudioFxChainForWrite,
  STUDIO_FX_CHAIN_MAX_EFFECTS,
  type StudioFxChainV1,
  type StudioFxInstance,
  type StudioFxParamsByType,
} from "@/lib/studio/studio-fx-chain";
import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import { tuneParams, type TuneKey } from "@/lib/studio/tune/tune";

export const VOCAL_PRESET_IDS = ["clean", "trap", "drill", "boombap", "lofi", "phone"] as const;
export type VocalPresetId = (typeof VOCAL_PRESET_IDS)[number];

export const VOCAL_SET_ROLES = ["lead", "doubles", "adlibs"] as const;
export type VocalSetRole = (typeof VOCAL_SET_ROLES)[number];

/** Which track roles a set slot applies to. */
export const VOCAL_SET_ROLE_TRACKS: Record<VocalSetRole, readonly StudioTrackRole[]> = {
  lead: ["lead_vocal"],
  doubles: ["double", "backing"],
  adlibs: ["adlib"],
};

type FxSpec = Omit<StudioFxInstance, "id">;

/** 1/8 note in ms at the project tempo, inside the delay range. */
function eighthMs(bpm: number): number {
  const safe = Number.isFinite(bpm) && bpm >= 40 && bpm <= 300 ? bpm : 90;
  return Math.min(2000, Math.max(1, Math.round(30000 / safe)));
}

const deesser = (thresholdDb = -28): FxSpec => ({
  type: "deesser",
  enabled: true,
  params: { frequencyHz: 6500, thresholdDb, ratio: 4 },
});

/** Options shared by built-in presets / sets. */
export type VocalPresetOptions = {
  bpm?: number;
  createId?: () => string;
  /** Beat key for BRD Tune (Trap); null/undefined = chromatic until the user picks. */
  tuneKey?: TuneKey | null;
};

function presetSpecs(id: VocalPresetId, bpm: number, tuneKey: TuneKey | null = null): FxSpec[] {
  const e = eighthMs(bpm);
  switch (id) {
    case "clean":
      return [
        { type: "highpass", enabled: true, params: { frequencyHz: 90, q: 0.707 } },
        { type: "eq", enabled: true, params: { low: { frequencyHz: 200, gainDb: -1.5, q: 0.7 }, mid: { frequencyHz: 3000, gainDb: 1.5, q: 1 }, high: { frequencyHz: 10000, gainDb: 2, q: 0.7 } } },
        { type: "compressor", enabled: true, params: { thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120, makeupDb: 3 } },
        deesser(),
        { type: "reverb", enabled: true, params: { mix: 0.1, decaySeconds: 1.2 } },
      ];
    case "trap":
      return [
        { type: "highpass", enabled: true, params: { frequencyHz: 110, q: 0.707 } },
        // BRD Tune hard style (Silver+); Free/Bronze get it clamped to natural on apply.
        { type: "tune", enabled: true, params: tuneParams(tuneKey, "hard") },
        { type: "eq", enabled: true, params: { low: { frequencyHz: 250, gainDb: -2, q: 0.7 }, mid: { frequencyHz: 3500, gainDb: 2.5, q: 1 }, high: { frequencyHz: 12000, gainDb: 3, q: 0.7 } } },
        { type: "compressor", enabled: true, params: { thresholdDb: -20, ratio: 4, attackMs: 5, releaseMs: 100, makeupDb: 4 } },
        deesser(-30),
        { type: "delay", enabled: true, params: { mix: 0.14, timeMs: e, feedback: 0.3 } },
        { type: "reverb", enabled: true, params: { mix: 0.14, decaySeconds: 1.6 } },
      ];
    case "drill":
      return [
        { type: "highpass", enabled: true, params: { frequencyHz: 120, q: 0.707 } },
        { type: "eq", enabled: true, params: { low: { frequencyHz: 300, gainDb: -3, q: 0.7 }, mid: { frequencyHz: 2500, gainDb: 2, q: 1.2 }, high: { frequencyHz: 9000, gainDb: 1.5, q: 0.7 } } },
        { type: "compressor", enabled: true, params: { thresholdDb: -22, ratio: 6, attackMs: 3, releaseMs: 80, makeupDb: 5 } },
        deesser(-30),
        { type: "delay", enabled: true, params: { mix: 0.08, timeMs: e, feedback: 0.2 } },
        { type: "reverb", enabled: true, params: { mix: 0.07, decaySeconds: 0.9 } },
      ];
    case "boombap":
      return [
        { type: "highpass", enabled: true, params: { frequencyHz: 80, q: 0.707 } },
        { type: "eq", enabled: true, params: { low: { frequencyHz: 180, gainDb: 1, q: 0.7 }, mid: { frequencyHz: 1500, gainDb: 1.5, q: 1 }, high: { frequencyHz: 9000, gainDb: -1, q: 0.7 } } },
        { type: "compressor", enabled: true, params: { thresholdDb: -16, ratio: 3, attackMs: 15, releaseMs: 150, makeupDb: 3 } },
        deesser(-26),
        { type: "reverb", enabled: true, params: { mix: 0.1, decaySeconds: 0.8 } },
      ];
    case "lofi":
      return [
        { type: "highpass", enabled: true, params: { frequencyHz: 250, q: 0.707 } },
        { type: "eq", enabled: true, params: { low: { frequencyHz: 400, gainDb: -2, q: 0.7 }, mid: { frequencyHz: 1200, gainDb: 2, q: 0.9 }, high: { frequencyHz: 6000, gainDb: -6, q: 0.7 } } },
        { type: "compressor", enabled: true, params: { thresholdDb: -20, ratio: 4, attackMs: 10, releaseMs: 150, makeupDb: 3 } },
        { type: "delay", enabled: true, params: { mix: 0.18, timeMs: Math.min(2000, e * 2), feedback: 0.35 } },
        { type: "reverb", enabled: true, params: { mix: 0.2, decaySeconds: 2 } },
      ];
    case "phone":
      return [
        { type: "highpass", enabled: true, params: { frequencyHz: 500, q: 1 } },
        { type: "eq", enabled: true, params: { low: { frequencyHz: 450, gainDb: -6, q: 0.7 }, mid: { frequencyHz: 1800, gainDb: 6, q: 1.5 }, high: { frequencyHz: 3500, gainDb: -12, q: 0.7 } } },
        { type: "compressor", enabled: true, params: { thresholdDb: -24, ratio: 8, attackMs: 2, releaseMs: 60, makeupDb: 6 } },
      ];
  }
}

function toChain(specs: FxSpec[], createId: () => string): StudioFxChainV1 {
  return parseStudioFxChainForWrite(
    { schemaVersion: 1, effects: specs.slice(0, STUDIO_FX_CHAIN_MAX_EFFECTS).map((s) => ({ ...s, id: createId() })) },
    { role: "track", createId },
  );
}

const uuid = () => crypto.randomUUID();

export function isVocalPresetId(value: unknown): value is VocalPresetId {
  return typeof value === "string" && (VOCAL_PRESET_IDS as readonly string[]).includes(value);
}

/** Built-in preset → validated track chain (fresh effect ids every call). */
export function buildVocalPresetChain(id: VocalPresetId, options: VocalPresetOptions = {}): StudioFxChainV1 {
  return toChain(presetSpecs(id, options.bpm ?? 90, options.tuneKey), options.createId ?? uuid);
}

/** Copy of a chain with fresh effect ids (own presets are re-applied many times). */
export function cloneChainWithNewIds(chain: StudioFxChainV1, createId: () => string = uuid): StudioFxChainV1 {
  return toChain(chain.effects.map(({ type, enabled, params }) => ({ type, enabled, params }) as FxSpec), createId);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Role variant of a lead chain: doubles sit thinner and further back,
 * adlibs get more space (delay/reverb). Same effect types, clamped params.
 */
export function roleVariantSpecs(specs: FxSpec[], role: VocalSetRole, bpm: number): FxSpec[] {
  if (role === "lead") return specs;
  const out = specs.map((s) => structuredClone(s)) as FxSpec[];
  for (const fx of out) {
    if (fx.type === "highpass") {
      const p = fx.params as StudioFxParamsByType["highpass"];
      p.frequencyHz = clamp(p.frequencyHz + (role === "doubles" ? 60 : 100), 20, 500);
    }
    if (fx.type === "eq") {
      const p = fx.params as StudioFxParamsByType["eq"];
      p.low.gainDb = clamp(p.low.gainDb - 2, -12, 12);
    }
    if (fx.type === "compressor") {
      const p = fx.params as StudioFxParamsByType["compressor"];
      p.ratio = clamp(p.ratio + 1, 1, 20);
    }
    if (fx.type === "reverb") {
      const p = fx.params as StudioFxParamsByType["reverb"];
      p.mix = clamp(Math.round((p.mix + (role === "adlibs" ? 0.1 : 0.05)) * 100) / 100, 0, 1);
    }
    if (fx.type === "delay" && role === "adlibs") {
      const p = fx.params as StudioFxParamsByType["delay"];
      p.mix = clamp(Math.round((p.mix + 0.1) * 100) / 100, 0, 1);
    }
  }
  if (role === "adlibs" && !out.some((f) => f.type === "delay") && out.length < STUDIO_FX_CHAIN_MAX_EFFECTS) {
    out.push({ type: "delay", enabled: true, params: { mix: 0.15, timeMs: eighthMs(bpm), feedback: 0.3 } });
  }
  return out;
}

export type VocalPresetSet = Partial<Record<VocalSetRole, StudioFxChainV1>>;

/** Built-in set = preset on the lead + derived doubles / adlibs variants. */
export function buildVocalPresetSet(id: VocalPresetId, options: VocalPresetOptions = {}): VocalPresetSet {
  const bpm = options.bpm ?? 90;
  const createId = options.createId ?? uuid;
  const base = presetSpecs(id, bpm, options.tuneKey);
  return {
    lead: toChain(roleVariantSpecs(base, "lead", bpm), createId),
    doubles: toChain(roleVariantSpecs(base, "doubles", bpm), createId),
    adlibs: toChain(roleVariantSpecs(base, "adlibs", bpm), createId),
  };
}

export function vocalSetRoleForTrack(role: StudioTrackRole): VocalSetRole | null {
  for (const slot of VOCAL_SET_ROLES) {
    if (VOCAL_SET_ROLE_TRACKS[slot].includes(role)) return slot;
  }
  return null;
}

/** One atomic mix apply: set_track_fx for every track whose role has a slot. */
export function buildVocalSetOps(
  tracks: readonly { id: string; trackRole: StudioTrackRole }[],
  set: VocalPresetSet,
  createId: () => string = uuid,
): MixWorkingOp[] {
  const ops: MixWorkingOp[] = [];
  for (const track of tracks) {
    const slot = vocalSetRoleForTrack(track.trackRole);
    const chain = slot ? set[slot] : undefined;
    if (!chain) continue;
    ops.push({ op: "set_track_fx", trackId: track.id, effectsChain: cloneChainWithNewIds(chain, createId) });
  }
  return ops;
}

/** Capture a set from the project (first track per slot that has effects). */
export function captureVocalSet(
  tracks: readonly { trackRole: StudioTrackRole; effectsChain: StudioFxChainV1 }[],
): VocalPresetSet {
  const set: VocalPresetSet = {};
  for (const track of tracks) {
    const slot = vocalSetRoleForTrack(track.trackRole);
    if (!slot || set[slot] || track.effectsChain.effects.length === 0) continue;
    set[slot] = cloneChainWithNewIds(track.effectsChain);
  }
  return set;
}

// --- Own presets (stored in studio_fx_presets) ------------------------------

export const FX_PRESET_NAME_MAX = 40;
export type FxPresetKind = "chain" | "set";
export type FxPresetPayload = { chain: StudioFxChainV1 } | { set: VocalPresetSet };
export type OwnFxPreset = { id: string; name: string; kind: FxPresetKind; payload: FxPresetPayload; createdAt: string };

export class FxPresetValidationError extends Error {
  readonly code = "FX_PRESET_INVALID" as const;
  constructor(detail: string) {
    super(`Nieprawidłowy preset: ${detail}`);
    this.name = "FxPresetValidationError";
  }
}

export function parseFxPresetName(raw: unknown): string {
  if (typeof raw !== "string") throw new FxPresetValidationError("nazwa");
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name || name.length > FX_PRESET_NAME_MAX) throw new FxPresetValidationError("nazwa");
  return name;
}

/** Validates the payload for its kind; chains go through the FX SSOT parser. */
export function parseFxPresetPayload(kind: unknown, raw: unknown): { kind: FxPresetKind; payload: FxPresetPayload } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new FxPresetValidationError("payload");
  const o = raw as Record<string, unknown>;
  const parseChain = (value: unknown, label: string) => {
    try {
      const chain = parseStudioFxChainForWrite(value, { role: "track" });
      if (chain.effects.length === 0) throw new FxPresetValidationError(`${label}: pusty łańcuch`);
      return chain;
    } catch (e) {
      if (e instanceof FxPresetValidationError) throw e;
      throw new FxPresetValidationError(label);
    }
  };
  if (kind === "chain") return { kind, payload: { chain: parseChain(o.chain, "chain") } };
  if (kind === "set") {
    const setRaw = o.set;
    if (!setRaw || typeof setRaw !== "object" || Array.isArray(setRaw)) throw new FxPresetValidationError("set");
    const set: VocalPresetSet = {};
    for (const [key, value] of Object.entries(setRaw as Record<string, unknown>)) {
      if (!(VOCAL_SET_ROLES as readonly string[]).includes(key)) throw new FxPresetValidationError(`set.${key}`);
      set[key as VocalSetRole] = parseChain(value, `set.${key}`);
    }
    if (Object.keys(set).length === 0) throw new FxPresetValidationError("set: pusty");
    return { kind, payload: { set } };
  }
  throw new FxPresetValidationError("kind");
}
