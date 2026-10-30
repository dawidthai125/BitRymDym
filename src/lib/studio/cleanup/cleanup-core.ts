/**
 * Gaps P1 #5 — vocal cleanup DSP (own code, no third-party DSP, no licence strings attached).
 * STFT (2048 / hop 512, sqrt-Hann analysis+synthesis, 75 % overlap → exact reconstruction)
 *   1) noise: spectral gating against a noise profile taken from the quietest frames of the take
 *      (Wiener-style gain with over-subtraction, floor, fast-open / slow-close smoothing);
 *   2) room reverb: statistical late-reverb suppression (Lebart et al. 2001): late reverb PSD
 *      ≈ e^(-2·Δ·Td) · smoothed PSD Td earlier, Δ = 3 ln10 / T60.
 * The same gains are applied to every channel (stereo image kept). Length- and time-preserving
 * (zero latency), so clip offsets in the project stay valid.
 */
import { Fft } from "./fft";

export type CleanupSettings = { noise: number; reverb: number };
export const DEFAULT_CLEANUP_SETTINGS: CleanupSettings = { noise: 0.6, reverb: 0.4 };

export type CleanupMetrics = {
  noiseFloorBeforeDb: number;
  noiseFloorAfterDb: number;
  noiseReductionDb: number;
  quietFrames: number;
  /** Fraction of frames treated as noise-only (low = no real pauses in the take → gentler). */
  quietShare: number;
};

const N = 2048;
const HOP = 512;
const BINS = N / 2 + 1;
const T60 = 0.5;
const TD_SECONDS = 0.05;
const EPS = 1e-12;

export function clampCleanupSettings(raw: unknown): CleanupSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const c = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
  return { noise: c(o.noise, DEFAULT_CLEANUP_SETTINGS.noise), reverb: c(o.reverb, DEFAULT_CLEANUP_SETTINGS.reverb) };
}

const WINDOW = (() => {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  return w;
})();
/** Σ w² over overlapping frames for sqrt-Hann at hop N/4 = 2 (periodic Hann sums to N/(2·HOP)). */
const OLA_NORM = N / (2 * HOP);

function db(power: number): number {
  return 10 * Math.log10(Math.max(power, EPS));
}

function frameEnergy(x: Float32Array, start: number): number {
  let e = 0;
  for (let i = 0; i < N; i++) {
    const idx = start + i;
    const v = idx >= 0 && idx < x.length ? x[idx]! : 0;
    e += v * v;
  }
  return e / N;
}

function monoOf(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const len = channels[0]!.length;
  const m = new Float32Array(len);
  for (const ch of channels) for (let i = 0; i < len; i++) m[i] += ch[i]! / channels.length;
  return m;
}

/** Clean one take (any channel count, same length out). `onProgress` gets 0..1. */
export function cleanupVocal(
  channels: readonly Float32Array[],
  sampleRate: number,
  rawSettings: Partial<CleanupSettings> = DEFAULT_CLEANUP_SETTINGS,
  onProgress?: (p: number) => void,
): { channels: Float32Array[]; metrics: CleanupMetrics } {
  const settings = clampCleanupSettings(rawSettings);
  const len = channels[0]?.length ?? 0;
  const out = channels.map(() => new Float32Array(len));
  const empty = { noiseFloorBeforeDb: -120, noiseFloorAfterDb: -120, noiseReductionDb: 0, quietFrames: 0, quietShare: 0 };
  if (len === 0 || (settings.noise === 0 && settings.reverb === 0)) {
    return { channels: channels.map((c) => Float32Array.from(c)), metrics: empty };
  }
  const mono = monoOf(channels);
  const starts: number[] = [];
  for (let s = -N + HOP; s < len; s += HOP) starts.push(s);

  // 1) Quietest frames (lowest 10 %, ≥ 8) — only those that are really quiet relative to the loudest.
  const energies = starts.map((s) => frameEnergy(mono, s));
  const sorted = [...energies].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const pick = Math.max(8, Math.floor(sorted.length * 0.1));
  const cut = sorted[Math.min(sorted.length - 1, pick - 1)] ?? 0;
  // Edge frames (partly zero-padded) look quiet but are not noise — never use them for the profile.
  const inside = (i: number) => len < N || (starts[i]! >= 0 && starts[i]! + N <= len);
  const quietIdx = energies.map((e, i) => (inside(i) && e <= cut && e > 0 && e < loud * 0.05 ? i : -1)).filter((i) => i >= 0);
  const quietShare = quietIdx.length / Math.max(1, starts.length);

  const fft = new Fft(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const load = (x: Float32Array, start: number) => {
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      re[i] = (idx >= 0 && idx < len ? x[idx]! : 0) * WINDOW[i]!;
      im[i] = 0;
    }
    fft.transform(re, im);
  };

  // Noise PSD (per bin) from the quiet frames; zero if the take has no usable pauses.
  const noisePsd = new Float64Array(BINS);
  for (const i of quietIdx) {
    load(mono, starts[i]!);
    for (let k = 0; k < BINS; k++) noisePsd[k] += (re[k]! * re[k]! + im[k]! * im[k]!) / quietIdx.length;
  }
  // No real pauses → be gentler (the "noise" may contain voice).
  const noiseAmt = settings.noise * (quietShare >= 0.03 ? 1 : 0.5);
  const overSub = 1 + 2 * noiseAmt;
  const floorNoise = Math.pow(10, -(6 + 18 * noiseAmt) / 20);
  const floorRev = Math.pow(10, -(3 + 12 * settings.reverb) / 20);
  const floorAll = Math.min(floorNoise, floorRev);
  const delayFrames = Math.max(1, Math.round((TD_SECONDS * sampleRate) / HOP));
  const decay = Math.exp((-2 * ((3 * Math.LN10) / T60) * delayFrames * HOP) / sampleRate);
  const revBeta = 1.5 * settings.reverb;

  const smoothHist: Float64Array[] = Array.from({ length: delayFrames + 1 }, () => new Float64Array(BINS));
  const smooth = new Float64Array(BINS);
  const prevGain = new Float64Array(BINS).fill(1);
  const gain = new Float64Array(BINS);
  const tmp = new Float64Array(BINS);
  const monoRe = new Float64Array(N);
  const monoIm = new Float64Array(N);

  for (let f = 0; f < starts.length; f++) {
    const s = starts[f]!;
    load(mono, s);
    monoRe.set(re); monoIm.set(im);
    const late = smoothHist[(f + 1) % smoothHist.length]!; // smoothed PSD delayFrames ago
    for (let k = 0; k < BINS; k++) {
      const p = re[k]! * re[k]! + im[k]! * im[k]! + EPS;
      const gN = settings.noise > 0 ? Math.max(floorNoise, 1 - (overSub * noisePsd[k]!) / p) : 1;
      const gR = revBeta > 0 && f >= delayFrames ? Math.max(floorRev, 1 - (revBeta * decay * late[k]!) / p) : 1;
      tmp[k] = Math.max(floorAll, gN * gR);
      smooth[k] = 0.5 * smooth[k]! + 0.5 * p;
    }
    smoothHist[f % smoothHist.length]!.set(smooth);
    // Frequency smoothing (3 taps), then fast open / slow close in time.
    for (let k = 0; k < BINS; k++) {
      const g = (tmp[Math.max(0, k - 1)]! + tmp[k]! + tmp[Math.min(BINS - 1, k + 1)]!) / 3;
      gain[k] = g >= prevGain[k]! ? g : prevGain[k]! + (g - prevGain[k]!) * 0.5;
      prevGain[k] = gain[k]!;
    }
    for (let c = 0; c < channels.length; c++) {
      if (channels.length === 1) { re.set(monoRe); im.set(monoIm); } else load(channels[c]!, s);
      for (let k = 0; k < BINS; k++) {
        re[k] = re[k]! * gain[k]!; im[k] = im[k]! * gain[k]!;
        if (k > 0 && k < N / 2) { re[N - k] = re[k]!; im[N - k] = -im[k]!; }
      }
      fft.transform(re, im, true);
      const o = out[c]!;
      for (let i = 0; i < N; i++) {
        const idx = s + i;
        if (idx >= 0 && idx < len) o[idx] += (re[i]! / N) * WINDOW[i]! / OLA_NORM;
      }
    }
    if (onProgress && f % 256 === 0) onProgress(f / starts.length);
  }
  onProgress?.(1);

  const outMono = monoOf(out);
  const before = quietIdx.reduce((a, i) => a + energies[i]!, 0) / Math.max(1, quietIdx.length);
  const after = quietIdx.reduce((a, i) => a + frameEnergy(outMono, starts[i]!), 0) / Math.max(1, quietIdx.length);
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    channels: out,
    metrics: {
      noiseFloorBeforeDb: round(db(before)),
      noiseFloorAfterDb: round(db(after)),
      noiseReductionDb: quietIdx.length ? round(db(before) - db(after)) : 0,
      quietFrames: quietIdx.length,
      quietShare: Math.round(quietShare * 1000) / 1000,
    },
  };
}
