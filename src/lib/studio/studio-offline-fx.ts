/**
 * SFM-3A/3B/3C/3D — Offline Studio FX adapters (Node PCM).
 *
 * Consumes `interpretStudioFxChainForPlayback` (same plan as live graph).
 * Does NOT use E3 server-basic DSP. Does NOT claim bit-perfect Web Audio parity.
 *
 * Support matrix:
 * - eq: IMPLEMENTED (cookbook biquads; shelf Q ignored like Web Audio)
 * - compressor / limiter: IMPLEMENTED (soft-knee dynamics approx; NOT True Peak)
 * - delay: IMPLEMENTED (feedback delay line; max 2s; no BPM sync)
 * - reverb: IMPLEMENTED (shared synthetic IR + partitioned convolve; NOT True Peak)
 * - highpass: IMPLEMENTED (cookbook HPF, linear Q)
 * - deesser: IMPLEMENTED (LR4 crossover + soft-knee dynamics on high band)
 * - gate: IMPLEMENTED (rectified + LPF envelope → 1:2 expander curve, range-capped)
 * - bypass / skip slots: passthrough (matches live dry/wire audible path)
 */

import {
  interpretStudioFxChainForPlayback,
  type StudioFxInstance,
  type StudioFxPlaybackPlan,
  type StudioFxType,
} from "@/lib/studio/studio-fx-chain";
import {
  computeBiquadCoeffs,
  createStereoBiquadState,
  processBiquadCascadeBuffer,
  processStereoBiquadSample,
  STEREO_BIQUAD_STATE_BYTES,
  type BiquadCoeffs,
  type StereoBiquadState,
} from "@/lib/studio/studio-offline-fx-biquad";
import {
  createDelayLineState,
  delayBufferBytes,
  processDelaySample,
  type DelayLineState,
} from "@/lib/studio/studio-offline-fx-delay";
import {
  compressorRuntimeFromParams,
  createDynamicsState,
  dynamicsCoeffs,
  DYNAMICS_STATE_BYTES,
  limiterRuntimeFromParams,
  processDynamicsBuffer,
  processDynamicsSample,
  linearToDb,
  staticGainReductionDb,
  type DynamicsRuntimeParams,
  type DynamicsState,
} from "@/lib/studio/studio-offline-fx-dynamics";
import {
  createStereoReverbRuntime,
  processReverbBufferFresh,
  processReverbSample,
  type StereoReverbRuntime,
} from "@/lib/studio/studio-offline-fx-reverb";
import {
  deesserDynamicsSpec,
  gateEnvelopeCutoffHz,
  gateGainForEnvelope,
  LR4_SECTION_Q,
} from "@/lib/studio/studio-fx-stage2-dsp";

export const STUDIO_OFFLINE_FX_ENGINE = "studio-offline-fx-v1" as const;

/** Effects with a ready (enabled) offline DSP path. */
export const STUDIO_OFFLINE_FX_IMPLEMENTED: ReadonlySet<StudioFxType> = new Set([
  "eq",
  "compressor",
  "limiter",
  "delay",
  "reverb",
  "highpass",
  "deesser",
  "gate",
]);

export type StudioOfflineFxSupportStatus =
  | "IMPLEMENTED"
  | "UNSUPPORTED"
  | "BYPASS"
  | "SKIP";

export type StudioOfflineFxErrorCode =
  | "STUDIO_OFFLINE_FX_UNSUPPORTED"
  | "STUDIO_OFFLINE_FX_INVALID";

export class StudioOfflineFxError extends Error {
  readonly code: StudioOfflineFxErrorCode;

  constructor(code: StudioOfflineFxErrorCode, message: string) {
    super(message);
    this.name = "StudioOfflineFxError";
    this.code = code;
  }
}

/** Stereo sample in/out @ render sample rate. */
export type StudioOfflineFxSample = { left: number; right: number };

/**
 * Stateful insert processor. process() advances DSP state.
 * reset() clears retained state (not used mid-render).
 */
export type StudioOfflineFxProcessor = {
  readonly type: StudioFxType | "wire";
  readonly effectId: string | null;
  readonly status: StudioOfflineFxSupportStatus;
  /** Approximate retained state bytes (PCM plane accounting). */
  readonly stateBytes: number;
  process(sample: StudioOfflineFxSample): StudioOfflineFxSample;
  /** Optional whole-buffer path (in place) — must equal per-sample process(). */
  processBuffer?(left: Float32Array, right: Float32Array): void;
  reset(): void;
};

export type StudioOfflineFxChainHandle = {
  readonly role: "track" | "master";
  readonly plan: StudioFxPlaybackPlan;
  readonly processors: readonly StudioOfflineFxProcessor[];
  readonly stateBytes: number;
  process(sample: StudioOfflineFxSample): StudioOfflineFxSample;
  /**
   * Whole buffers in place, processor by processor (the chain is serial and
   * feed-forward, so this equals per-sample process() up to f32 rounding
   * between stages). Use on a fresh chain for a full render.
   */
  processBuffer(left: Float32Array, right: Float32Array): void;
  reset(): void;
};

/** Per-sample fallback for processors without a buffer path. */
function processBufferPerSample(
  p: StudioOfflineFxProcessor,
  left: Float32Array,
  right: Float32Array,
): void {
  if (p.status !== "IMPLEMENTED") return;
  const sample = { left: 0, right: 0 };
  const len = Math.min(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    sample.left = left[i]!;
    sample.right = right[i]!;
    const out = p.process(sample);
    left[i] = out.left;
    right[i] = out.right;
  }
}

function wireProcessor(
  status: "BYPASS" | "SKIP",
  effectId: string | null,
  type: StudioFxType | "wire" = "wire",
): StudioOfflineFxProcessor {
  return {
    type,
    effectId,
    status,
    stateBytes: 0,
    process(sample) {
      return sample;
    },
    reset() {
      /* no-op */
    },
  };
}

type EqBandRuntime = {
  coeffs: BiquadCoeffs;
  state: StereoBiquadState;
};

export function createEqProcessorAtRate(
  effect: Extract<StudioFxInstance, { type: "eq" }>,
  sampleRate: number,
): StudioOfflineFxProcessor {
  const params = effect.params;
  const bands: EqBandRuntime[] = [
    {
      coeffs: computeBiquadCoeffs(
        "lowshelf",
        sampleRate,
        params.low.frequencyHz,
        params.low.gainDb,
        params.low.q,
      ),
      state: createStereoBiquadState(),
    },
    {
      coeffs: computeBiquadCoeffs(
        "peaking",
        sampleRate,
        params.mid.frequencyHz,
        params.mid.gainDb,
        params.mid.q,
      ),
      state: createStereoBiquadState(),
    },
    {
      coeffs: computeBiquadCoeffs(
        "highshelf",
        sampleRate,
        params.high.frequencyHz,
        params.high.gainDb,
        params.high.q,
      ),
      state: createStereoBiquadState(),
    },
  ];

  return {
    type: "eq",
    effectId: effect.id,
    status: "IMPLEMENTED",
    stateBytes: STEREO_BIQUAD_STATE_BYTES * bands.length,
    process(sample) {
      let { left, right } = sample;
      for (const band of bands) {
        const out = processStereoBiquadSample(
          left,
          right,
          band.coeffs,
          band.state,
        );
        left = out.left;
        right = out.right;
      }
      return { left, right };
    },
    processBuffer(left, right) {
      const coeffs = bands.map((b) => b.coeffs);
      processBiquadCascadeBuffer(left, coeffs, bands.map((b) => b.state.left));
      processBiquadCascadeBuffer(right, coeffs, bands.map((b) => b.state.right));
    },
    reset() {
      for (const band of bands) {
        band.state = createStereoBiquadState();
      }
    },
  };
}

function createDynamicsProcessor(
  type: "compressor" | "limiter",
  effectId: string,
  runtime: DynamicsRuntimeParams,
  sampleRate: number,
): StudioOfflineFxProcessor {
  let state: DynamicsState = createDynamicsState();
  const { attackCoeff, releaseCoeff } = dynamicsCoeffs(runtime, sampleRate);
  return {
    type,
    effectId,
    status: "IMPLEMENTED",
    stateBytes: DYNAMICS_STATE_BYTES,
    process(sample) {
      return processDynamicsSample(
        sample.left,
        sample.right,
        runtime,
        state,
        sampleRate,
        attackCoeff,
        releaseCoeff,
      );
    },
    processBuffer(left, right) {
      processDynamicsBuffer(left, right, runtime, state, attackCoeff, releaseCoeff);
    },
    reset() {
      state = createDynamicsState();
    },
  };
}

export function createCompressorProcessorAtRate(
  effect: Extract<StudioFxInstance, { type: "compressor" }>,
  sampleRate: number,
): StudioOfflineFxProcessor {
  return createDynamicsProcessor(
    "compressor",
    effect.id,
    compressorRuntimeFromParams(effect.params),
    sampleRate,
  );
}

export function createLimiterProcessorAtRate(
  effect: Extract<StudioFxInstance, { type: "limiter" }>,
  sampleRate: number,
): StudioOfflineFxProcessor {
  return createDynamicsProcessor(
    "limiter",
    effect.id,
    limiterRuntimeFromParams(effect.params),
    sampleRate,
  );
}

export function createDelayProcessorAtRate(
  effect: Extract<StudioFxInstance, { type: "delay" }>,
  sampleRate: number,
): StudioOfflineFxProcessor {
  let state: DelayLineState = createDelayLineState(
    sampleRate,
    effect.params.timeMs,
  );
  const params = effect.params;
  return {
    type: "delay",
    effectId: effect.id,
    status: "IMPLEMENTED",
    stateBytes: delayBufferBytes(sampleRate, params.timeMs),
    process(sample) {
      return processDelaySample(
        sample.left,
        sample.right,
        params,
        state,
        sampleRate,
      );
    },
    reset() {
      state = createDelayLineState(sampleRate, params.timeMs);
    },
  };
}

export function createReverbProcessorAtRate(
  effect: Extract<StudioFxInstance, { type: "reverb" }>,
  sampleRate: number,
): StudioOfflineFxProcessor {
  const runtime: StereoReverbRuntime = createStereoReverbRuntime(
    effect.params,
    sampleRate,
  );
  let fresh = true;
  const self: StudioOfflineFxProcessor = {
    type: "reverb",
    effectId: effect.id,
    status: "IMPLEMENTED",
    stateBytes: runtime.stateBytes,
    process(sample) {
      fresh = false;
      return processReverbSample(sample.left, sample.right, runtime);
    },
    processBuffer(left, right) {
      if (!fresh) {
        processBufferPerSample(self, left, right);
        return;
      }
      fresh = false;
      processReverbBufferFresh(runtime, left, right);
    },
    reset() {
      fresh = true;
      runtime.resetConvolvers();
    },
  };
  return self;
}

export function createHighpassProcessorAtRate(
  effect: Extract<StudioFxInstance, { type: "highpass" }>,
  sampleRate: number,
): StudioOfflineFxProcessor {
  const coeffs = computeBiquadCoeffs(
    "highpass",
    sampleRate,
    effect.params.frequencyHz,
    0,
    effect.params.q,
  );
  let state = createStereoBiquadState();
  return {
    type: "highpass",
    effectId: effect.id,
    status: "IMPLEMENTED",
    stateBytes: STEREO_BIQUAD_STATE_BYTES,
    process(sample) {
      return processStereoBiquadSample(sample.left, sample.right, coeffs, state);
    },
    processBuffer(left, right) {
      processBiquadCascadeBuffer(left, [coeffs], [state.left]);
      processBiquadCascadeBuffer(right, [coeffs], [state.right]);
    },
    reset() {
      state = createStereoBiquadState();
    },
  };
}

const DYN_DB_TO_LN = Math.LN10 / 20;
type BiquadSt = { x1: number; x2: number; y1: number; y2: number };
type DeesserState = {
  lp1: StereoBiquadState;
  lp2: StereoBiquadState;
  hp1: StereoBiquadState;
  hp2: StereoBiquadState;
  dyn: DynamicsState;
};

function processDeesserBuffer(
  left: Float32Array,
  right: Float32Array,
  lp: BiquadCoeffs,
  hp: BiquadCoeffs,
  s: DeesserState,
  runtime: DynamicsRuntimeParams,
  attackCoeff: number,
  releaseCoeff: number,
): void {
  const st: BiquadSt[] = [s.lp1.left, s.lp2.left, s.hp1.left, s.hp2.left, s.lp1.right, s.lp2.right, s.hp1.right, s.hp2.right];
  const z = new Float64Array(32);
  for (let b = 0; b < 8; b += 1) {
    z[b * 4] = st[b]!.x1;
    z[b * 4 + 1] = st[b]!.x2;
    z[b * 4 + 2] = st[b]!.y1;
    z[b * 4 + 3] = st[b]!.y2;
  }
  const lb0 = lp.b0, lb1 = lp.b1, lb2 = lp.b2, la1 = lp.a1, la2 = lp.a2;
  const hb0 = hp.b0, hb1 = hp.b1, hb2 = hp.b2, ha1 = hp.a1, ha2 = hp.a2;
  const sec = (x: number, o: number, b0: number, b1: number, b2: number, a1: number, a2: number): number => {
    const y = b0 * x + b1 * z[o]! + b2 * z[o + 1]! - a1 * z[o + 2]! - a2 * z[o + 3]!;
    z[o + 1] = z[o]!;
    z[o] = x;
    z[o + 3] = z[o + 2]!;
    z[o + 2] = y;
    return y;
  };
  const len = Math.min(left.length, right.length);
  const W = Math.max(0, runtime.kneeDb);
  const lowDb = W > 0 ? runtime.thresholdDb - W / 2 : runtime.thresholdDb;
  const skipBelow = Number.isFinite(lowDb) ? 10 ** (lowDb / 20) * (1 - 1e-9) : 0;
  const post = runtime.postGain;
  let gainDb = s.dyn.gainDb;
  for (let i = 0; i < len; i += 1) {
    const xl = left[i]!;
    const xr = right[i]!;
    const lowL = sec(sec(xl, 0, lb0, lb1, lb2, la1, la2), 4, lb0, lb1, lb2, la1, la2);
    const highL = sec(sec(xl, 8, hb0, hb1, hb2, ha1, ha2), 12, hb0, hb1, hb2, ha1, ha2);
    const lowR = sec(sec(xr, 16, lb0, lb1, lb2, la1, la2), 20, lb0, lb1, lb2, la1, la2);
    const highR = sec(sec(xr, 24, hb0, hb1, hb2, ha1, ha2), 28, hb0, hb1, hb2, ha1, ha2);
    // = processDynamicsSample(highL, highR, …)
    const l = Number.isFinite(highL) ? highL : 0;
    const r = Number.isFinite(highR) ? highR : 0;
    const level = Math.max(Math.abs(l), Math.abs(r));
    const targetGr =
      level > 0 && level < skipBelow
        ? 0
        : staticGainReductionDb(linearToDb(level), runtime.thresholdDb, runtime.kneeDb, runtime.ratio);
    const coeff = targetGr < gainDb ? attackCoeff : releaseCoeff;
    gainDb = coeff * gainDb + (1 - coeff) * targetGr;
    if (!Number.isFinite(gainDb)) gainDb = 0;
    const g = (gainDb === 0 ? 1 : Math.exp(gainDb * DYN_DB_TO_LN)) * post;
    const ol = l * g;
    const or = r * g;
    left[i] = lowL + (Number.isFinite(ol) ? ol : 0);
    right[i] = lowR + (Number.isFinite(or) ? or : 0);
  }
  s.dyn.gainDb = gainDb;
  for (let b = 0; b < 8; b += 1) {
    st[b]!.x1 = z[b * 4]!;
    st[b]!.x2 = z[b * 4 + 1]!;
    st[b]!.y1 = z[b * 4 + 2]!;
    st[b]!.y2 = z[b * 4 + 3]!;
  }
}

export function createDeesserProcessorAtRate(
  effect: Extract<StudioFxInstance, { type: "deesser" }>,
  sampleRate: number,
): StudioOfflineFxProcessor {
  const f = effect.params.frequencyHz;
  const lp = computeBiquadCoeffs("lowpass", sampleRate, f, 0, LR4_SECTION_Q);
  const hp = computeBiquadCoeffs("highpass", sampleRate, f, 0, LR4_SECTION_Q);
  const spec = deesserDynamicsSpec(effect.params);
  const runtime: DynamicsRuntimeParams = { ...spec, postGain: 1 };
  const { attackCoeff, releaseCoeff } = dynamicsCoeffs(runtime, sampleRate);
  let s = {
    lp1: createStereoBiquadState(),
    lp2: createStereoBiquadState(),
    hp1: createStereoBiquadState(),
    hp2: createStereoBiquadState(),
    dyn: createDynamicsState(),
  };
  return {
    type: "deesser",
    effectId: effect.id,
    status: "IMPLEMENTED",
    stateBytes: STEREO_BIQUAD_STATE_BYTES * 4 + DYNAMICS_STATE_BYTES,
    process(sample) {
      const l1 = processStereoBiquadSample(sample.left, sample.right, lp, s.lp1);
      const low = processStereoBiquadSample(l1.left, l1.right, lp, s.lp2);
      const h1 = processStereoBiquadSample(sample.left, sample.right, hp, s.hp1);
      const high = processStereoBiquadSample(h1.left, h1.right, hp, s.hp2);
      const hc = processDynamicsSample(
        high.left,
        high.right,
        runtime,
        s.dyn,
        sampleRate,
        attackCoeff,
        releaseCoeff,
      );
      // LR4 bands sum in phase only with one band inverted at 2nd order;
      // with 4th order (two cascaded Butterworth) they sum allpass directly.
      return { left: low.left + hc.left, right: low.right + hc.right };
    },
    processBuffer(left, right) {
      // Fused per-sample loop (same float64 arithmetic as process(), no temporaries).
      processDeesserBuffer(left, right, lp, hp, s, runtime, attackCoeff, releaseCoeff);
    },
    reset() {
      s = {
        lp1: createStereoBiquadState(),
        lp2: createStereoBiquadState(),
        hp1: createStereoBiquadState(),
        hp2: createStereoBiquadState(),
        dyn: createDynamicsState(),
      };
    },
  };
}

export function createGateProcessorAtRate(
  effect: Extract<StudioFxInstance, { type: "gate" }>,
  sampleRate: number,
): StudioOfflineFxProcessor {
  const params = effect.params;
  const env = computeBiquadCoeffs(
    "lowpass",
    sampleRate,
    gateEnvelopeCutoffHz(params),
    0,
    Math.SQRT1_2,
  );
  let state = createStereoBiquadState();
  return {
    type: "gate",
    effectId: effect.id,
    status: "IMPLEMENTED",
    stateBytes: STEREO_BIQUAD_STATE_BYTES,
    process(sample) {
      const e = processStereoBiquadSample(
        Math.abs(sample.left),
        Math.abs(sample.right),
        env,
        state,
      );
      // Live: AudioParam input is down-mixed to mono → average channel gains.
      const g =
        (gateGainForEnvelope(e.left, params) +
          gateGainForEnvelope(e.right, params)) /
        2;
      return { left: sample.left * g, right: sample.right * g };
    },
    reset() {
      state = createStereoBiquadState();
    },
  };
}

function buildProcessorForReady(
  effect: StudioFxInstance,
  sampleRate: number,
): StudioOfflineFxProcessor {
  if (effect.type === "eq") {
    return createEqProcessorAtRate(effect, sampleRate);
  }
  if (effect.type === "compressor") {
    return createCompressorProcessorAtRate(effect, sampleRate);
  }
  if (effect.type === "limiter") {
    return createLimiterProcessorAtRate(effect, sampleRate);
  }
  if (effect.type === "delay") {
    return createDelayProcessorAtRate(effect, sampleRate);
  }
  if (effect.type === "reverb") {
    return createReverbProcessorAtRate(effect, sampleRate);
  }
  if (effect.type === "highpass") {
    return createHighpassProcessorAtRate(effect, sampleRate);
  }
  if (effect.type === "deesser") {
    return createDeesserProcessorAtRate(effect, sampleRate);
  }
  if (effect.type === "gate") {
    return createGateProcessorAtRate(effect, sampleRate);
  }
  throw new StudioOfflineFxError(
    "STUDIO_OFFLINE_FX_UNSUPPORTED",
    `Offline FX type is not implemented.`,
  );
}

/**
 * Build a series insert from raw JSONB chain (track or master).
 * Uses the same playback plan as live `buildStudioTrackFxChain`.
 *
 * Empty / null → null (caller uses dry wire).
 * Unsupported schema → throws STUDIO_OFFLINE_FX_UNSUPPORTED.
 * All Studio FX types (incl. stage 2 highpass/deesser/gate) are implemented when enabled; bypass/skip = wire.
 */
export function buildStudioOfflineFxChain(
  rawChain: unknown,
  role: "track" | "master",
  sampleRate: number,
): StudioOfflineFxChainHandle | null {
  const plan = interpretStudioFxChainForPlayback(rawChain);
  if (plan.kind === "unsupported") {
    throw new StudioOfflineFxError(
      "STUDIO_OFFLINE_FX_UNSUPPORTED",
      `Studio ${role} FX chain schema is unsupported for offline render.`,
    );
  }
  if (plan.slots.length === 0) return null;

  const processors: StudioOfflineFxProcessor[] = [];
  for (const slot of plan.slots) {
    if (slot.status === "skip") {
      processors.push(wireProcessor("SKIP", null));
      continue;
    }
    if (slot.status === "bypass") {
      // Live sets dry=1/wet=0 — audible identity without building wet DSP.
      processors.push(
        wireProcessor("BYPASS", slot.effect.id, slot.effect.type),
      );
      continue;
    }
    processors.push(buildProcessorForReady(slot.effect, sampleRate));
  }

  const stateBytes = processors.reduce((n, p) => n + p.stateBytes, 0);
  return {
    role,
    plan,
    processors,
    stateBytes,
    process(sample) {
      let cur = sample;
      for (const p of processors) {
        cur = p.process(cur);
      }
      return cur;
    },
    processBuffer(left, right) {
      for (const p of processors) {
        if (p.processBuffer) p.processBuffer(left, right);
        else processBufferPerSample(p, left, right);
      }
    },
    reset() {
      for (const p of processors) p.reset();
    },
  };
}

/** Sum retained FX state bytes for memory budgeting. */
export function studioOfflineFxStateBytes(
  chains: ReadonlyArray<StudioOfflineFxChainHandle | null>,
): number {
  let n = 0;
  for (const c of chains) {
    if (c) n += c.stateBytes;
  }
  return n;
}
