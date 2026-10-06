/**
 * P6.1 — Studio FX chain contract (JSONB v1).
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

export type StudioFxParamsByType = {
  eq: StudioFxEqParams;
  compressor: StudioFxCompressorParams;
  limiter: StudioFxLimiterParams;
  reverb: StudioFxReverbParams;
  delay: StudioFxDelayParams;
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
  | { id: string; type: "delay"; enabled: boolean; params: StudioFxDelayParams };

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
  };

export const STUDIO_FX_REGISTRY: Record<
  StudioFxType,
  { track: true; master: true }
> = {
  eq: { track: true, master: true },
  compressor: { track: true, master: true },
  limiter: { track: true, master: true },
  reverb: { track: true, master: true },
  delay: { track: true, master: true },
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

function parseEffect(
  raw: unknown,
  index: number,
  createId: () => string,
): StudioFxInstance {
  const o = requireObject(raw, `effects[${index}]`);
  assertKeys(o, EFFECT_KEYS, `effects[${index}]`);
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
  if (options.role === "master") assertMasterLimiterLast(effects);
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
      };
    }),
  );
}
