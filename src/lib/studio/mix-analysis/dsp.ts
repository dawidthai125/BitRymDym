/**
 * Stage 1 — Mix analysis DSP primitives (own implementation, no deps).
 * K-weighting per ITU-R BS.1770-4 (coefficients derived for any sample rate,
 * same closed form as libebur128 / pyloudnorm), radix-2 FFT, 4× true peak.
 */

export type Biquad = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

/** BS.1770 stage 1 (head-related high shelf) + stage 2 (RLB high-pass). */
export function kWeightingFilters(sampleRate: number): [Biquad, Biquad] {
  // Stage 1 — high shelf.
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / sampleRate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // Stage 2 — high pass.
  const f1 = 38.13547087602444;
  const Q1 = 0.5003270373238773;
  const K1 = Math.tan((Math.PI * f1) / sampleRate);
  const d = 1 + K1 / Q1 + K1 * K1;
  const hp: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K1 * K1 - 1)) / d,
    a2: (1 - K1 / Q1 + K1 * K1) / d,
  };
  return [shelf, hp];
}

/** Direct form I biquad; returns a new array. */
export function applyBiquad(input: Float32Array, f: Biquad): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

export function kWeight(input: Float32Array, sampleRate: number): Float32Array {
  const [shelf, hp] = kWeightingFilters(sampleRate);
  return applyBiquad(applyBiquad(input, shelf), hp);
}

/** In-place iterative radix-2 FFT (re/im length must be a power of two). */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export type BandSpec = { loHz: number; hiHz: number };

/**
 * Short-time band powers (Hann, hop = size/2). Returns frames × bands
 * (mean power per bin, linear) and per-frame full-band mean square.
 */
export function stftBandPowers(
  signal: Float32Array,
  sampleRate: number,
  bands: readonly BandSpec[],
  size = 2048,
): { bands: Float64Array[]; full: Float64Array; hopSeconds: number } {
  const hop = size >> 1;
  const frames = signal.length < size ? 0 : Math.floor((signal.length - size) / hop) + 1;
  const win = new Float64Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  const binHz = sampleRate / size;
  const ranges = bands.map((b) => [
    Math.max(1, Math.round(b.loHz / binHz)),
    Math.min(size / 2, Math.round(b.hiHz / binHz)),
  ]);
  const out = bands.map(() => new Float64Array(frames));
  const full = new Float64Array(frames);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  // Hann power normalization so a full-scale sine reads ~its power.
  let wsum = 0;
  for (let i = 0; i < size; i++) wsum += win[i] * win[i];
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    let ms = 0;
    for (let i = 0; i < size; i++) {
      const s = signal[off + i];
      ms += s * s;
      re[i] = s * win[i];
      im[i] = 0;
    }
    full[f] = ms / size;
    fftInPlace(re, im);
    for (let b = 0; b < ranges.length; b++) {
      const [lo, hi] = ranges[b];
      let p = 0;
      for (let k = lo; k <= hi; k++) p += re[k] * re[k] + im[k] * im[k];
      out[b][f] = (2 * p) / (wsum * size);
    }
  }
  return { bands: out, full, hopSeconds: hop / sampleRate };
}

/** 4× oversampled true peak (windowed-sinc polyphase, 48 taps). Linear. */
export function truePeak(signal: Float32Array): number {
  const OS = 4;
  const TAPS = 12; // per phase
  const half = TAPS / 2;
  const phases: Float64Array[] = [];
  for (let p = 0; p < OS; p++) {
    const h = new Float64Array(TAPS);
    for (let t = 0; t < TAPS; t++) {
      const x = t - half + 1 - p / OS; // distance in input samples
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / (half + 0.5));
      h[t] = sinc * w;
    }
    phases.push(h);
  }
  let peak = 0;
  const n = signal.length;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(signal[i]);
    if (a > peak) peak = a;
  }
  for (let i = half; i < n - half; i++) {
    for (let p = 1; p < OS; p++) {
      const h = phases[p];
      let acc = 0;
      const base = i - half + 1;
      for (let t = 0; t < TAPS; t++) acc += h[t] * signal[base + t];
      const a = Math.abs(acc);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

export function toDb(linear: number, floor = -120): number {
  if (!(linear > 0)) return floor;
  return Math.max(floor, 20 * Math.log10(linear));
}

export function powerToDb(power: number, floor = -120): number {
  if (!(power > 0)) return floor;
  return Math.max(floor, 10 * Math.log10(power));
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const arr = Array.from(values).sort((a, b) => a - b);
  if (arr.length === 0) return NaN;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.round((p / 100) * (arr.length - 1))));
  return arr[idx];
}
