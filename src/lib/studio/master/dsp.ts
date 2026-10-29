/**
 * Stage 3 — browser mastering PREVIEW (approximate). The final master is made
 * on the server (scripts/master/master.py). Pure, no Web Audio: runs in a worker
 * and in tests. Chain mirrors the server: HPF 25 Hz → shelves → glue
 * compressor → M/S width → gain to target → look-ahead limiter → TP trim.
 */

import { applyBiquad, type Biquad, stftBandPowers, toDb, truePeak } from "@/lib/studio/mix-analysis/dsp";
import { measureLoudness } from "@/lib/studio/mix-analysis/loudness";

import { HIPHOP_REFERENCE_DB, MASTER_BANDS, type MasterBandId, type MasterSettings, type MasterTargetId, masterGoal } from "./targets";

export type Stereo = { left: Float32Array; right: Float32Array; sampleRate: number };

export type MasterMetrics = {
  lufs: number;
  lraLu: number;
  truePeakDb: number;
  /** Peak-to-loudness ratio (TP − LUFS), LU — "how squashed". */
  plr: number;
  correlation: number;
  sideToMid: number;
  tonal: Record<MasterBandId, { db: number; ref: number; delta: number }>;
  durationS: number;
};

// RBJ cookbook biquads.
function shelf(kind: "low" | "high", f0: number, gainDb: number, sr: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * f0) / sr;
  const cos = Math.cos(w);
  const alpha = (Math.sin(w) / 2) * Math.SQRT2; // S = 1
  const sq = 2 * Math.sqrt(A) * alpha;
  let b0, b1, b2, a0, a1, a2;
  if (kind === "low") {
    b0 = A * (A + 1 - (A - 1) * cos + sq);
    b1 = 2 * A * (A - 1 - (A + 1) * cos);
    b2 = A * (A + 1 - (A - 1) * cos - sq);
    a0 = A + 1 + (A - 1) * cos + sq;
    a1 = -2 * (A - 1 + (A + 1) * cos);
    a2 = A + 1 + (A - 1) * cos - sq;
  } else {
    b0 = A * (A + 1 + (A - 1) * cos + sq);
    b1 = -2 * A * (A - 1 + (A + 1) * cos);
    b2 = A * (A + 1 + (A - 1) * cos - sq);
    a0 = A + 1 - (A - 1) * cos + sq;
    a1 = 2 * (A - 1 - (A + 1) * cos);
    a2 = A + 1 - (A - 1) * cos - sq;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function highpass(f0: number, sr: number): Biquad {
  const w = (2 * Math.PI * f0) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  return { b0: (1 + cos) / 2 / a0, b1: -(1 + cos) / a0, b2: (1 + cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

const interp = (v: number, lo: number, mid: number, hi: number) => (v <= 0 ? mid + (mid - lo) * (v / 3) : mid + (hi - mid) * (v / 3));

function compress(l: Float32Array, r: Float32Array, sr: number, squash: number): void {
  const ratio = interp(squash, 1.2, 2, 4);
  const thr = interp(squash, -12, -18, -26);
  const att = Math.exp(-1 / (0.015 * sr));
  const rel = Math.exp(-1 / (0.15 * sr));
  let env = 0;
  for (let i = 0; i < l.length; i++) {
    const x = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
    const lev = toDb(env);
    const over = lev - thr;
    if (over > 0) {
      const g = Math.pow(10, (-over * (1 - 1 / ratio)) / 20);
      l[i] *= g;
      r[i] *= g;
    }
  }
}

function widen(l: Float32Array, r: Float32Array, amount: number): void {
  const k = interp(amount, 0.6, 1, 1.4);
  for (let i = 0; i < l.length; i++) {
    const m = (l[i] + r[i]) / 2;
    const s = ((l[i] - r[i]) / 2) * k;
    l[i] = m + s;
    r[i] = m - s;
  }
}

/** Look-ahead brickwall (sample peak) limiter. */
function limit(l: Float32Array, r: Float32Array, sr: number, ceilingDb: number): void {
  const ceil = Math.pow(10, ceilingDb / 20);
  const la = Math.max(1, Math.round(0.005 * sr));
  const rel = Math.exp(-1 / (0.12 * sr));
  const n = l.length;
  // Required gain per sample, then a running minimum over the look-ahead window.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    need[i] = p > ceil ? ceil / p : 1;
  }
  let g = 1;
  const dq: number[] = [];
  let head = 0;
  for (let i = 0; i < n + la; i++) {
    if (i < n) {
      while (dq.length > head && need[dq[dq.length - 1]] >= need[i]) dq.pop();
      dq.push(i);
    }
    const j = i - la;
    if (j < 0) continue;
    while (dq[head] < j) head++;
    const target = head < dq.length ? need[dq[head]] : 1;
    g = target < g ? target : rel * g + (1 - rel) * target;
    if (g > target) g = target;
    l[j] *= g;
    r[j] *= g;
  }
}

const gainInPlace = (l: Float32Array, r: Float32Array, db: number) => {
  const k = Math.pow(10, db / 20);
  for (let i = 0; i < l.length; i++) {
    l[i] *= k;
    r[i] *= k;
  }
};

export function lufsOf(s: Stereo): number {
  return measureLoudness([s.left, s.right], s.sampleRate, { truePeak: false }).integratedLufs;
}
export function truePeakDbOf(s: Stereo): number {
  return toDb(Math.max(truePeak(s.left), truePeak(s.right)));
}

export function masterPreview(input: Stereo, target: MasterTargetId, settings: MasterSettings): Stereo {
  const sr = input.sampleRate;
  const goal = masterGoal(target, settings);
  const l = new Float32Array(input.left);
  const r = new Float32Array(input.right);
  const chain = [highpass(25, sr), shelf("low", 110, 1.5 * settings.bass, sr), shelf("high", 8000, 1.5 * settings.bright, sr)];
  let L: Float32Array = l;
  let R: Float32Array = r;
  for (const f of chain) {
    L = applyBiquad(L, f);
    R = applyBiquad(R, f);
  }
  compress(L, R, sr, settings.squash);
  widen(L, R, settings.width);
  const pre = { left: L, right: R, sampleRate: sr };
  const preLufs = lufsOf(pre);
  if (!Number.isFinite(preLufs)) return pre;
  let gain = goal.lufs - preLufs;
  let out: Stereo = pre;
  for (let it = 0; it < 6; it++) {
    const ol = new Float32Array(L);
    const or = new Float32Array(R);
    gainInPlace(ol, or, gain);
    limit(ol, or, sr, goal.tp - 0.6);
    out = { left: ol, right: or, sampleRate: sr };
    const tp = truePeakDbOf(out);
    if (tp > goal.tp) gainInPlace(ol, or, goal.tp - 0.05 - tp);
    const err = goal.lufs - lufsOf(out);
    if (Math.abs(err) <= 0.3) break;
    gain += err;
  }
  return out;
}

/** Peak-normalise (≤ ceilingDb) — used for loudness-matched A/B and the raw sum. */
export function loudnessMatchGainDb(a: Stereo, referenceLufs: number): number {
  const v = lufsOf(a);
  return Number.isFinite(v) && Number.isFinite(referenceLufs) ? referenceLufs - v : 0;
}

export function measureMaster(s: Stereo): MasterMetrics {
  const lo = measureLoudness([s.left, s.right], s.sampleRate);
  let ll = 0, rr = 0, lr = 0, mm = 0, ss = 0;
  const mono = new Float32Array(s.left.length);
  for (let i = 0; i < s.left.length; i++) {
    const a = s.left[i], b = s.right[i];
    ll += a * a; rr += b * b; lr += a * b;
    const m = (a + b) / 2, d = (a - b) / 2;
    mm += m * m; ss += d * d;
    mono[i] = m;
  }
  const correlation = ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : 1;
  const sideToMid = mm > 0 ? Math.sqrt(ss / mm) : 0;
  const st = stftBandPowers(mono, s.sampleRate, MASTER_BANDS.map((b) => ({ loHz: b.loHz, hiHz: Math.min(b.hiHz, s.sampleRate / 2) })), 4096);
  const sums = st.bands.map((arr) => arr.reduce((a, b) => a + b, 0));
  const total = sums.reduce((a, b) => a + b, 0) || 1e-20;
  const tonal = {} as MasterMetrics["tonal"];
  MASTER_BANDS.forEach((b, i) => {
    const db = 10 * Math.log10((sums[i] || 1e-20) / total);
    const ref = HIPHOP_REFERENCE_DB[b.id];
    tonal[b.id] = { db: Math.round(db * 10) / 10, ref, delta: Math.round((db - ref) * 10) / 10 };
  });
  const lufs = lo.integratedLufs;
  return {
    lufs,
    lraLu: lo.lraLu,
    truePeakDb: lo.truePeakDbtp,
    plr: Number.isFinite(lufs) ? lo.truePeakDbtp - lufs : 0,
    correlation: Math.round(correlation * 1000) / 1000,
    sideToMid: Math.round(sideToMid * 1000) / 1000,
    tonal,
    durationS: s.left.length / s.sampleRate,
  };
}
