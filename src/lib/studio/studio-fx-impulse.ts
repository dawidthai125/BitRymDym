/**
 * Shared synthetic IR for Studio reverb (live Convolver + offline).
 *
 * Formula matches historical `createImpulse` in studio-fx-graph:
 *   sample = (random()*2-1) * exp(-i / (sampleRate * (decaySeconds/3)))
 * per channel, independently.
 *
 * RNG is injectable so live can keep Math.random while offline uses a
 * deterministic seed (export must be reproducible). Same envelope/noise model;
 * offline ≠ live bit-identical when RNG differs.
 */

export type StudioImpulseRandomFn = () => number;

/** Max decay from studio-fx-chain validator. */
export const STUDIO_FX_REVERB_MAX_DECAY_SECONDS = 6;

export function studioImpulseLengthFrames(
  sampleRate: number,
  decaySeconds: number,
): number {
  const rate = sampleRate > 0 ? sampleRate : 48000;
  const decay = Math.max(0, decaySeconds);
  return Math.max(1, Math.floor(rate * decay));
}

/**
 * Fill stereo IR buffers in-place (length already sized).
 * Does not normalize — ConvolverNode.normalize / offline equal-power does that.
 */
export function fillStudioSyntheticImpulse(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  decaySeconds: number,
  random: StudioImpulseRandomFn = Math.random,
): void {
  const rate = sampleRate > 0 ? sampleRate : 48000;
  const length = Math.min(left.length, right.length);
  const tau = rate * (Math.max(1e-6, decaySeconds) / 3);
  for (let i = 0; i < length; i += 1) {
    const env = Math.exp(-i / tau);
    left[i] = (random() * 2 - 1) * env;
    right[i] = (random() * 2 - 1) * env;
  }
}

/** Deterministic xorshift32 in (0,1) for offline IR. */
export function createSeededUnitRandom(seed: number): StudioImpulseRandomFn {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Stable seed from decay + sample rate (same params → same offline IR). */
export function studioOfflineImpulseSeed(
  sampleRate: number,
  decaySeconds: number,
): number {
  const sr = Math.floor(sampleRate);
  const d = Math.floor(decaySeconds * 1000);
  return ((sr * 1315423911) ^ (d * 2654435761)) >>> 0;
}

/**
 * Equal-power style scale applied when ConvolverNode.normalize === true.
 * Matches common Web Audio practice: scale = 1 / (rms * sqrt(length)).
 * Documented as NOT bit-identical to every browser build.
 */
export function computeConvolverNormalizeScale(
  left: Float32Array,
  right: Float32Array,
): number {
  const n = Math.min(left.length, right.length);
  if (n < 1) return 1;
  let power = 0;
  for (let i = 0; i < n; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    power += l * l + r * r;
  }
  const rms = Math.sqrt(power / (2 * n));
  if (!(rms > 0) || !Number.isFinite(rms)) return 1;
  const scale = 1 / (rms * Math.sqrt(n));
  return Number.isFinite(scale) ? scale : 1;
}

export function applyScaleToImpulse(
  left: Float32Array,
  right: Float32Array,
  scale: number,
): void {
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i += 1) {
    left[i] = (left[i] ?? 0) * scale;
    right[i] = (right[i] ?? 0) * scale;
  }
}

/** Bytes for stereo float32 IR of given decay. */
export function studioImpulsePcmBytes(
  sampleRate: number,
  decaySeconds: number,
): number {
  const frames = studioImpulseLengthFrames(sampleRate, decaySeconds);
  return frames * 2 * 4;
}
