/**
 * Minimal radix-2 complex FFT for offline partitioned convolution (SFM-3D).
 * No external DSP dependency.
 */

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place Cooley–Tukey FFT. re/im length = n (power of 2). inverse scales 1/n. */
export function fftRadix2(
  re: Float64Array,
  im: Float64Array,
  inverse: boolean,
): void {
  const n = re.length;
  if (n !== im.length || n < 1 || (n & (n - 1)) !== 0) {
    throw new Error("fftRadix2 requires power-of-two equal re/im lengths");
  }
  // Bit-reverse
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
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const uRe = re[i + j]!;
        const uIm = im[i + j]!;
        const vRe = re[i + j + len / 2]! * wRe - im[i + j + len / 2]! * wIm;
        const vIm = re[i + j + len / 2]! * wIm + im[i + j + len / 2]! * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
  if (inverse) {
    const inv = 1 / n;
    for (let i = 0; i < n; i += 1) {
      re[i]! *= inv;
      im[i]! *= inv;
    }
  }
}

type FftPlan = { n: number; cos: Float64Array; sin: Float64Array; rev: Uint32Array };
const planCache = new Map<number, FftPlan>();

/** Twiddle + bit-reverse tables for a power-of-two size (cached; exact sin/cos per index). */
export function fftPlan(n: number): FftPlan {
  const hit = planCache.get(n);
  if (hit) return hit;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error("fftPlan requires a power-of-two size");
  const half = n >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; i += 1) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  let bits = 0;
  while (1 << bits < n) bits += 1;
  for (let i = 0; i < n; i += 1) {
    let r = 0;
    for (let b = 0; b < bits; b += 1) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const plan = { n, cos, sin, rev };
  if (planCache.size > 8) planCache.clear();
  planCache.set(n, plan);
  return plan;
}

/**
 * Table-driven in-place FFT (same convention as fftRadix2; inverse scales 1/n).
 * Radix-2 DIT with stages fused in pairs (radix-2², same arithmetic, half the
 * passes over memory).
 */
export function fftWithPlan(plan: FftPlan, re: Float64Array, im: Float64Array, inverse: boolean): void {
  const { n, cos, sin, rev } = plan;
  for (let i = 0; i < n; i += 1) {
    const j = rev[i]!;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  const sgn = inverse ? 1 : -1;
  let h = 1;
  let stages = 0;
  while (1 << stages < n) stages += 1;
  if (stages % 2 === 1) {
    // Lone first stage (span 1, twiddle 1).
    for (let a = 0; a < n; a += 2) {
      const ur = re[a]!, ui = im[a]!, vr = re[a + 1]!, vi = im[a + 1]!;
      re[a] = ur + vr;
      im[a] = ui + vi;
      re[a + 1] = ur - vr;
      im[a + 1] = ui - vi;
    }
    h = 2;
  }
  for (; h < n; h <<= 2) {
    const s1 = n / (2 * h);
    const s2 = n / (4 * h);
    const q = 4 * h;
    for (let base = 0; base < n; base += q) {
      for (let j = 0; j < h; j += 1) {
        const w1r = cos[j * s1]!, w1i = sgn * sin[j * s1]!;
        const w2r = cos[j * s2]!, w2i = sgn * sin[j * s2]!;
        // W_{4h}^{j+h} = W_{4h}^j · W_4 — exact rotation by ∓i.
        const w3r = inverse ? -w2i : w2i;
        const w3i = inverse ? w2r : -w2r;
        const a = base + j, b = a + h, c = b + h, d = c + h;
        const ar = re[a]!, ai = im[a]!;
        const br = re[b]!, bi = im[b]!;
        const cr = re[c]!, ci = im[c]!;
        const dr = re[d]!, di = im[d]!;
        const tbr = br * w1r - bi * w1i, tbi = br * w1i + bi * w1r;
        const tdr = dr * w1r - di * w1i, tdi = dr * w1i + di * w1r;
        const a1r = ar + tbr, a1i = ai + tbi, b1r = ar - tbr, b1i = ai - tbi;
        const c1r = cr + tdr, c1i = ci + tdi, d1r = cr - tdr, d1i = ci - tdi;
        const tcr = c1r * w2r - c1i * w2i, tci = c1r * w2i + c1i * w2r;
        const t3r = d1r * w3r - d1i * w3i, t3i = d1r * w3i + d1i * w3r;
        re[a] = a1r + tcr;
        im[a] = a1i + tci;
        re[c] = a1r - tcr;
        im[c] = a1i - tci;
        re[b] = b1r + t3r;
        im[b] = b1i + t3i;
        re[d] = b1r - t3r;
        im[d] = b1i - t3i;
      }
    }
  }
  if (inverse) {
    const inv = 1 / n;
    for (let i = 0; i < n; i += 1) {
      re[i]! *= inv;
      im[i]! *= inv;
    }
  }
}
