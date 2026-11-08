/**
 * Clip spectrogram + noise profile. Pure radix-2 STFT, no DSP deps.
 * Window 1024 / hop 256. Profile bands are mean magnitudes over ~256 FFT bins.
 */

const WIN = 1024;
const HOP = 256;
const BAND_BINS = 256;
const MAG_BINS = WIN >> 1;
const SPECTRAL_FLOOR = 0.05;
const GRID_MIN = 8;
const GRID_MAX = 128;

export type NoiseProfile = { bands: number[] };

function assertSampleRate(sampleRate: number): void {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate > 384_000) {
    throw new Error("BAD_SAMPLE_RATE");
  }
}

function clampGrid(n: number): number {
  if (!Number.isFinite(n)) return GRID_MIN;
  return Math.min(GRID_MAX, Math.max(GRID_MIN, Math.round(n)));
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place Cooley–Tukey. Inverse scales by 1/n. */
function fftRadix2(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k += 1) {
        const ang = (sign * 2 * Math.PI * k) / len;
        const wr = Math.cos(ang);
        const wi = Math.sin(ang);
        const a = i + k;
        const b = a + half;
        const xr = re[b]! * wr - im[b]! * wi;
        const xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
      }
    }
  }
  if (inverse) {
    const inv = 1 / n;
    for (let i = 0; i < n; i += 1) {
      re[i] = re[i]! * inv;
      im[i] = im[i]! * inv;
    }
  }
}

function hann(i: number, n: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
}

function sampleAt(mono: Float32Array, index: number): number {
  if (index < 0 || index >= mono.length) return 0;
  const s = mono[index] ?? 0;
  return Number.isFinite(s) ? s : 0;
}

/** Positive-frequency magnitudes, length n/2 (DC .. below Nyquist). `frame.length` must be a power of two. */
export function fftMag(frame: Float32Array): Float32Array {
  const n = frame.length;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error("FFT_SIZE");
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const s = frame[i] ?? 0;
    re[i] = Number.isFinite(s) ? s : 0;
  }
  fftRadix2(re, im, false);
  const half = n >> 1;
  const out = new Float32Array(half);
  for (let k = 0; k < half; k += 1) out[k] = Math.hypot(re[k]!, im[k]!);
  return out;
}

function bandCountForMags(magBins: number): number {
  return Math.max(1, Math.ceil(magBins / BAND_BINS));
}

function bandIndex(bin: number, magBins: number, bands: number): number {
  if (bands <= 1) return 0;
  const b = Math.floor((bin / magBins) * bands);
  return Math.min(bands - 1, Math.max(0, b));
}

export function noiseProfileFromSelection(mono: Float32Array, sampleRate: number): NoiseProfile {
  assertSampleRate(sampleRate);
  if (mono.length < 2048) throw new Error("NOISE_TOO_SHORT");
  const bandsN = bandCountForMags(MAG_BINS);
  const sum = new Float64Array(bandsN);
  const count = new Float64Array(bandsN);
  const frame = new Float32Array(WIN);
  for (let pos = 0; pos + WIN <= mono.length; pos += HOP) {
    for (let i = 0; i < WIN; i += 1) frame[i] = sampleAt(mono, pos + i) * hann(i, WIN);
    const mags = fftMag(frame);
    for (let k = 0; k < mags.length; k += 1) {
      const b = bandIndex(k, mags.length, bandsN);
      sum[b] = (sum[b] ?? 0) + (mags[k] ?? 0);
      count[b] = (count[b] ?? 0) + 1;
    }
  }
  const bands = Array.from({ length: bandsN }, (_, b) => {
    const c = count[b] ?? 0;
    return c > 0 ? (sum[b] ?? 0) / c : 0;
  });
  return { bands };
}

function gatedMag(mag: number, noise: number, amount: number): number {
  if (!(mag > 0)) return 0;
  const floor = mag * SPECTRAL_FLOOR;
  const subtracted = mag - amount * Math.max(0, noise);
  return Math.max(subtracted, floor);
}

/**
 * Spectral subtraction against `profile`. `amount` 0 returns a copy.
 * A magnitude floor (fraction of the original bin) keeps the signal off digital zero.
 */
export function applyNoiseProfile(
  mono: Float32Array,
  sampleRate: number,
  profile: NoiseProfile,
  amount: number,
): Float32Array {
  assertSampleRate(sampleRate);
  const out = new Float32Array(mono.length);
  if (!(amount > 0)) {
    out.set(mono);
    return out;
  }
  const amt = Math.min(1, amount);
  const bands = (profile.bands ?? []).map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const bandN = Math.max(1, bands.length);
  const re = new Float64Array(WIN);
  const im = new Float64Array(WIN);
  const acc = new Float64Array(mono.length);
  const start = -(WIN - HOP);
  for (let pos = start; pos < mono.length; pos += HOP) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < WIN; i += 1) re[i] = sampleAt(mono, pos + i) * hann(i, WIN);
    fftRadix2(re, im, false);
    const half = WIN >> 1;
    for (let k = 0; k <= half; k += 1) {
      const mag = k === 0 || k === half ? Math.abs(re[k]!) : Math.hypot(re[k]!, im[k]!);
      const noise = bands.length === 0 ? 0 : (bands[bandIndex(k === half ? half - 1 : k, half, bandN)] ?? 0);
      const next = gatedMag(mag, noise, amt);
      const gain = mag > 1e-18 ? next / mag : 0;
      if (k === 0 || k === half) {
        re[k] = (re[k]! < 0 ? -1 : 1) * next;
        im[k] = 0;
        continue;
      }
      re[k] = re[k]! * gain;
      im[k] = im[k]! * gain;
      const mk = WIN - k;
      re[mk] = re[mk]! * gain;
      im[mk] = im[mk]! * gain;
    }
    fftRadix2(re, im, true);
    for (let i = 0; i < WIN; i += 1) {
      const idx = pos + i;
      if (idx < 0 || idx >= mono.length) continue;
      const w = hann(i, WIN);
      out[idx] = (out[idx] ?? 0) + re[i]! * w;
      acc[idx] = (acc[idx] ?? 0) + w * w;
    }
  }
  for (let i = 0; i < out.length; i += 1) {
    const a = acc[i] ?? 0;
    const v = a > 1e-12 ? (out[i] ?? 0) / a : 0;
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
}

function columnMags(mono: Float32Array, center: number, fftSize: number): Float32Array {
  const frame = new Float32Array(fftSize);
  const half = fftSize >> 1;
  const start = center - half;
  for (let i = 0; i < fftSize; i += 1) frame[i] = sampleAt(mono, start + i) * hann(i, fftSize);
  return fftMag(frame);
}

function reduceRows(mags: Float32Array, rows: number): Float64Array {
  const out = new Float64Array(rows);
  const n = mags.length;
  for (let r = 0; r < rows; r += 1) {
    const a = Math.floor((r / rows) * n);
    const b = Math.max(a + 1, Math.floor(((r + 1) / rows) * n));
    let peak = 0;
    for (let k = a; k < b && k < n; k += 1) {
      const m = mags[k] ?? 0;
      if (m > peak) peak = m;
    }
    out[r] = peak;
  }
  return out;
}

/** Time columns (outer) × frequency rows (inner, low → high), each value in 0..1. Grid clamped to 8..128. */
export function spectrogramColumns(mono: Float32Array, columns: number, rows: number): number[][] {
  const cols = clampGrid(columns);
  const rws = clampGrid(rows);
  const grid: number[][] = Array.from({ length: cols }, () => Array.from({ length: rws }, () => 0));
  if (mono.length === 0) return grid;
  const fftSize = mono.length >= WIN ? WIN : Math.max(32, nextPow2(Math.max(2, mono.length)));
  const raw: Float64Array[] = [];
  let maxDb = 1e-12;
  for (let c = 0; c < cols; c += 1) {
    const center = Math.min(mono.length - 1, Math.floor(((c + 0.5) / cols) * mono.length));
    const reduced = reduceRows(columnMags(mono, center, fftSize), rws);
    raw.push(reduced);
    for (let r = 0; r < rws; r += 1) {
      const db = Math.log1p(reduced[r] ?? 0);
      if (db > maxDb) maxDb = db;
    }
  }
  for (let c = 0; c < cols; c += 1) {
    const col = grid[c]!;
    const reduced = raw[c]!;
    for (let r = 0; r < rws; r += 1) {
      const v = Math.log1p(reduced[r] ?? 0) / maxDb;
      col[r] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
    }
  }
  return grid;
}
