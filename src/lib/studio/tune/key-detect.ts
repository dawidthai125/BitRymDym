/**
 * Beat key detection for BRD Tune, the BPM & key tool and the upload analysis.
 * Drums and noise are skipped: in each group of three overlapping Hann frames
 * only what lasts (per-bin median) and stands out as a spectral peak counts.
 * Peak frequencies are interpolated and corrected for the overall tuning, then
 * the chroma is correlated with the 24 rotated key profiles (Albrecht & Shanahan
 * 2013, measured on tonal music; the older Krumhansl profiles often flipped
 * minor beats to the parallel major or to the fifth).
 */
import { fftRadix2 } from "@/lib/studio/studio-offline-fx-fft";

import type { TuneKey } from "./tune";

const MAJOR = [0.238, 0.006, 0.111, 0.006, 0.137, 0.094, 0.016, 0.214, 0.009, 0.08, 0.008, 0.081];
const MINOR = [0.22, 0.006, 0.104, 0.123, 0.019, 0.103, 0.012, 0.214, 0.062, 0.022, 0.061, 0.052];

const GROUP = 3;
const LO_HZ = 55;
const HI_HZ = 2000;
/** A peak must exceed this share of the group maximum and this multiple of its neighbourhood. */
const PEAK_FLOOR = 0.005;
const PEAK_OVER_NEIGHBOURS = 2;
const NEIGHBOURS = 20;
/** Tuning is read above this MIDI note only: bass bins are too wide to show cents. */
const TUNING_MIN_MIDI = 52;

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

const median3 = (a: number, b: number, c: number) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

/** 12-bin chroma (C..B) of the sustained, pitched part of a mono signal; `maxGroups` excerpts spread over the file. */
export function chromaOf(mono: Float32Array, sampleRate: number, maxGroups = 80): number[] {
  const chroma = new Array<number>(12).fill(0);
  let N = 4096;
  while (N / sampleRate < 0.3) N *= 2; // same time/frequency resolution at 22.05 and 48 kHz
  if (!(sampleRate > 0) || mono.length < N) return chroma;
  const hop = Math.max(1, Math.min(N / 2, Math.floor((mono.length - N) / (GROUP - 1)) || 1));
  const span = N + hop * (GROUP - 1);
  const groups = Math.max(1, Math.min(maxGroups, Math.floor((mono.length - N) / (hop * GROUP)) + 1));
  const stride = groups > 1 ? Math.max(0, mono.length - span) / (groups - 1) : 0;
  const kLo = Math.max(3, Math.ceil((LO_HZ * N) / sampleRate));
  const kHi = Math.min(N / 2 - 3, Math.floor((HI_HZ * N) / sampleRate));
  const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const mags = Array.from({ length: GROUP }, () => new Float64Array(kHi + 2));
  const held = new Float64Array(kHi + 2);
  const peaks: { midi: number; w: number }[] = [];

  for (let g = 0; g < groups; g += 1) {
    const base = Math.floor(g * stride);
    for (let j = 0; j < GROUP; j += 1) {
      const start = base + j * hop;
      for (let i = 0; i < N; i += 1) {
        re[i] = (mono[start + i] ?? 0) * hann[i]!;
        im[i] = 0;
      }
      fftRadix2(re, im, false);
      for (let k = kLo - 1; k <= kHi + 1; k += 1) mags[j]![k] = Math.hypot(re[k]!, im[k]!);
    }
    let max = 0;
    for (let k = kLo - 1; k <= kHi + 1; k += 1) {
      held[k] = median3(mags[0]![k]!, mags[1]![k]!, mags[2]![k]!);
      if (held[k]! > max) max = held[k]!;
    }
    if (max <= 1e-9) continue;

    const found: { midi: number; w: number }[] = [];
    let total = 0;
    for (let k = kLo; k <= kHi; k += 1) {
      const v = held[k]!;
      if (v <= held[k - 1]! || v < held[k + 1]! || v <= max * PEAK_FLOOR) continue;
      let around = 0;
      let count = 0;
      for (let q = Math.max(kLo, k - NEIGHBOURS); q <= Math.min(kHi, k + NEIGHBOURS); q += 1) {
        if (Math.abs(q - k) < 3) continue;
        around += held[q]!;
        count += 1;
      }
      if (count > 0 && v < (PEAK_OVER_NEIGHBOURS * around) / count) continue;
      // Log-parabolic interpolation: sub-bin frequency, needed for low notes.
      const a = Math.log(held[k - 1]! + 1e-12);
      const b = Math.log(v);
      const c = Math.log(held[k + 1]! + 1e-12);
      const shift = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / (a - 2 * b + c || 1)));
      // sqrt-magnitude: tames a dominant bass.
      const w = Math.sqrt(v / max);
      found.push({ midi: 69 + 12 * Math.log2(((k + shift) * sampleRate) / N / 440), w });
      total += w;
    }
    for (const p of found) peaks.push({ midi: p.midi, w: p.w / total }); // every excerpt counts the same
  }

  let x = 0;
  let y = 0;
  for (const p of peaks) {
    if (p.midi < TUNING_MIN_MIDI) continue;
    x += p.w * Math.cos(2 * Math.PI * p.midi);
    y += p.w * Math.sin(2 * Math.PI * p.midi);
  }
  const tuning = Math.atan2(y, x) / (2 * Math.PI);
  for (const p of peaks) {
    const note = Math.round(p.midi - tuning);
    chroma[((note % 12) + 12) % 12]! += p.w * (1 - Math.abs(p.midi - tuning - note));
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
