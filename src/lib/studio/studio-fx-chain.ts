/**
 * P6.1 — Studio FX chain contract (JSONB v1).
 * Stage 2 adds highpass / deesser / gate (same schemaVersion; older readers
 * treat unknown types as a "skip" slot = dry passthrough).
 * Studio-owned. Not E3 Mix. Not StudioAudioEngine graph.
 */

export const STUDIO_FX_CHAIN_SCHEMA_VERSION = 1 as const;
export const STUDIO_FX_CHAIN_MAX_EFFECTS = 8 as const;

export const STUDIO_FX_TYPES = [
  "eq",
  "compressor",
  "limiter",
  "reverb",
  "delay",
  /** Stage 2 — high-pass (low-cut) filter. */
  "highpass",
  /** Stage 2 — split-band de-esser (LR4 crossover + compressor on the high band). */
  "deesser",
  /** Stage 2 — gentle downward expander / noise gate. */
  "gate",
  /** Gaps P0 #1 — vocal pitch correction to the beat key (track only). */
  "tune",
] as const;

export type StudioFxType = (typeof STUDIO_FX_TYPES)[number];

export type StudioFxChainRole = "track" | "master";

export type StudioFxEqBand = {
  frequencyHz: number;
  gainDb: number;
  q: number;
};

export type StudioFxEqParams = {
  low: StudioFxEqBand;
  mid: StudioFxEqBand;
  high: StudioFxEqBand;
};

export type StudioFxCompressorParams = {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
};

export type StudioFxLimiterParams = {
  thresholdDb: number;
  ceilingDb: number;
};

export type StudioFxReverbParams = {
  mix: number;
  decaySeconds: number;
};

export type StudioFxDelayParams = {
  mix: number;
  timeMs: number;
  feedback: number;
};

export type StudioFxHighpassParams = {
  frequencyHz: number;
  q: number;
};

export type StudioFxDeesserParams = {
  /** Crossover frequency; band above is compressed. */
  frequencyHz: number;
  thresholdDb: number;
  ratio: number;
};

export type StudioFxGateParams = {
  /** Envelope level below which the signal is attenuated. */
  thresholdDb: number;
  /** Maximum attenuation (dB) — "gentle" gate when small. */
  rangeDb: number;
  /** Envelope smoothing (ms). */
  releaseMs: number;
};

/**
 * Pitch correction (BRD Tune). Numeric only (JSONB + generic param plumbing):
 * keyRoot 0..11 = C..B, scale 0 major / 1 minor / 2 chromatic,
 * retuneMs 0 = hard "trap" snap, amount 0..1 = how much of the error is fixed.
 */
export type StudioFxTuneParams = {
  keyRoot: number;
  scale: number;
  retuneMs: number;
  amount: number;
};

/**
 * Gold manual note correction (BRD Tune note editor). One edited note on the
 * TRACK timeline: startMs/endMs, target pitch as fractional MIDI (cents =
 * hundredths), per-note strength 0..1 and retune speed. Lives next to the
 * numeric params (not inside) so generic param plumbing stays numeric.
 */
export type StudioTuneNoteEdit = {
  startMs: number;
  endMs: number;
  targetMidi: number;
  amount: number;
  retuneMs: number;
};

export const STUDIO_TUNE_NOTES_MAX = 512 as const;
export const STUDIO_TUNE_NOTE_RANGES = {
  targetMidi: [24, 108],
  amount: [0, 1],
  retuneMs: [0, 400],
} as const;

export type StudioFxParamsByType = {
  eq: StudioFxEqParams;
  compressor: StudioFxCompressorParams;
  limiter: StudioFxLimiterParams;
  reverb: StudioFxReverbParams;
  delay: StudioFxDelayParams;
  highpass: StudioFxHighpassParams;
  deesser: StudioFxDeesserParams;
  gate: StudioFxGateParams;
  tune: StudioFxTuneParams;
};

export type StudioFxInstance =
  | { id: string; type: "eq"; enabled: boolean; params: StudioFxEqParams }
  | {
      id: string;
      type: "compressor";
      enabled: boolean;
      params: StudioFxCompressorParams;
    }
  | { id: string; type: "limiter"; enabled: boolean; params: StudioFxLimiterParams }
  | { id: string; type: "reverb"; enabled: boolean; params: StudioFxReverbParams }
  | { id: string; type: "delay"; enabled: boolean; params: StudioFxDelayParams }
  | { id: string; type: "highpass"; enabled: boolean; params: StudioFxHighpassParams }
  | { id: string; type: "deesser"; enabled: boolean; params: StudioFxDeesserParams }
  | { id: string; type: "gate"; enabled: boolean; params: StudioFxGateParams }
  | {
      id: string;
      type: "tune";
      enabled: boolean;
      params: StudioFxTuneParams;
      /** Gold manual notes (optional; absent = automatic tuning only). */
      notes?: StudioTuneNoteEdit[];
    };

export type StudioFxChainV1 = {
  schemaVersion: 1;
  effects: StudioFxInstance[];
};

export type StudioFxChainErrorCode =
  | "FX_CHAIN_INVALID"
  | "FX_CHAIN_UNSUPPORTED";

export class StudioFxChainError extends Error {
  readonly code: StudioFxChainErrorCode;

  constructor(code: StudioFxChainErrorCode, message: string) {
    super(message);
    this.name = "StudioFxChainError";
    this.code = code;
  }
}

const FX_INVALID_PL =
  "Nie udało się zapisać efektów. Sprawdź parametry i spróbuj ponownie.";
const FX_UNSUPPORTED_PL = "Ten łańcuch efektów nie jest obsługiwany.";

export const FX_CHAIN_VERSION_CONFLICT_PL =
  "Projekt został zmieniony. Odśwież Studio i spróbuj ponownie.";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CHAIN_KEYS = new Set(["schemaVersion", "effects"]);
const EFFECT_KEYS = new Set(["id", "type", "enabled", "params"]);
const TUNE_EFFECT_KEYS = new Set(["id", "type", "enabled", "params", "notes"]);
const TUNE_NOTE_KEYS = new Set(["startMs", "endMs", "targetMidi", "amount", "retuneMs"]);

/** Manual notes: sorted by start, non-overlapping, ≤ STUDIO_TUNE_NOTES_MAX. */
export function parseStudioTuneNotes(raw: unknown): StudioTuneNoteEdit[] {
  if (!Array.isArray(raw)) invalid("notes");
  if (raw.length > STUDIO_TUNE_NOTES_MAX) invalid(`notes max ${STUDIO_TUNE_NOTES_MAX}`);
  const notes = raw.map((item, i) => {
    const o = requireObject(item, `notes[${i}]`);
    assertKeys(o, TUNE_NOTE_KEYS, `notes[${i}]`);
    const startMs = finiteInRange(o.startMs, 0, 3_600_000, `notes[${i}].startMs`);
    const endMs = finiteInRange(o.endMs, 0, 3_600_000, `notes[${i}].endMs`);
    if (endMs - startMs < 10) invalid(`notes[${i}].endMs`);
    const r = STUDIO_TUNE_NOTE_RANGES;
    return {
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      targetMidi: Math.round(finiteInRange(o.targetMidi, r.targetMidi[0], r.targetMidi[1], `notes[${i}].targetMidi`) * 100) / 100,
      amount: o.amount === undefined ? 1 : finiteInRange(o.amount, r.amount[0], r.amount[1], `notes[${i}].amount`),
      retuneMs: o.retuneMs === undefined ? 0 : finiteInRange(o.retuneMs, r.retuneMs[0], r.retuneMs[1], `notes[${i}].retuneMs`),
    };
  });
  notes.sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < notes.length; i += 1) {
    if (notes[i]!.startMs < notes[i - 1]!.endMs) invalid(`notes[${i}] overlap`);
  }
  return notes;
}
const BAND_KEYS = new Set(["frequencyHz", "gainDb", "q"]);
const EQ_KEYS = new Set(["low", "mid", "high"]);
const COMP_KEYS = new Set([
  "thresholdDb",
  "ratio",
  "attackMs",
  "releaseMs",
  "makeupDb",
]);
const LIMITER_KEYS = new Set(["thresholdDb", "ceilingDb"]);
const REVERB_KEYS = new Set(["mix", "decaySeconds"]);
const DELAY_KEYS = new Set(["mix", "timeMs", "feedback"]);
const HIGHPASS_KEYS = new Set(["frequencyHz", "q"]);
const DEESSER_KEYS = new Set(["frequencyHz", "thresholdDb", "ratio"]);
const GATE_KEYS = new Set(["thresholdDb", "rangeDb", "releaseMs"]);
const TUNE_KEYS = new Set(["keyRoot", "scale", "retuneMs", "amount"]);

/** Stage 2 — parameter ranges (single source for parsers + UI sliders). */
export const STUDIO_FX_STAGE2_RANGES = {
  highpass: { frequencyHz: [20, 500], q: [0.1, 2] },
  deesser: { frequencyHz: [4000, 10000], thresholdDb: [-60, 0], ratio: [1, 20] },
  gate: { thresholdDb: [-90, -20], rangeDb: [0, 40], releaseMs: [10, 1000] },
  tune: { keyRoot: [0, 11], scale: [0, 2], retuneMs: [0, 400], amount: [0, 1] },
} as const;

export const STUDIO_FX_DEFAULTS: { [K in StudioFxType]: StudioFxParamsByType[K] } =
  {
    eq: {
      low: { frequencyHz: 120, gainDb: 0, q: 0.7 },
      mid: { frequencyHz: 1000, gainDb: 0, q: 1 },
      high: { frequencyHz: 8000, gainDb: 0, q: 0.7 },
    },
    compressor: {
      thresholdDb: -24,
      ratio: 3,
      attackMs: 10,
      releaseMs: 100,
      makeupDb: 0,
    },
    limiter: { thresholdDb: -1, ceilingDb: -0.1 },
    reverb: { mix: 0, decaySeconds: 1.2 },
    delay: { mix: 0, timeMs: 250, feedback: 0.25 },
    highpass: { frequencyHz: 90, q: 0.707 },
    deesser: { frequencyHz: 6500, thresholdDb: -30, ratio: 4 },
    gate: { thresholdDb: -55, rangeDb: 12, releaseMs: 150 },
    // Natural style (Free) — chromatic until a key is known.
    tune: { keyRoot: 0, scale: 2, retuneMs: 100, amount: 0.85 },
  };

/** Where an effect may be inserted. Pitch correction is per-voice → track only. */
export const STUDIO_FX_REGISTRY: Record<
  StudioFxType,
  { track: true; master: boolean }
> = {
  eq: { track: true, master: true },
  compressor: { track: true, master: true },
  limiter: { track: true, master: true },
  reverb: { track: true, master: true },
  delay: { track: true, master: true },
  highpass: { track: true, master: true },
  deesser: { track: true, master: true },
  gate: { track: true, master: true },
  tune: { track: true, master: false },
};

function invalid(detail?: string): never {
  throw new StudioFxChainError(
    "FX_CHAIN_INVALID",
    detail ? `${FX_INVALID_PL} (${detail})` : FX_INVALID_PL,
  );
}

function unsupported(): never {
  throw new StudioFxChainError("FX_CHAIN_UNSUPPORTED", FX_UNSUPPORTED_PL);
}

function isFxType(value: unknown): value is StudioFxType {
  return (
    typeof value === "string" &&
    (STUDIO_FX_TYPES as readonly string[]).includes(value)
  );
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(label);
  }
  return value as Record<string, unknown>;
}

function assertKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) invalid(`${label}.${key}`);
  }
}

function finiteInRange(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(label);
  if (value < min || value > max) invalid(label);
  return value;
}

function parseBand(
  raw: unknown,
  defaults: StudioFxEqBand,
  ranges: { frequencyHz: [number, number]; q: [number, number] },
  label: string,
): StudioFxEqBand {
  if (raw === undefined) return { ...defaults };
  const o = requireObject(raw, label);
  assertKeys(o, BAND_KEYS, label);
  return {
    frequencyHz:
      o.frequencyHz === undefined
        ? defaults.frequencyHz
        : finiteInRange(
            o.frequencyHz,
            ranges.frequencyHz[0],
            ranges.frequencyHz[1],
            `${label}.frequencyHz`,
          ),
    gainDb:
      o.gainDb === undefined
        ? defaults.gainDb
        : finiteInRange(o.gainDb, -12, 12, `${label}.gainDb`),
    q:
      o.q === undefined
        ? defaults.q
        : finiteInRange(o.q, ranges.q[0], ranges.q[1], `${label}.q`),
  };
}

function parseEqParams(raw: unknown): StudioFxEqParams {
  const defaults = STUDIO_FX_DEFAULTS.eq;
  if (raw === undefined) {
    return {
      low: { ...defaults.low },
      mid: { ...defaults.mid },
      high: { ...defaults.high },
    };
  }
  const o = requireObject(raw, "params");
  assertKeys(o, EQ_KEYS, "params");
  return {
    low: parseBand(o.low, defaults.low, { frequencyHz: [20, 500], q: [0.1, 12] }, "params.low"),
    mid: parseBand(
      o.mid,
      defaults.mid,
      { frequencyHz: [200, 5000], q: [0.1, 18] },
      "params.mid",
    ),
    high: parseBand(
      o.high,
      defaults.high,
      { frequencyHz: [2000, 20000], q: [0.1, 12] },
      "params.high",
    ),
  };
}

function parseCompressorParams(raw: unknown): StudioFxCompressorParams {
  const d = STUDIO_FX_DEFAULTS.compressor;
  if (raw === undefined) return { ...d };
  const o = requireObject(raw, "params");
  assertKeys(o, COMP_KEYS, "params");
  return {
    thresholdDb:
      o.thresholdDb === undefined
        ? d.thresholdDb
        : finiteInRange(o.thresholdDb, -60, 0, "params.thresholdDb"),
    ratio:
      o.ratio === undefined
        ? d.ratio
        : finiteInRange(o.ratio, 1, 20, "params.ratio"),
    attackMs:
      o.attackMs === undefined
        ? d.attackMs
        : finiteInRange(o.attackMs, 0, 200, "params.attackMs"),
    releaseMs:
      o.releaseMs === undefined
        ? d.releaseMs
        : finiteInRange(o.releaseMs, 10, 2000, "params.releaseMs"),
    makeupDb:
      o.makeupDb === undefined
        ? d.makeupDb
        : finiteInRange(o.makeupDb, -12, 12, "params.makeupDb"),
  };
}

function parseLimiterParams(raw: unknown): StudioFxLimiterParams {
  const d = STUDIO_FX_DEFAULTS.limiter;
  if (raw === undefined) return { ...d };
  const o = requireObject(raw, "params");
  assertKeys(o, LIMITER_KEYS, "params");
  return {
    thresholdDb:
      o.thresholdDb === undefined
        ? d.thresholdDb
        : finiteInRange(o.thresholdDb, -24, 0, "params.thresholdDb"),
    ceilingDb:
      o.ceilingDb === undefined
        ? d.ceilingDb
        : finiteInRange(o.ceilingDb, -6, 0, "params.ceilingDb"),
  };
}

function parseReverbParams(raw: unknown): StudioFxReverbParams {
  const d = STUDIO_FX_DEFAULTS.reverb;
  if (raw === undefined) return { ...d };
  const o = requireObject(raw, "params");
  assertKeys(o, REVERB_KEYS, "params");
  return {
    mix: o.mix === undefined ? d.mix : finiteInRange(o.mix, 0, 1, "params.mix"),
    decaySeconds:
      o.decaySeconds === undefined
        ? d.decaySeconds
        : finiteInRange(o.decaySeconds, 0.1, 6, "params.decaySeconds"),
  };
}

function parseDelayParams(raw: unknown): StudioFxDelayParams {
  const d = STUDIO_FX_DEFAULTS.delay;
  if (raw === undefined) return { ...d };
  const o = requireObject(raw, "params");
  assertKeys(o, DELAY_KEYS, "params");
  return {
    mix: o.mix === undefined ? d.mix : finiteInRange(o.mix, 0, 1, "params.mix"),
    timeMs:
      o.timeMs === undefined
        ? d.timeMs
        : finiteInRange(o.timeMs, 1, 2000, "params.timeMs"),
    feedback:
      o.feedback === undefined
        ? d.feedback
        : finiteInRange(o.feedback, 0, 0.95, "params.feedback"),
  };
}

function parseRanged<T extends Record<string, number>>(
  raw: unknown,
  defaults: T,
  keys: Set<string>,
  ranges: { [K in keyof T]: readonly [number, number] },
): T {
  if (raw === undefined) return { ...defaults };
  const o = requireObject(raw, "params");
  assertKeys(o, keys, "params");
  const out = { ...defaults } as Record<string, number>;
  for (const key of Object.keys(ranges)) {
    const [min, max] = ranges[key as keyof T];
    if (o[key] !== undefined) out[key] = finiteInRange(o[key], min, max, `params.${key}`);
  }
  return out as T;
}

function parseEffect(
  raw: unknown,
  index: number,
  createId: () => string,
): StudioFxInstance {
  const o = requireObject(raw, `effects[${index}]`);
  assertKeys(o, o.type === "tune" ? TUNE_EFFECT_KEYS : EFFECT_KEYS, `effects[${index}]`);
  if (!isFxType(o.type)) invalid(`effects[${index}].type`);
  if (typeof o.enabled !== "boolean") invalid(`effects[${index}].enabled`);
  const id =
    o.id === undefined
      ? createId()
      : typeof o.id === "string" && UUID_RE.test(o.id)
        ? o.id
        : invalid(`effects[${index}].id`);
  const type = o.type;
  if (type === "eq") {
    return { id, type, enabled: o.enabled, params: parseEqParams(o.params) };
  }
  if (type === "highpass") {
    return {
      id,
      type,
      enabled: o.enabled,
      params: parseRanged(o.params, STUDIO_FX_DEFAULTS.highpass, HIGHPASS_KEYS, STUDIO_FX_STAGE2_RANGES.highpass),
    };
  }
  if (type === "deesser") {
    return {
      id,
      type,
      enabled: o.enabled,
      params: parseRanged(o.params, STUDIO_FX_DEFAULTS.deesser, DEESSER_KEYS, STUDIO_FX_STAGE2_RANGES.deesser),
    };
  }
  if (type === "gate") {
    return {
      id,
      type,
      enabled: o.enabled,
      params: parseRanged(o.params, STUDIO_FX_DEFAULTS.gate, GATE_KEYS, STUDIO_FX_STAGE2_RANGES.gate),
    };
  }
  if (type === "tune") {
    const params = parseRanged(o.params, STUDIO_FX_DEFAULTS.tune, TUNE_KEYS, STUDIO_FX_STAGE2_RANGES.tune);
    params.keyRoot = Math.round(params.keyRoot);
    params.scale = Math.round(params.scale);
    if (o.notes === undefined) return { id, type, enabled: o.enabled, params };
    const notes = parseStudioTuneNotes(o.notes);
    return notes.length > 0 ? { id, type, enabled: o.enabled, params, notes } : { id, type, enabled: o.enabled, params };
  }
  if (type === "compressor") {
    return {
      id,
      type,
      enabled: o.enabled,
      params: parseCompressorParams(o.params),
    };
  }
  if (type === "limiter") {
    return {
      id,
      type,
      enabled: o.enabled,
      params: parseLimiterParams(o.params),
    };
  }
  if (type === "reverb") {
    return {
      id,
      type,
      enabled: o.enabled,
      params: parseReverbParams(o.params),
    };
  }
  return { id, type, enabled: o.enabled, params: parseDelayParams(o.params) };
}

function assertMasterLimiterLast(effects: StudioFxInstance[]): void {
  const enabled = effects.filter((e) => e.enabled);
  const limiterAt = enabled.findIndex((e) => e.type === "limiter");
  if (limiterAt === -1) return;
  if (limiterAt !== enabled.length - 1) {
    invalid("master limiter must be last enabled effect");
  }
}

export function emptyStudioFxChain(): StudioFxChainV1 {
  return { schemaVersion: 1, effects: [] };
}

export function defaultStudioFxParams<T extends StudioFxType>(
  type: T,
): StudioFxParamsByType[T] {
  const value = STUDIO_FX_DEFAULTS[type];
  return structuredClone(value);
}

/** GET / read: NULL and unusable documents become empty v1. Never throws. */
export function readStudioFxChain(
  raw: unknown,
  role: StudioFxChainRole = "track",
): StudioFxChainV1 {
  if (raw == null) return emptyStudioFxChain();
  try {
    return parseStudioFxChainForWrite(raw, { role });
  } catch {
    return emptyStudioFxChain();
  }
}

export function parseStudioFxChainForWrite(
  raw: unknown,
  options: { role: StudioFxChainRole; createId?: () => string },
): StudioFxChainV1 {
  const o = requireObject(raw, "chain");
  assertKeys(o, CHAIN_KEYS, "chain");
  if (o.schemaVersion !== STUDIO_FX_CHAIN_SCHEMA_VERSION) unsupported();
  if (!Array.isArray(o.effects)) invalid("effects");
  if (o.effects.length > STUDIO_FX_CHAIN_MAX_EFFECTS) invalid("max 8");
  const createId = options.createId ?? (() => crypto.randomUUID());
  const effects = o.effects.map((item, index) =>
    parseEffect(item, index, createId),
  );
  const ids = new Set<string>();
  for (const effect of effects) {
    if (ids.has(effect.id)) invalid("duplicate id");
    ids.add(effect.id);
  }
  if (options.role === "master") {
    assertMasterLimiterLast(effects);
    if (effects.some((e) => !STUDIO_FX_REGISTRY[e.type].master)) invalid("track-only effect on master");
  }
  return { schemaVersion: 1, effects };
}

export function parseExpectedDocumentVersion(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    invalid("expectedDocumentVersion");
  }
  return raw;
}

export class StudioFxCasConflictError extends Error {
  readonly code = "FX_CHAIN_VERSION_CONFLICT" as const;

  constructor() {
    super(FX_CHAIN_VERSION_CONFLICT_PL);
    this.name = "StudioFxCasConflictError";
  }
}

export function assertStudioFxCasMatch(params: {
  currentVersion: number;
  expectedDocumentVersion: number;
}): { nextVersion: number } {
  if (params.expectedDocumentVersion !== params.currentVersion) {
    throw new StudioFxCasConflictError();
  }
  return { nextVersion: params.currentVersion + 1 };
}

/** In-memory CAS apply — SSOT algorithm for tests and service planning. */
export function applyStudioFxCasToState<T extends { documentVersion: number }>(
  state: T,
  expectedDocumentVersion: number,
  mutate: (next: T) => void,
): T {
  assertStudioFxCasMatch({
    currentVersion: state.documentVersion,
    expectedDocumentVersion,
  });
  const next = { ...state, documentVersion: state.documentVersion + 1 };
  mutate(next);
  return next;
}

export type StudioFxPlaybackSkipCode =
  | "AUDIO_FX_UNKNOWN_TYPE"
  | "AUDIO_FX_INVALID_PARAMS";

export type StudioFxPlaybackSlot =
  | { status: "ready"; effect: StudioFxInstance }
  | { status: "bypass"; effect: StudioFxInstance }
  | { status: "skip"; code: StudioFxPlaybackSkipCode };

export type StudioFxPlaybackPlan =
  | { kind: "unsupported"; code: "AUDIO_FX_CHAIN_UNSUPPORTED"; slots: [] }
  | { kind: "chain"; slots: StudioFxPlaybackSlot[] };

export function tryParseStudioFxInstance(
  raw: unknown,
  index: number,
):
  | { ok: true; effect: StudioFxInstance }
  | { ok: false; reason: "unknown_type" | "invalid" } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "invalid" };
  }
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== "string" || !isFxType(type)) {
    return { ok: false, reason: "unknown_type" };
  }
  try {
    return {
      ok: true,
      effect: parseEffect(raw, index, () => crypto.randomUUID()),
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/** Runtime read path: never throws. Fail-closed per slot. Does not mutate persistence. */
export function interpretStudioFxChainForPlayback(
  raw: unknown,
): StudioFxPlaybackPlan {
  if (raw == null) {
    return { kind: "chain", slots: [] };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "unsupported", code: "AUDIO_FX_CHAIN_UNSUPPORTED", slots: [] };
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== STUDIO_FX_CHAIN_SCHEMA_VERSION || !Array.isArray(o.effects)) {
    return { kind: "unsupported", code: "AUDIO_FX_CHAIN_UNSUPPORTED", slots: [] };
  }
  const items = o.effects.slice(0, STUDIO_FX_CHAIN_MAX_EFFECTS);
  const slots: StudioFxPlaybackSlot[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const parsed = tryParseStudioFxInstance(items[i], i);
    if (!parsed.ok) {
      slots.push({
        status: "skip",
        code:
          parsed.reason === "unknown_type"
            ? "AUDIO_FX_UNKNOWN_TYPE"
            : "AUDIO_FX_INVALID_PARAMS",
      });
      continue;
    }
    if (!parsed.effect.enabled) {
      slots.push({ status: "bypass", effect: parsed.effect });
      continue;
    }
    slots.push({ status: "ready", effect: parsed.effect });
  }
  return { kind: "chain", slots };
}

export function studioFxPlaybackFingerprint(plan: StudioFxPlaybackPlan): string {
  if (plan.kind === "unsupported") return "unsupported";
  return JSON.stringify(
    plan.slots.map((slot) => {
      if (slot.status === "skip") return { status: "skip", code: slot.code };
      return {
        status: slot.status,
        id: slot.effect.id,
        type: slot.effect.type,
        enabled: slot.effect.enabled,
        params: slot.effect.params,
        ...(slot.effect.type === "tune" && slot.effect.notes ? { notes: slot.effect.notes } : {}),
      };
    }),
  );
}

/** P6.4.2 — UI metadata derived from the same ranges as parsers (render only). */
export type StudioFxUiParamMeta = {
  path: string;
  labelPl: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  kind: "slider";
};

export type StudioFxUiTypeMeta = {
  labelPl: string;
  params: StudioFxUiParamMeta[];
};

function slider(
  path: string,
  labelPl: string,
  min: number,
  max: number,
  step: number,
  unit: string,
): StudioFxUiParamMeta {
  return { path, labelPl, min, max, step, unit, kind: "slider" };
}

export const STUDIO_FX_UI_META: { [K in StudioFxType]: StudioFxUiTypeMeta } = {
  eq: {
    labelPl: "EQ",
    params: [
      slider("low.frequencyHz", "Bass · częstotliwość", 20, 500, 1, "Hz"),
      slider("low.gainDb", "Bass · głośność", -12, 12, 0.1, "dB"),
      slider("low.q", "Bass · Q", 0.1, 12, 0.1, "Q"),
      slider("mid.frequencyHz", "Środek · częstotliwość", 200, 5000, 1, "Hz"),
      slider("mid.gainDb", "Środek · głośność", -12, 12, 0.1, "dB"),
      slider("mid.q", "Środek · Q", 0.1, 18, 0.1, "Q"),
      slider("high.frequencyHz", "Góra · częstotliwość", 2000, 20000, 1, "Hz"),
      slider("high.gainDb", "Góra · głośność", -12, 12, 0.1, "dB"),
      slider("high.q", "Góra · Q", 0.1, 12, 0.1, "Q"),
    ],
  },
  compressor: {
    labelPl: "Kompresor",
    params: [
      slider("thresholdDb", "Próg", -60, 0, 0.5, "dB"),
      slider("ratio", "Stopień kompresji", 1, 20, 0.1, ":1"),
      slider("attackMs", "Atak", 0, 200, 1, "ms"),
      slider("releaseMs", "Zwolnienie", 10, 2000, 1, "ms"),
      slider("makeupDb", "Wyrównanie", -12, 12, 0.1, "dB"),
    ],
  },
  limiter: {
    labelPl: "Limiter",
    params: [
      slider("thresholdDb", "Próg", -24, 0, 0.1, "dB"),
      slider("ceilingDb", "Sufit", -6, 0, 0.1, "dB"),
    ],
  },
  reverb: {
    labelPl: "Pogłos",
    params: [
      slider("mix", "Poziom efektu", 0, 1, 0.01, ""),
      slider("decaySeconds", "Zanikanie", 0.1, 6, 0.1, "s"),
    ],
  },
  delay: {
    labelPl: "Delay",
    params: [
      slider("mix", "Poziom efektu", 0, 1, 0.01, ""),
      slider("timeMs", "Czas", 1, 2000, 1, "ms"),
      slider("feedback", "Sprzężenie", 0, 0.95, 0.01, ""),
    ],
  },
  highpass: {
    labelPl: "Filtr górnoprzepustowy",
    params: [
      slider("frequencyHz", "Częstotliwość odcięcia", 20, 500, 1, "Hz"),
      slider("q", "Q", 0.1, 2, 0.01, "Q"),
    ],
  },
  deesser: {
    labelPl: "De-esser",
    params: [
      slider("frequencyHz", "Częstotliwość sybilantów", 4000, 10000, 10, "Hz"),
      slider("thresholdDb", "Próg", -60, 0, 0.5, "dB"),
      slider("ratio", "Stopień kompresji", 1, 20, 0.1, ":1"),
    ],
  },
  gate: {
    labelPl: "Bramka szumów",
    params: [
      slider("thresholdDb", "Próg", -90, -20, 0.5, "dB"),
      slider("rangeDb", "Maks. tłumienie", 0, 40, 0.5, "dB"),
      slider("releaseMs", "Wygładzanie", 10, 1000, 1, "ms"),
    ],
  },
  // Key/scale use dedicated pickers (StudioTunePanel); sliders = Silver+ controls.
  tune: {
    labelPl: "Strojenie wokalu",
    params: [
      slider("retuneMs", "Szybkość strojenia", 0, 400, 1, "ms"),
      slider("amount", "Siła", 0, 1, 0.01, ""),
    ],
  },
};

export const FX_CHAIN_CONFLICT_UI_PL =
  "Projekt został zmieniony w innej sesji. Odśwież dane i spróbuj ponownie.";

export function studioFxLabelPl(type: StudioFxType): string {
  return STUDIO_FX_UI_META[type].labelPl;
}

/** Compact Mix entry label: count + optional bypass hint (P6.4.3). */
export function studioFxEntryLabel(chain: StudioFxChainV1): string {
  const count = chain.effects.length;
  if (count === 0) return "FX";
  const bypassed = chain.effects.filter((e) => !e.enabled).length;
  if (bypassed === 0) return `FX (${count})`;
  return `FX (${count}, ${bypassed} wył.)`;
}

export function studioFxBypassedCount(chain: StudioFxChainV1): number {
  return chain.effects.filter((e) => !e.enabled).length;
}

export function getStudioFxParamValue(
  params: StudioFxInstance["params"],
  path: string,
): number {
  const parts = path.split(".");
  let cur: unknown = params;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return 0;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "number" && Number.isFinite(cur) ? cur : 0;
}

export function setStudioFxParamValue(
  params: StudioFxInstance["params"],
  path: string,
  value: number,
): StudioFxInstance["params"] {
  const parts = path.split(".");
  const root = structuredClone(params) as Record<string, unknown>;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (!next || typeof next !== "object") {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
  return root as StudioFxInstance["params"];
}

export function createStudioFxInstance(
  type: StudioFxType,
  createId: () => string = () => crypto.randomUUID(),
): StudioFxInstance {
  const id = createId();
  switch (type) {
    case "eq":
      return { id, type, enabled: true, params: defaultStudioFxParams("eq") };
    case "compressor":
      return {
        id,
        type,
        enabled: true,
        params: defaultStudioFxParams("compressor"),
      };
    case "limiter":
      return {
        id,
        type,
        enabled: true,
        params: defaultStudioFxParams("limiter"),
      };
    case "reverb":
      return {
        id,
        type,
        enabled: true,
        params: defaultStudioFxParams("reverb"),
      };
    case "delay":
      return {
        id,
        type,
        enabled: true,
        params: defaultStudioFxParams("delay"),
      };
    case "highpass":
      return { id, type, enabled: true, params: defaultStudioFxParams("highpass") };
    case "deesser":
      return { id, type, enabled: true, params: defaultStudioFxParams("deesser") };
    case "gate":
      return { id, type, enabled: true, params: defaultStudioFxParams("gate") };
    case "tune":
      return { id, type, enabled: true, params: defaultStudioFxParams("tune") };
  }
}

/** Master: enabled limiter must remain last among enabled effects. */
export function canMoveStudioFx(
  chain: StudioFxChainV1,
  index: number,
  direction: "up" | "down",
  role: StudioFxChainRole,
): boolean {
  const effects = chain.effects;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= effects.length) return false;
  if (swapWith < 0 || swapWith >= effects.length) return false;
  if (role !== "master") return true;
  const next = [...effects];
  const tmp = next[index]!;
  next[index] = next[swapWith]!;
  next[swapWith] = tmp;
  try {
    assertMasterLimiterLast(next);
    return true;
  } catch {
    return false;
  }
}

export function moveStudioFx(
  chain: StudioFxChainV1,
  index: number,
  direction: "up" | "down",
  role: StudioFxChainRole,
): StudioFxChainV1 {
  if (!canMoveStudioFx(chain, index, direction, role)) {
    return chain;
  }
  const effects = [...chain.effects];
  const swapWith = direction === "up" ? index - 1 : index + 1;
  const tmp = effects[index]!;
  effects[index] = effects[swapWith]!;
  effects[swapWith] = tmp;
  return { schemaVersion: 1, effects };
}

export function addStudioFxToChain(
  chain: StudioFxChainV1,
  type: StudioFxType,
  role: StudioFxChainRole,
  createId: () => string = () => crypto.randomUUID(),
): StudioFxChainV1 {
  if (chain.effects.length >= STUDIO_FX_CHAIN_MAX_EFFECTS) {
    throw new StudioFxChainError("FX_CHAIN_INVALID", "Maksymalnie 8 efektów.");
  }
  if (role === "master" && !STUDIO_FX_REGISTRY[type].master) invalid("track-only effect on master");
  const effect = createStudioFxInstance(type, createId);
  const effects = [...chain.effects];
  if (role === "master") {
    if (type === "limiter") {
      effects.push(effect);
    } else {
      const last = effects[effects.length - 1];
      if (last?.type === "limiter" && last.enabled) {
        effects.splice(effects.length - 1, 0, effect);
      } else {
        effects.push(effect);
      }
    }
    assertMasterLimiterLast(effects);
  } else {
    effects.push(effect);
  }
  return { schemaVersion: 1, effects };
}

export function removeStudioFxFromChain(
  chain: StudioFxChainV1,
  effectId: string,
): StudioFxChainV1 {
  return {
    schemaVersion: 1,
    effects: chain.effects.filter((e) => e.id !== effectId),
  };
}

export function setStudioFxEnabled(
  chain: StudioFxChainV1,
  effectId: string,
  enabled: boolean,
  role: StudioFxChainRole,
): StudioFxChainV1 {
  const effects = chain.effects.map((e) =>
    e.id === effectId ? { ...e, enabled } : e,
  ) as StudioFxInstance[];
  if (role === "master") assertMasterLimiterLast(effects);
  return { schemaVersion: 1, effects };
}

export function setStudioFxParams(
  chain: StudioFxChainV1,
  effectId: string,
  params: StudioFxInstance["params"],
): StudioFxChainV1 {
  const effects = chain.effects.map((e) =>
    e.id === effectId ? ({ ...e, params } as StudioFxInstance) : e,
  );
  return { schemaVersion: 1, effects };
}
