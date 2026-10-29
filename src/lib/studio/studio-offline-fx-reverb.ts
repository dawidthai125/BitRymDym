/**
 * SFM-3D — Offline reverb approximating live buildReverbSlot:
 *   dry || (Convolver(normalize=true, synthetic IR) → wet)
 *   dryGain = 1-mix, wetGain = mix
 *
 * IR via shared fillStudioSyntheticImpulse + equal-power normalize.
 * Offline uses seeded RNG (deterministic); live keeps Math.random.
 * Convolution: uniform partitioned overlap-save (no new npm dep).
 * NOT bit-identical to browser ConvolverNode.
 */

import type { StudioFxReverbParams } from "@/lib/studio/studio-fx-chain";
import {
  applyScaleToImpulse,
  computeConvolverNormalizeScale,
  createSeededUnitRandom,
  fillStudioSyntheticImpulse,
  studioImpulseLengthFrames,
  studioImpulsePcmBytes,
  studioOfflineImpulseSeed,
} from "@/lib/studio/studio-fx-impulse";
import { fftPlan, fftRadix2, fftWithPlan, nextPow2 } from "@/lib/studio/studio-offline-fx-fft";

/** Partition / hop size — balances latency vs CPU. */
export const STUDIO_OFFLINE_REVERB_BLOCK_SIZE = 512;

export type MonoPartitionedConvolver = {
  readonly blockSize: number;
  readonly fftSize: number;
  readonly partitionCount: number;
  /** Approximate retained bytes (IR FFTs + FDL + temporaries). */
  readonly stateBytes: number;
  processSample(x: number): number;
  reset(): void;
};

function sanitize(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/**
 * Build mono UPC from IR (already normalized).
 */
export function createMonoPartitionedConvolver(
  ir: Float32Array,
  blockSize: number = STUDIO_OFFLINE_REVERB_BLOCK_SIZE,
): MonoPartitionedConvolver {
  const B = blockSize;
  const N = nextPow2(B * 2); // ≥ 2B
  const K = Math.max(1, Math.ceil(ir.length / B));

  // Precompute partition FFTs: HRe[k][bin], HIm[k][bin]
  const HRe: Float64Array[] = [];
  const HIm: Float64Array[] = [];
  const tmpRe = new Float64Array(N);
  const tmpIm = new Float64Array(N);
  for (let k = 0; k < K; k += 1) {
    tmpRe.fill(0);
    tmpIm.fill(0);
    const offset = k * B;
    for (let i = 0; i < B; i += 1) {
      tmpRe[i] = ir[offset + i] ?? 0;
    }
    fftRadix2(tmpRe, tmpIm, false);
    HRe.push(Float64Array.from(tmpRe));
    HIm.push(Float64Array.from(tmpIm));
  }

  // Frequency delay line of input spectra (newest at index 0)
  const XRe: Float64Array[] = Array.from(
    { length: K },
    () => new Float64Array(N),
  );
  const XIm: Float64Array[] = Array.from(
    { length: K },
    () => new Float64Array(N),
  );

  const prev = new Float64Array(B); // previous input block (overlap-save)
  const inBlock = new Float32Array(B);
  const outQueue = new Float32Array(B);
  let inCount = 0;
  let outRead = 0;
  let outLen = 0;
  const yRe = new Float64Array(N);
  const yIm = new Float64Array(N);
  const frameRe = new Float64Array(N);
  const frameIm = new Float64Array(N);

  const stateBytes = monoConvolverStateBytes(ir.length, B);

  // FDL as a ring buffer (newest spectrum at `head`) — no per-block copying of K spectra.
  let head = 0;
  const half = N >> 1;

  function processBlock(): void {
    head = (head + K - 1) % K;
    // Overlap-save frame: [prev | current]
    frameRe.fill(0);
    frameIm.fill(0);
    for (let i = 0; i < B; i += 1) {
      frameRe[i] = prev[i]!;
      frameRe[B + i] = inBlock[i]!;
    }
    fftRadix2(frameRe, frameIm, false);
    XRe[head]!.set(frameRe);
    XIm[head]!.set(frameIm);

    // Real input & IR → Hermitian spectra: accumulate bins 0..N/2, mirror the rest.
    yRe.fill(0);
    yIm.fill(0);
    for (let k = 0; k < K; k += 1) {
      const slot = (head + k) % K;
      const xr = XRe[slot]!;
      const xi = XIm[slot]!;
      const hr = HRe[k]!;
      const hi = HIm[k]!;
      for (let bin = 0; bin <= half; bin += 1) {
        const a = xr[bin]!;
        const b = xi[bin]!;
        const c = hr[bin]!;
        const d = hi[bin]!;
        yRe[bin]! += a * c - b * d;
        yIm[bin]! += a * d + b * c;
      }
    }
    for (let bin = 1; bin < half; bin += 1) {
      yRe[N - bin] = yRe[bin]!;
      yIm[N - bin] = -yIm[bin]!;
    }
    fftRadix2(yRe, yIm, true);
    for (let i = 0; i < B; i += 1) {
      outQueue[i] = yRe[B + i]!;
      prev[i] = inBlock[i]!;
    }
    outRead = 0;
    outLen = B;
  }

  return {
    blockSize: B,
    fftSize: N,
    partitionCount: K,
    stateBytes,
    processSample(x: number) {
      const sx = sanitize(x);
      inBlock[inCount] = sx;
      inCount += 1;
      if (inCount >= B) {
        processBlock();
        inCount = 0;
      }
      if (outRead < outLen) {
        const y = outQueue[outRead]!;
        outRead += 1;
        return sanitize(y);
      }
      // Priming latency (~1 block) before first wet block is ready.
      return 0;
    },
    reset() {
      for (let k = 0; k < K; k += 1) {
        XRe[k]!.fill(0);
        XIm[k]!.fill(0);
      }
      prev.fill(0);
      inBlock.fill(0);
      outQueue.fill(0);
      head = 0;
      inCount = 0;
      outRead = 0;
      outLen = 0;
    },
  };
}

/** stateBytes of createMonoPartitionedConvolver for an IR of `irLength` frames. */
export function monoConvolverStateBytes(irLength: number, blockSize: number = STUDIO_OFFLINE_REVERB_BLOCK_SIZE): number {
  const B = blockSize;
  const N = nextPow2(B * 2);
  const K = Math.max(1, Math.ceil(irLength / B));
  return irLength * 4 + K * N * 8 * 2 * 2 + N * 8 * 4 + B * 4 * 3;
}

export type StereoReverbRuntime = {
  left: MonoPartitionedConvolver;
  right: MonoPartitionedConvolver;
  mix: number;
  stateBytes: number;
  irBytes: number;
  /** Reset per-sample convolver state (no-op if never built). */
  resetConvolvers(): void;
  /** Normalized IRs (kept for the whole-buffer fast path). */
  leftIr: Float32Array;
  rightIr: Float32Array;
};

export function createStereoReverbRuntime(
  params: StudioFxReverbParams,
  sampleRate: number,
): StereoReverbRuntime {
  const frames = studioImpulseLengthFrames(sampleRate, params.decaySeconds);
  const leftIr = new Float32Array(frames);
  const rightIr = new Float32Array(frames);
  const random = createSeededUnitRandom(
    studioOfflineImpulseSeed(sampleRate, params.decaySeconds),
  );
  fillStudioSyntheticImpulse(
    leftIr,
    rightIr,
    sampleRate,
    params.decaySeconds,
    random,
  );
  const scale = computeConvolverNormalizeScale(leftIr, rightIr);
  applyScaleToImpulse(leftIr, rightIr, scale);

  // Per-sample convolvers are built lazily: whole-buffer renders never need them.
  let left: MonoPartitionedConvolver | null = null;
  let right: MonoPartitionedConvolver | null = null;
  const irBytes = studioImpulsePcmBytes(sampleRate, params.decaySeconds);
  return {
    get left() {
      return (left ??= createMonoPartitionedConvolver(leftIr));
    },
    get right() {
      return (right ??= createMonoPartitionedConvolver(rightIr));
    },
    mix: Math.max(0, Math.min(1, params.mix)),
    stateBytes: 2 * monoConvolverStateBytes(frames),
    irBytes,
    leftIr,
    rightIr,
    resetConvolvers() {
      left?.reset();
      right?.reset();
    },
  };
}

export function processReverbSample(
  left: number,
  right: number,
  runtime: StereoReverbRuntime,
): { left: number; right: number } {
  const mix = runtime.mix;
  const xL = sanitize(left);
  const xR = sanitize(right);
  const wL = runtime.left.processSample(xL);
  const wR = runtime.right.processSample(xR);
  return {
    left: sanitize((1 - mix) * xL + mix * wL),
    right: sanitize((1 - mix) * xR + mix * wR),
  };
}

export function estimateReverbStateBytes(
  sampleRate: number,
  decaySeconds: number,
): number {
  const frames = studioImpulseLengthFrames(sampleRate, decaySeconds);
  const B = STUDIO_OFFLINE_REVERB_BLOCK_SIZE;
  const N = nextPow2(B * 2);
  const K = Math.max(1, Math.ceil(frames / B));
  // IR stereo + 2× (H+X) complex float64 partitions + temps (approx)
  return frames * 2 * 4 + 2 * (K * N * 8 * 2 * 2) + N * 8 * 8;
}

/**
 * Whole-buffer reverb for offline renders, in place. Output equals running
 * processReverbSample over every sample from a fresh runtime (same IR, same
 * blockSize-1 wet latency, f32-rounded wet), but uses large-block FFT
 * overlap-add with both channels packed into one complex FFT — ~10–20× faster
 * than the 512-sample uniform partitioned path. The runtime's per-sample
 * convolvers are not advanced; call this only on a fresh runtime.
 */
export function processReverbBufferFresh(
  runtime: StereoReverbRuntime,
  left: Float32Array,
  right: Float32Array,
): void {
  const len = Math.min(left.length, right.length);
  if (len === 0) return;
  const mix = runtime.mix;
  const dry = 1 - mix;
  if (mix === 0) {
    // Fully dry: per-sample output is sanitize(x) (wet × 0) — skip the convolution.
    for (let i = 0; i < len; i += 1) {
      left[i] = sanitize(left[i]!);
      right[i] = sanitize(right[i]!);
    }
    return;
  }
  const delay = STUDIO_OFFLINE_REVERB_BLOCK_SIZE - 1;
  const irLen = Math.max(runtime.leftIr.length, runtime.rightIr.length);
  // UPC truncates/pads the IR to whole partitions — zero tail, so irLen is exact.
  const hLen = irLen + delay;
  const n = Math.max(4096, nextPow2(hLen * 2));
  const seg = n - hLen + 1;
  const tailLen = hLen - 1;
  const plan = fftPlan(n);

  const half = n >> 1;
  // IR spectra for bins 0..n/2 only (real IRs → Hermitian), interleaved
  // [Lre, Lim, Rre, Rim] per bin for cache locality.
  const H = new Float64Array((half + 1) * 4);
  {
    const pr = new Float64Array(n);
    const pi = new Float64Array(n);
    // Pack: re = delayed left IR, im = delayed right IR → split after FFT.
    for (let i = 0; i < runtime.leftIr.length; i += 1) pr[delay + i] = runtime.leftIr[i]!;
    for (let i = 0; i < runtime.rightIr.length; i += 1) pi[delay + i] = runtime.rightIr[i]!;
    fftWithPlan(plan, pr, pi, false);
    for (let k = 0; k <= half; k += 1) {
      const k2 = (n - k) & (n - 1);
      const ar = pr[k]!, ai = pi[k]!, cr = pr[k2]!, ci = pi[k2]!;
      H[4 * k] = (ar + cr) / 2;
      H[4 * k + 1] = (ai - ci) / 2;
      H[4 * k + 2] = (ai + ci) / 2;
      H[4 * k + 3] = -(ar - cr) / 2;
    }
  }

  const xr = new Float64Array(n);
  const xi = new Float64Array(n);
  const tailL = new Float64Array(tailLen);
  const tailR = new Float64Array(tailLen);

  for (let s = 0; s < len; s += seg) {
    const m = Math.min(seg, len - s);
    xr.fill(0);
    xi.fill(0);
    for (let i = 0; i < m; i += 1) {
      xr[i] = sanitize(left[s + i]!);
      xi[i] = sanitize(right[s + i]!);
    }
    fftWithPlan(plan, xr, xi, false);
    // Y = XL·HL + i·XR·HR; YL/YR Hermitian → Y[n-k] = conj(YL[k]) + i·conj(YR[k]).
    // Bins k and n-k are computed together, in place.
    for (let k = 0; k <= half; k += 1) {
      const k2 = (n - k) & (n - 1);
      const ar = xr[k]!, ai = xi[k]!, cr = xr[k2]!, ci = xi[k2]!;
      const lr = (ar + cr) / 2, li = (ai - ci) / 2;
      const rr = (ai + ci) / 2, ri = -(ar - cr) / 2;
      const h = 4 * k;
      const hr1 = H[h]!, hi1 = H[h + 1]!, hr2 = H[h + 2]!, hi2 = H[h + 3]!;
      const ylr = lr * hr1 - li * hi1, yli = lr * hi1 + li * hr1;
      const yrr = rr * hr2 - ri * hi2, yri = rr * hi2 + ri * hr2;
      xr[k] = ylr - yri;
      xi[k] = yli + yrr;
      if (k2 !== k) {
        xr[k2] = ylr + yri;
        xi[k2] = yrr - yli;
      }
    }
    fftWithPlan(plan, xr, xi, true);
    for (let i = 0; i < m; i += 1) {
      const t = i < tailLen;
      const wL = Math.fround(xr[i]! + (t ? tailL[i]! : 0));
      const wR = Math.fround(xi[i]! + (t ? tailR[i]! : 0));
      const xL = sanitize(left[s + i]!);
      const xR = sanitize(right[s + i]!);
      left[s + i] = sanitize(dry * xL + mix * sanitize(wL));
      right[s + i] = sanitize(dry * xR + mix * sanitize(wR));
    }
    for (let i = 0; i < tailLen; i += 1) {
      tailL[i] = xr[seg + i]!;
      tailR[i] = xi[seg + i]!;
    }
  }
}
