/**
 * Tempo of a whole reference song (pure, browser + tests). The catalog trackers are tuned for
 * short beat loops; on full mixes they slipped (85 → 81, 88 → 110, 140 → 175 on test songs).
 *
 * Method: log spectral-flux onset envelope → autocorrelation → comb score over 60–180 BPM
 * (a true tempo also explains 2×, 3×, 4× its beat period) → fine search in 0.1 BPM steps.
 * Half/double time is ambiguous by nature; both are returned and a mild hip-hop prior
 * (centre ~90 BPM) only breaks near-ties.
 */

import { fftRadix2 } from "@/lib/studio/studio-offline-fx-fft";

export type TempoReading = {
  bpm: number;
  /** 0–1: how clearly the winner beats the next non-octave tempo. */
  confidence: number;
  /** Winner first, then its half/double time when inside 60–180, then other strong peaks. */
  candidates: number[];
  /** Half or double time is about as strong as the winner (e.g. trap 70 vs 140). */
  octaveAlternatives: number[];
};

const FRAME = 1024;
const HOP = 256;
const MIN_BPM = 60;
const MAX_BPM = 180;

/** Log-magnitude spectral flux, half-wave rectified, local mean removed. */
export function onsetEnvelope(mono: Float32Array, sampleRate: number): { env: Float32Array; fps: number } {
  const frames = Math.max(0, Math.floor((mono.length - FRAME) / HOP) + 1);
  const env = new Float32Array(frames);
  const win = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  const half = FRAME / 2;
  // Up to ~8 kHz: kick, snare and hats; above that is mostly noise.
  const maxBin = Math.min(half, Math.round((8000 / sampleRate) * FRAME));
  let prev = new Float64Array(maxBin);
  let cur = new Float64Array(maxBin);
  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = (mono[off + i] ?? 0) * win[i];
      im[i] = 0;
    }
    fftRadix2(re, im, false);
    let flux = 0;
    for (let k = 1; k < maxBin; k++) {
      const mag = Math.log1p(100 * Math.hypot(re[k], im[k]));
      cur[k] = mag;
      const d = mag - prev[k];
      if (d > 0) flux += d;
    }
    env[f] = f === 0 ? 0 : flux;
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  // Remove the slow trend (≈ 0.5 s mean) so loud sections do not dominate.
  const fps = sampleRate / HOP;
  const w = Math.max(1, Math.round(fps * 0.25));
  const out = new Float32Array(frames);
  let sum = 0;
  const pre = new Float64Array(frames + 1);
  for (let i = 0; i < frames; i++) pre[i + 1] = pre[i] + env[i];
  for (let i = 0; i < frames; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(frames, i + w + 1);
    const mean = (pre[b] - pre[a]) / (b - a);
    const v = env[i] - mean;
    out[i] = v > 0 ? v : 0;
    sum += out[i];
  }
  if (sum > 0) for (let i = 0; i < frames; i++) out[i] /= sum / frames;
  return { env: out, fps };
}

function autocorr(env: Float32Array, maxLag: number): Float64Array {
  const n = env.length;
  const ac = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += env[i] * env[i + lag];
    ac[lag] = s / (n - lag);
  }
  return ac;
}

function acAt(ac: Float64Array, lag: number): number {
  const i = Math.floor(lag);
  if (i < 0 || i + 1 >= ac.length) return 0;
  const t = lag - i;
  return ac[i] * (1 - t) + ac[i + 1] * t;
}

/** Comb score of a tempo: its beat period and multiples, with the bar (4 beats) weighted in. */
function combScore(ac: Float64Array, fps: number, bpm: number): number {
  const period = (60 * fps) / bpm;
  let s = 0;
  const weights = [1, 0.8, 0.5, 0.8, 0.3, 0.4, 0.2, 0.5];
  for (let k = 1; k <= weights.length; k++) {
    const lag = period * k;
    if (lag + 1 >= ac.length) break;
    // Peak picking within ±1 frame absorbs envelope jitter.
    s += weights[k - 1] * Math.max(acAt(ac, lag - 1), acAt(ac, lag), acAt(ac, lag + 1));
  }
  return s;
}

/** Mild preference for 70–110 BPM (most hip-hop); only decides near-ties between octaves. */
function prior(bpm: number): number {
  const x = Math.log2(bpm / 90);
  return Math.exp(-(x * x) / (2 * 0.6 * 0.6));
}

export function estimateTempo(mono: Float32Array, sampleRate: number): TempoReading | null {
  if (!(sampleRate > 0) || mono.length < sampleRate * 8) return null;
  const { env, fps } = onsetEnvelope(mono, sampleRate);
  const maxLag = Math.ceil(((60 * fps) / MIN_BPM) * 8) + 2;
  if (env.length < maxLag + fps * 2) {
    // Short excerpt: fall back to fewer multiples.
  }
  const ac = autocorr(env, Math.min(maxLag, env.length - 1));

  const scored: { bpm: number; score: number }[] = [];
  for (let b = MIN_BPM; b <= MAX_BPM + 1e-9; b += 0.5) scored.push({ bpm: b, score: combScore(ac, fps, b) });
  // Local maxima.
  const peaks = scored.filter((p, i) => i > 0 && i < scored.length - 1 && p.score >= scored[i - 1].score && p.score >= scored[i + 1].score);
  if (!peaks.length) return null;
  // Fine search around each peak.
  const refined = peaks.map((p) => {
    let best = p;
    for (let b = p.bpm - 0.5; b <= p.bpm + 0.5; b += 0.05) {
      const s = combScore(ac, fps, b);
      if (s > best.score) best = { bpm: b, score: s };
    }
    return best;
  });
  // The strongest pulse wins on its own score (no prior: a prior pulled 140 down to 93, a 3:2 slip).
  refined.sort((a, b) => b.score - a.score);
  const strongest = refined[0];
  // The prior only chooses between that pulse and its half/double time, when both are strong.
  const octaves = [strongest, ...[strongest.bpm / 2, strongest.bpm * 2]
    .filter((b) => b >= MIN_BPM && b <= MAX_BPM)
    .map((b) => {
      let best = { bpm: b, score: combScore(ac, fps, b) };
      for (let x = b - 0.5; x <= b + 0.5; x += 0.05) {
        const s2 = combScore(ac, fps, x);
        if (s2 > best.score) best = { bpm: x, score: s2 };
      }
      return best;
    })
    .filter((p) => p.score >= strongest.score * 0.6)];
  octaves.sort((a, b) => b.score * prior(b.bpm) - a.score * prior(a.bpm));
  const top = octaves[0];
  const related = (a: number, b: number) => [0.5, 2, 1].some((r) => Math.abs(a / b - r) < 0.03);
  const rival = refined.find((p) => !related(p.bpm, strongest.bpm));
  const confidence = rival ? Math.max(0, Math.min(1, 1 - rival.score / strongest.score)) : 1;

  const bpm = Math.round(top.bpm);
  const list: number[] = [bpm];
  for (const alt of [top.bpm / 2, top.bpm * 2]) {
    const r = Math.round(alt);
    if (r >= MIN_BPM && r <= MAX_BPM && !list.includes(r)) list.push(r);
  }
  for (const p of refined.slice(1, 6)) {
    const r = Math.round(p.bpm);
    if (!list.includes(r)) list.push(r);
  }
  const octaveAlternatives = octaves
    .filter((p) => p !== top)
    .map((p) => Math.round(p.bpm))
    .filter((b) => b !== bpm);
  return {
    bpm,
    confidence: Math.round(confidence * 100) / 100,
    candidates: list.slice(0, 6),
    octaveAlternatives: [...new Set(octaveAlternatives)],
  };
}
