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
  processDynamicsSample,
  type DynamicsRuntimeParams,
  type DynamicsState,
} from "@/lib/studio/studio-offline-fx-dynamics";
import {
  createStereoReverbRuntime,
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
  reset(): void;
};

export type StudioOfflineFxChainHandle = {
  readonly role: "track" | "master";
  readonly plan: StudioFxPlaybackPlan;
  readonly processors: readonly StudioOfflineFxProcessor[];
  readonly stateBytes: number;
  process(sample: StudioOfflineFxSample): StudioOfflineFxSample;
  reset(): void;
};

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
  let runtime: StereoReverbRuntime = createStereoReverbRuntime(
    effect.params,
    sampleRate,
  );
  return {
    type: "reverb",
    effectId: effect.id,
    status: "IMPLEMENTED",
    stateBytes: runtime.stateBytes,
    process(sample) {
      return processReverbSample(sample.left, sample.right, runtime);
    },
    reset() {
      runtime.left.reset();
      runtime.right.reset();
    },
  };
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
    reset() {
      state = createStereoBiquadState();
    },
  };
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
