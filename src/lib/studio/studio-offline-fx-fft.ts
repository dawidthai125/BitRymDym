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
