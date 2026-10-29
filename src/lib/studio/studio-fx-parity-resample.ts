/**
 * Stage I.13D — documented linear resampling for Plane B ↔ 44.1 kHz compare.
 * Not anti-aliased; report native metrics separately. No new dependencies.
 */

/** Linear interpolate interleaved stereo to a target sample rate. */
export function resampleInterleavedLinear(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (
    !(inputRate > 0) ||
    !(outputRate > 0) ||
    !Number.isFinite(inputRate) ||
    !Number.isFinite(outputRate)
  ) {
    throw new Error("Invalid sample rate for resample.");
  }
  const inFrames = Math.floor(input.length / 2);
  if (inFrames < 1) return new Float32Array(0);
  if (inputRate === outputRate) return input.slice();

  const durationSec = inFrames / inputRate;
  const outFrames = Math.max(1, Math.round(durationSec * outputRate));
  const out = new Float32Array(outFrames * 2);
  for (let i = 0; i < outFrames; i++) {
    const t = i / outputRate;
    const src = t * inputRate;
    const i0 = Math.floor(src);
    const i1 = Math.min(inFrames - 1, i0 + 1);
    const frac = src - i0;
    const l0 = input[i0 * 2] ?? 0;
    const r0 = input[i0 * 2 + 1] ?? 0;
    const l1 = input[i1 * 2] ?? 0;
    const r1 = input[i1 * 2 + 1] ?? 0;
    out[i * 2] = l0 + (l1 - l0) * frac;
    out[i * 2 + 1] = r0 + (r1 - r0) * frac;
  }
  return out;
}
