/**
 * E3.3 / E3.4 — Mix (+ Basic Master) parameter contract.
 * STEMS / Render / Export / full Pro Master DSP out of scope.
 * E3.4: parameters.master = Plan A Basic Master only.
 */

import type { AudioCapabilityKey } from "@/config/audio-render";

export const MIX_PARAMS_VERSION = 1 as const;

export const MIX_PREVIEW_ENGINE_BASIC = "webaudio-basic-v1" as const;
export const MIX_PREVIEW_ENGINE_PRO = "webaudio-pro-v1" as const;

export type MixPreviewEngineId =
  | typeof MIX_PREVIEW_ENGINE_BASIC
  | typeof MIX_PREVIEW_ENGINE_PRO;

/** E3.4 Plan A — FREE BASIC MASTER (Impl Plan §8). */
export type MasterBasicLimiter = {
  thresholdDb: number;
  ceilingDb: number;
};

export type MasterBasicLoudness = {
  /** Preview loudness target (LUFS). Server bake / LUFS worker = later waves. */
  targetLufs: number;
};

export type MasterParameters = {
  gainDb: number;
  clipProtect: boolean;
  basicLimiter: MasterBasicLimiter;
  basicLoudness: MasterBasicLoudness;
};

export type MixSourceGainPan = {
  gainDb: number;
  pan: number;
};

export type MixBasicEq = {
  lowGainDb: number;
  midGainDb: number;
  highGainDb: number;
};

export type MixBasicCompressor = {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
};

export type MixBasicLimiter = {
  thresholdDb: number;
  ceilingDb: number;
};

export type MixBasicReverb = {
  mix: number;
  decaySeconds: number;
};

export type MixBasicDelay = {
  mix: number;
  timeMs: number;
  feedback: number;
};

export type MixProEqBand = {
  frequencyHz: number;
  gainDb: number;
  q: number;
};

export type MixProMultibandBand = {
  thresholdDb: number;
  ratio: number;
  makeupDb: number;
};

export type MixProDeEsser = {
  frequencyHz: number;
  thresholdDb: number;
  rangeDb: number;
};

export type MixProFxNode =
  | { type: "chorus"; rateHz: number; depth: number; mix: number }
  | { type: "filter"; frequencyHz: number; q: number; gainDb: number };

export type MixProParams = {
  eqBands: MixProEqBand[];
  multiband: {
    low: MixProMultibandBand;
    mid: MixProMultibandBand;
    high: MixProMultibandBand;
  };
  deEsser: MixProDeEsser;
  fxChain: MixProFxNode[];
};

/** Full persisted Mix parameters document (+ optional Basic Master). */
export type MixParameters = {
  take: MixSourceGainPan;
  beat: MixSourceGainPan;
  eq: MixBasicEq;
  compressor: MixBasicCompressor;
  limiter: MixBasicLimiter;
  reverb: MixBasicReverb;
  delay: MixBasicDelay;
  /** Present only when MIX_PRO authorized; otherwise null/omitted. */
  pro: MixProParams | null;
  /**
   * E3.4 Basic Master (OD-E34-01 Plan A).
   * Always present after parse when MASTER_BASIC allowed; defaults applied if absent.
   */
  master: MasterParameters;
};

export class MixParamsError extends Error {
  readonly code = "INVALID_PARAMS" as const;
  constructor(message: string) {
    super(message);
    this.name = "MixParamsError";
  }
}

function clampNum(n: unknown, min: number, max: number, label: string): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new MixParamsError(`${label} must be a finite number.`);
  }
  if (n < min || n > max) {
    throw new MixParamsError(`${label} out of range [${min}, ${max}].`);
  }
  return n;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MixParamsError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function defaultMixParameters(): MixParameters {
  return {
    take: { gainDb: 0, pan: 0 },
    beat: { gainDb: 0, pan: 0 },
    eq: { lowGainDb: 0, midGainDb: 0, highGainDb: 0 },
    compressor: {
      thresholdDb: -24,
      ratio: 3,
      attackMs: 10,
      releaseMs: 100,
    },
    limiter: { thresholdDb: -1, ceilingDb: -0.1 },
    reverb: { mix: 0, decaySeconds: 1.2 },
    delay: { mix: 0, timeMs: 250, feedback: 0.25 },
    pro: null,
    master: defaultMasterParameters(),
  };
}

/** E3.4 Plan A defaults — gain / clip protect / basic limiter / basic loudness. */
export function defaultMasterParameters(): MasterParameters {
  return {
    gainDb: 0,
    clipProtect: true,
    basicLimiter: { thresholdDb: -1, ceilingDb: -0.1 },
    basicLoudness: { targetLufs: -14 },
  };
}

export function defaultMixProParams(): MixProParams {
  return {
    eqBands: [
      { frequencyHz: 80, gainDb: 0, q: 0.7 },
      { frequencyHz: 250, gainDb: 0, q: 0.9 },
      { frequencyHz: 1000, gainDb: 0, q: 1 },
      { frequencyHz: 4000, gainDb: 0, q: 1 },
      { frequencyHz: 10000, gainDb: 0, q: 0.8 },
    ],
    multiband: {
      low: { thresholdDb: -24, ratio: 2, makeupDb: 0 },
      mid: { thresholdDb: -20, ratio: 2.5, makeupDb: 0 },
      high: { thresholdDb: -18, ratio: 2, makeupDb: 0 },
    },
    deEsser: { frequencyHz: 6500, thresholdDb: -30, rangeDb: 6 },
    fxChain: [],
  };
}

function parseSource(
  raw: unknown,
  label: string,
): MixSourceGainPan {
  const o = requireObject(raw, label);
  return {
    gainDb: clampNum(o.gainDb, -24, 24, `${label}.gainDb`),
    pan: clampNum(o.pan, -1, 1, `${label}.pan`),
  };
}

function parseBasicEq(raw: unknown): MixBasicEq {
  const o = requireObject(raw, "eq");
  return {
    lowGainDb: clampNum(o.lowGainDb, -12, 12, "eq.lowGainDb"),
    midGainDb: clampNum(o.midGainDb, -12, 12, "eq.midGainDb"),
    highGainDb: clampNum(o.highGainDb, -12, 12, "eq.highGainDb"),
  };
}

function parseCompressor(raw: unknown): MixBasicCompressor {
  const o = requireObject(raw, "compressor");
  return {
    thresholdDb: clampNum(o.thresholdDb, -60, 0, "compressor.thresholdDb"),
    ratio: clampNum(o.ratio, 1, 20, "compressor.ratio"),
    attackMs: clampNum(o.attackMs, 0, 200, "compressor.attackMs"),
    releaseMs: clampNum(o.releaseMs, 10, 2000, "compressor.releaseMs"),
  };
}

function parseLimiter(raw: unknown): MixBasicLimiter {
  const o = requireObject(raw, "limiter");
  return {
    thresholdDb: clampNum(o.thresholdDb, -24, 0, "limiter.thresholdDb"),
    ceilingDb: clampNum(o.ceilingDb, -6, 0, "limiter.ceilingDb"),
  };
}

function parseReverb(raw: unknown): MixBasicReverb {
  const o = requireObject(raw, "reverb");
  return {
    mix: clampNum(o.mix, 0, 1, "reverb.mix"),
    decaySeconds: clampNum(o.decaySeconds, 0.1, 6, "reverb.decaySeconds"),
  };
}

function parseDelay(raw: unknown): MixBasicDelay {
  const o = requireObject(raw, "delay");
  return {
    mix: clampNum(o.mix, 0, 1, "delay.mix"),
    timeMs: clampNum(o.timeMs, 1, 2000, "delay.timeMs"),
    feedback: clampNum(o.feedback, 0, 0.95, "delay.feedback"),
  };
}

function parseProBand(raw: unknown, i: number): MixProEqBand {
  const o = requireObject(raw, `pro.eqBands[${i}]`);
  return {
    frequencyHz: clampNum(o.frequencyHz, 20, 20000, `pro.eqBands[${i}].frequencyHz`),
    gainDb: clampNum(o.gainDb, -18, 18, `pro.eqBands[${i}].gainDb`),
    q: clampNum(o.q, 0.1, 18, `pro.eqBands[${i}].q`),
  };
}

function parseMultibandBand(raw: unknown, label: string): MixProMultibandBand {
  const o = requireObject(raw, label);
  return {
    thresholdDb: clampNum(o.thresholdDb, -60, 0, `${label}.thresholdDb`),
    ratio: clampNum(o.ratio, 1, 20, `${label}.ratio`),
    makeupDb: clampNum(o.makeupDb, -12, 12, `${label}.makeupDb`),
  };
}

function parseFxNode(raw: unknown, i: number): MixProFxNode {
  const o = requireObject(raw, `pro.fxChain[${i}]`);
  const type = o.type;
  if (type === "chorus") {
    return {
      type: "chorus",
      rateHz: clampNum(o.rateHz, 0.1, 8, `pro.fxChain[${i}].rateHz`),
      depth: clampNum(o.depth, 0, 1, `pro.fxChain[${i}].depth`),
      mix: clampNum(o.mix, 0, 1, `pro.fxChain[${i}].mix`),
    };
  }
  if (type === "filter") {
    return {
      type: "filter",
      frequencyHz: clampNum(
        o.frequencyHz,
        20,
        20000,
        `pro.fxChain[${i}].frequencyHz`,
      ),
      q: clampNum(o.q, 0.1, 18, `pro.fxChain[${i}].q`),
      gainDb: clampNum(o.gainDb, -18, 18, `pro.fxChain[${i}].gainDb`),
    };
  }
  throw new MixParamsError(`pro.fxChain[${i}].type unsupported.`);
}

function parsePro(raw: unknown): MixProParams {
  const o = requireObject(raw, "pro");
  if (!Array.isArray(o.eqBands) || o.eqBands.length < 1 || o.eqBands.length > 8) {
    throw new MixParamsError("pro.eqBands must have 1..8 bands.");
  }
  const multiband = requireObject(o.multiband, "pro.multiband");
  if (!Array.isArray(o.fxChain) || o.fxChain.length > 4) {
    throw new MixParamsError("pro.fxChain must be an array of length 0..4.");
  }
  return {
    eqBands: o.eqBands.map((b, i) => parseProBand(b, i)),
    multiband: {
      low: parseMultibandBand(multiband.low, "pro.multiband.low"),
      mid: parseMultibandBand(multiband.mid, "pro.multiband.mid"),
      high: parseMultibandBand(multiband.high, "pro.multiband.high"),
    },
    deEsser: (() => {
      const d = requireObject(o.deEsser, "pro.deEsser");
      return {
        frequencyHz: clampNum(d.frequencyHz, 2000, 12000, "pro.deEsser.frequencyHz"),
        thresholdDb: clampNum(d.thresholdDb, -60, 0, "pro.deEsser.thresholdDb"),
        rangeDb: clampNum(d.rangeDb, 0, 24, "pro.deEsser.rangeDb"),
      };
    })(),
    fxChain: o.fxChain.map((n, i) => parseFxNode(n, i)),
  };
}

function parseMaster(raw: unknown): MasterParameters {
  const o = requireObject(raw, "master");
  const allowed = new Set([
    "gainDb",
    "clipProtect",
    "basicLimiter",
    "basicLoudness",
  ]);
  for (const key of Object.keys(o)) {
    if (!allowed.has(key)) {
      throw new MixParamsError(`Unknown master parameter key: ${key}`);
    }
  }

  const defaults = defaultMasterParameters();
  const clipProtect =
    o.clipProtect === undefined ? defaults.clipProtect : o.clipProtect;
  if (typeof clipProtect !== "boolean") {
    throw new MixParamsError("master.clipProtect must be a boolean.");
  }

  const limiterRaw = o.basicLimiter ?? defaults.basicLimiter;
  const limiter = requireObject(limiterRaw, "master.basicLimiter");
  const loudnessRaw = o.basicLoudness ?? defaults.basicLoudness;
  const loudness = requireObject(loudnessRaw, "master.basicLoudness");

  return {
    gainDb: clampNum(
      o.gainDb ?? defaults.gainDb,
      -24,
      12,
      "master.gainDb",
    ),
    clipProtect,
    basicLimiter: {
      thresholdDb: clampNum(
        limiter.thresholdDb,
        -24,
        0,
        "master.basicLimiter.thresholdDb",
      ),
      ceilingDb: clampNum(
        limiter.ceilingDb,
        -6,
        0,
        "master.basicLimiter.ceilingDb",
      ),
    },
    basicLoudness: {
      targetLufs: clampNum(
        loudness.targetLufs,
        -24,
        -6,
        "master.basicLoudness.targetLufs",
      ),
    },
  };
}

/**
 * Validate and normalize Mix parameters.
 * Unknown top-level keys are rejected (deterministic contract).
 * Without MIX_PRO, `pro` must be null/absent — otherwise FORBIDDEN-class MixParamsError.
 * Without MASTER_BASIC, `master` must be absent — otherwise MixParamsError.
 * E3.4: `master` is the only new allowed top-level key (OD-E34-03).
 */
export function parseMixParameters(
  raw: unknown,
  options: { allowPro: boolean; allowMaster?: boolean },
): MixParameters {
  const allowMaster = options.allowMaster !== false;
  const o = requireObject(raw, "parameters");
  const allowed = new Set([
    "take",
    "beat",
    "eq",
    "compressor",
    "limiter",
    "reverb",
    "delay",
    "pro",
    "master",
  ]);
  for (const key of Object.keys(o)) {
    if (!allowed.has(key)) {
      throw new MixParamsError(`Unknown parameter key: ${key}`);
    }
  }

  const base: MixParameters = {
    take: parseSource(o.take ?? defaultMixParameters().take, "take"),
    beat: parseSource(o.beat ?? defaultMixParameters().beat, "beat"),
    eq: parseBasicEq(o.eq ?? defaultMixParameters().eq),
    compressor: parseCompressor(
      o.compressor ?? defaultMixParameters().compressor,
    ),
    limiter: parseLimiter(o.limiter ?? defaultMixParameters().limiter),
    reverb: parseReverb(o.reverb ?? defaultMixParameters().reverb),
    delay: parseDelay(o.delay ?? defaultMixParameters().delay),
    pro: null,
    master: defaultMasterParameters(),
  };

  if (o.pro != null) {
    if (!options.allowPro) {
      throw new MixParamsError(
        "Pro Mix parameters require MIX_PRO capability.",
      );
    }
    base.pro = parsePro(o.pro);
  }

  if (o.master != null) {
    if (!allowMaster) {
      throw new MixParamsError(
        "Master parameters require MASTER_BASIC capability.",
      );
    }
    base.master = parseMaster(o.master);
  } else if (allowMaster) {
    base.master = defaultMasterParameters();
  }

  return base;
}

export function serializeMixParameters(params: MixParameters): MixParameters {
  return JSON.parse(JSON.stringify(params)) as MixParameters;
}

export function previewEngineForCapabilities(
  capabilities: readonly AudioCapabilityKey[],
): MixPreviewEngineId {
  if (capabilities.includes("MIX_PRO")) return MIX_PREVIEW_ENGINE_PRO;
  return MIX_PREVIEW_ENGINE_BASIC;
}

/** Deterministic graph stage list for Basic Mix + Basic Master (+ optional Pro Mix). */
export function describeMixGraphStages(params: MixParameters): string[] {
  const stages = [
    "beat:source→gain→pan→masterBus",
    "take:source→gain→pan",
  ];
  if (params.pro) {
    stages.push("take:proEq→multiband→deEsser→fxChain");
  }
  stages.push(
    "take:eq→compressor→delay→reverb→masterBus",
    "masterBus→mixLimiter→basicMaster:gain→clipProtect→basicLimiter→basicLoudness→destination",
  );
  return stages;
}
