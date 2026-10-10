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
import { fftRadix2, nextPow2 } from "@/lib/studio/studio-offline-fx-fft";

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

  const stateBytes =
    ir.byteLength +
    K * N * 8 * 2 * 2 + // H + X complex float64
    N * 8 * 4 + // temps
    B * 4 * 3; // prev/in/out

  function processBlock(): void {
    // Shift FDL
    for (let k = K - 1; k >= 1; k -= 1) {
      XRe[k]!.set(XRe[k - 1]!);
      XIm[k]!.set(XIm[k - 1]!);
    }
    // Overlap-save frame: [prev | current]
    frameRe.fill(0);
    frameIm.fill(0);
    for (let i = 0; i < B; i += 1) {
      frameRe[i] = prev[i]!;
      frameRe[B + i] = inBlock[i]!;
    }
    fftRadix2(frameRe, frameIm, false);
    XRe[0]!.set(frameRe);
    XIm[0]!.set(frameIm);

    yRe.fill(0);
    yIm.fill(0);
    for (let k = 0; k < K; k += 1) {
      const xr = XRe[k]!;
      const xi = XIm[k]!;
      const hr = HRe[k]!;
      const hi = HIm[k]!;
      for (let bin = 0; bin < N; bin += 1) {
        yRe[bin]! += xr[bin]! * hr[bin]! - xi[bin]! * hi[bin]!;
        yIm[bin]! += xr[bin]! * hi[bin]! + xi[bin]! * hr[bin]!;
      }
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
      inCount = 0;
      outRead = 0;
      outLen = 0;
    },
  };
}

export type StereoReverbRuntime = {
  left: MonoPartitionedConvolver;
  right: MonoPartitionedConvolver;
  mix: number;
  stateBytes: number;
  irBytes: number;
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

  const left = createMonoPartitionedConvolver(leftIr);
  const right = createMonoPartitionedConvolver(rightIr);
  const irBytes = studioImpulsePcmBytes(sampleRate, params.decaySeconds);
  return {
    left,
    right,
    mix: Math.max(0, Math.min(1, params.mix)),
    stateBytes: left.stateBytes + right.stateBytes,
    irBytes,
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
