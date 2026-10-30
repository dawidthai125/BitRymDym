/**
 * Beat key detection (Krumhansl–Schmuckler) for BRD Tune when the beat has no
 * key metadata. Chroma from Hann-windowed FFT frames (own radix-2 FFT, shared
 * with the offline reverb), correlated with the 24 rotated key profiles.
 */
import { fftRadix2 } from "@/lib/studio/studio-offline-fx-fft";

import type { TuneKey } from "./tune";

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export type DetectedKey = TuneKey & {
  /** Pearson r of the winning profile (−1..1). */
  score: number;
  /** Winner minus runner-up (0 = ambiguous). */
  margin: number;
};

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i += 1) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** 12-bin chroma (C..B) of a mono signal; at most `maxFrames` frames spread over the file. */
export function chromaOf(mono: Float32Array, sampleRate: number, maxFrames = 96): number[] {
  const N = 8192;
  const chroma = new Array<number>(12).fill(0);
  if (mono.length < N) return chroma;
  const frames = Math.min(maxFrames, Math.floor(mono.length / N));
  const stride = Math.floor((mono.length - N) / Math.max(1, frames - 1));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const binPc: number[] = [];
  const kLo = Math.ceil((55 * N) / sampleRate);
  const kHi = Math.min(N / 2 - 1, Math.floor((2000 * N) / sampleRate));
  for (let k = 0; k <= kHi; k += 1) {
    const f = (k * sampleRate) / N;
    const midi = k >= kLo ? 69 + 12 * Math.log2(f / 440) : 0;
    binPc.push(k >= kLo ? ((Math.round(midi) % 12) + 12) % 12 : -1);
  }
  for (let fi = 0; fi < frames; fi += 1) {
    const start = fi * stride;
    for (let i = 0; i < N; i += 1) {
      re[i] = mono[start + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fftRadix2(re, im, false);
    for (let k = kLo; k <= kHi; k += 1) {
      const pc = binPc[k]!;
      if (pc < 0) continue;
      // sqrt-magnitude: tames dominant bass / kick partials.
      chroma[pc] += Math.sqrt(Math.hypot(re[k]!, im[k]!));
    }
  }
  return chroma;
}

export function keyFromChroma(chroma: readonly number[]): DetectedKey | null {
  if (chroma.every((v) => v === 0)) return null;
  const scores: { keyRoot: number; scale: 0 | 1; r: number }[] = [];
  for (let root = 0; root < 12; root += 1) {
    const rotated = chroma.map((_, i) => chroma[(i + root) % 12]!);
    scores.push({ keyRoot: root, scale: 0, r: pearson(rotated, MAJOR) });
    scores.push({ keyRoot: root, scale: 1, r: pearson(rotated, MINOR) });
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0]!;
  return { keyRoot: best.keyRoot, scale: best.scale, score: best.r, margin: best.r - scores[1]!.r };
}

/** Detect the key of (beat) audio. Channels are averaged. */
export function detectKeyFromAudio(channels: readonly Float32Array[], sampleRate: number): DetectedKey | null {
  if (channels.length === 0) return null;
  const len = channels[0]!.length;
  const mono = new Float32Array(len);
  for (const ch of channels) for (let i = 0; i < len; i += 1) mono[i] += ch[i]! / channels.length;
  return keyFromChroma(chromaOf(mono, sampleRate));
}
