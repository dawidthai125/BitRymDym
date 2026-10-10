/**
 * SFM-3C — Offline dynamics approximating Studio live inserts.
 *
 * Live wiring (`studio-fx-graph.ts`):
 * - compressor → DynamicsCompressorNode (knee=6) + makeup Gain
 * - limiter → DynamicsCompressorNode (ratio=20, knee=0, attack=3ms, release=50ms)
 *   + ceiling Gain — NOT True Peak / NOT LUFS / NOT brickwall oversampling
 *
 * This Node path uses a deterministic soft-knee feed-forward compressor with
 * linked-stereo peak detection. It is NOT bit-identical to browser
 * DynamicsCompressorNode (pre-delay, detector filtering, internal knee shape).
 */

import type {
  StudioFxCompressorParams,
  StudioFxLimiterParams,
} from "@/lib/studio/studio-fx-chain";

const EPS = 1e-12;
const DB_FLOOR = -100;

/** Retained state: envelopeDb + gainDb (+ padding) ≈ 16 bytes. */
export const DYNAMICS_STATE_BYTES = 16;

export type DynamicsRuntimeParams = {
  thresholdDb: number;
  ratio: number;
  kneeDb: number;
  attackSec: number;
  releaseSec: number;
  /** Post-dynamics linear gain (makeup or ceiling). */
  postGain: number;
};

export type DynamicsState = {
  /** Smoothed gain reduction in dB (≤ 0). */
  gainDb: number;
};

export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

export function linearToDb(linear: number): number {
  const a = Math.abs(linear);
  if (!(a > 0) || !Number.isFinite(a)) return DB_FLOOR;
  return 20 * Math.log10(Math.max(a, EPS));
}

/**
 * Soft-knee static curve (Giannoulis / common DAW form used by Web Audio docs).
 * Returns output level in dB for input level xDb.
 */
export function softKneeOutputDb(
  xDb: number,
  thresholdDb: number,
  kneeDb: number,
  ratio: number,
): number {
  const R = Math.max(1, ratio);
  const W = Math.max(0, kneeDb);
  const T = thresholdDb;
  if (!(Number.isFinite(xDb) && Number.isFinite(T) && Number.isFinite(W))) {
    return xDb;
  }
  if (W <= 0) {
    if (xDb <= T) return xDb;
    return T + (xDb - T) / R;
  }
  const half = W / 2;
  if (xDb < T - half) return xDb;
  if (xDb > T + half) return T + (xDb - T) / R;
  // Soft region: quadratic blend into 1/R slope.
  const delta = xDb - T + half;
  return xDb + ((1 / R - 1) * (delta * delta)) / (2 * W);
}

/** Instantaneous gain reduction in dB (≤ 0). */
export function staticGainReductionDb(
  levelDb: number,
  thresholdDb: number,
  kneeDb: number,
  ratio: number,
): number {
  const y = softKneeOutputDb(levelDb, thresholdDb, kneeDb, ratio);
  const gr = y - levelDb;
  if (!Number.isFinite(gr)) return 0;
  return Math.min(0, gr);
}

function timeCoeff(seconds: number, sampleRate: number): number {
  if (!(seconds > 0) || !(sampleRate > 0)) return 0;
  return Math.exp(-1 / (seconds * sampleRate));
}

function sanitizeSample(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

export function createDynamicsState(): DynamicsState {
  return { gainDb: 0 };
}

/**
 * Process one stereo frame through feed-forward dynamics + post gain.
 * Detection = max(|L|,|R|) — linked stereo (same GR on both channels).
 */
export function processDynamicsSample(
  left: number,
  right: number,
  params: DynamicsRuntimeParams,
  state: DynamicsState,
  _sampleRate: number,
  attackCoeff: number,
  releaseCoeff: number,
): { left: number; right: number } {
  const l = sanitizeSample(left);
  const r = sanitizeSample(right);
  const level = Math.max(Math.abs(l), Math.abs(r));
  const levelDb = linearToDb(level);
  const targetGr = staticGainReductionDb(
    levelDb,
    params.thresholdDb,
    params.kneeDb,
    params.ratio,
  );

  // More negative GR → attack; returning toward 0 → release.
  const coeff = targetGr < state.gainDb ? attackCoeff : releaseCoeff;
  state.gainDb = coeff * state.gainDb + (1 - coeff) * targetGr;
  if (!Number.isFinite(state.gainDb)) state.gainDb = 0;

  const g = dbToLinear(state.gainDb) * params.postGain;
  const outL = l * g;
  const outR = r * g;
  return {
    left: sanitizeSample(outL),
    right: sanitizeSample(outR),
  };
}

export function compressorRuntimeFromParams(
  params: StudioFxCompressorParams,
): DynamicsRuntimeParams {
  return {
    thresholdDb: params.thresholdDb,
    ratio: params.ratio,
    kneeDb: 6, // live applyCompressor hard-codes knee = 6
    attackSec: Math.max(0, params.attackMs) / 1000,
    releaseSec: Math.max(0, params.releaseMs) / 1000,
    postGain: dbToLinear(params.makeupDb),
  };
}

/** Live limiter: fixed ratio/knee/attack/release + ceiling Gain. */
export function limiterRuntimeFromParams(
  params: StudioFxLimiterParams,
): DynamicsRuntimeParams {
  return {
    thresholdDb: params.thresholdDb,
    ratio: 20,
    kneeDb: 0,
    attackSec: 0.003,
    releaseSec: 0.05,
    postGain: dbToLinear(params.ceilingDb),
  };
}

export function dynamicsCoeffs(
  runtime: DynamicsRuntimeParams,
  sampleRate: number,
): { attackCoeff: number; releaseCoeff: number } {
  return {
    attackCoeff: timeCoeff(runtime.attackSec, sampleRate),
    releaseCoeff: timeCoeff(runtime.releaseSec, sampleRate),
  };
}
