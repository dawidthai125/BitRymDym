/**
 * Stage 2 — shared DSP specs for highpass / deesser / gate.
 *
 * Single source for both the live Web Audio graph (studio-fx-graph) and the
 * offline Node render (studio-offline-fx → E3 render worker), so the two paths
 * use identical crossover points, dynamics and gate curves.
 */

import type {
  StudioFxDeesserParams,
  StudioFxGateParams,
} from "@/lib/studio/studio-fx-chain";

/** Butterworth Q for each half of a Linkwitz–Riley 4th-order crossover. */
export const LR4_SECTION_Q = Math.SQRT1_2;

/** Web Audio lowpass/highpass take Q in dB. */
export function linearQToWebAudioDb(q: number): number {
  return 20 * Math.log10(Math.max(1e-4, q));
}

export type DeesserDynamicsSpec = {
  thresholdDb: number;
  ratio: number;
  kneeDb: number;
  attackSec: number;
  releaseSec: number;
};

/** Fast dynamics on the sibilance band (above the crossover). */
export function deesserDynamicsSpec(
  params: StudioFxDeesserParams,
): DeesserDynamicsSpec {
  return {
    thresholdDb: params.thresholdDb,
    ratio: params.ratio,
    kneeDb: 3,
    attackSec: 0.001,
    releaseSec: 0.06,
  };
}

/** Envelope smoothing low-pass cutoff from release time: fc = 1/(2π·τ). Live graph still uses this (no hold yet). */
export function gateEnvelopeCutoffHz(params: StudioFxGateParams): number {
  const tau = Math.max(0.001, params.releaseMs / 1000);
  return Math.min(200, Math.max(0.5, 1 / (2 * Math.PI * tau)));
}

export type GateEnvelopeState = {
  level: number;
  holdLeft: number;
};

export function createGateEnvelopeState(): GateEnvelopeState {
  return { level: 0, holdLeft: 0 };
}

function gateTimeCoeff(ms: number, sampleRate: number): number {
  const sec = Math.max(0, ms) / 1000;
  if (sec <= 0 || !(sampleRate > 0)) return 1;
  return 1 - Math.exp(-1 / (sampleRate * sec));
}

/**
 * Peak follower with attack / hold / release (offline + future worklet).
 * `peak` is a linear |sample| (or max of stereo).
 */
export function processGateEnvelope(
  peak: number,
  state: GateEnvelopeState,
  params: StudioFxGateParams,
  sampleRate: number,
): number {
  const x = Math.max(0, peak);
  if (x >= state.level) {
    state.level += (x - state.level) * gateTimeCoeff(params.attackMs, sampleRate);
    state.holdLeft = Math.max(0, Math.round((Math.max(0, params.holdMs) / 1000) * sampleRate));
  } else if (state.holdLeft > 0) {
    state.holdLeft -= 1;
  } else {
    state.level += (x - state.level) * gateTimeCoeff(params.releaseMs, sampleRate);
  }
  return state.level;
}

/** Expander ratio below threshold (1:2) — gentle, capped by rangeDb. */
export const GATE_EXPANDER_RATIO = 2;

/**
 * Linear gain for a (rectified, smoothed) envelope value.
 * ≥ threshold → 1. Below → downward expansion 1:2, at most `rangeDb` cut.
 */
export function gateGainForEnvelope(
  envelope: number,
  params: StudioFxGateParams,
): number {
  const env = Math.abs(envelope);
  const envDb = env > 1e-9 ? 20 * Math.log10(env) : -180;
  if (envDb >= params.thresholdDb) return 1;
  const cut = Math.min(
    Math.max(0, params.rangeDb),
    (params.thresholdDb - envDb) * (GATE_EXPANDER_RATIO - 1),
  );
  return 10 ** (-cut / 20);
}

/** WaveShaper curve size for the live gate gain mapping. */
export const GATE_CURVE_SIZE = 65536;

/** Curve over input [-1, 1] → gain (symmetric). Used by the live graph. */
export function buildGateGainCurve(
  params: StudioFxGateParams,
  size = GATE_CURVE_SIZE,
): Float32Array {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = gateGainForEnvelope(x, params);
  }
  return curve;
}

/** |x| rectifier curve for the live envelope follower. */
export function buildAbsCurve(size = 4097): Float32Array {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    curve[i] = Math.abs((i / (size - 1)) * 2 - 1);
  }
  return curve;
}
