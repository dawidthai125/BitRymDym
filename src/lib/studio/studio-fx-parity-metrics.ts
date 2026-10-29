/**
 * Stage I.13b — metrics for OfflineAudioContext ↔ offline PCM comparison.
 * Local harness only. No production I/O.
 */

export type SignalMetrics = {
  sampleRate: number;
  frames: number;
  durationMs: number;
  peakAbs: number;
  rms: number;
  rmsL: number;
  rmsR: number;
  nanInfCount: number;
  clipCount: number;
  energyL: number;
  energyR: number;
};

export function countNanInf(interleaved: Float32Array): number {
  let n = 0;
  for (let i = 0; i < interleaved.length; i++) {
    const v = interleaved[i]!;
    if (!Number.isFinite(v)) n++;
  }
  return n;
}

/** Sample-peak clips: |x| > 1 (float PCM convention). */
export function countClips(interleaved: Float32Array, threshold = 1): number {
  let n = 0;
  for (let i = 0; i < interleaved.length; i++) {
    if (Math.abs(interleaved[i]!) > threshold) n++;
  }
  return n;
}

export function channelRms(interleaved: Float32Array, ch: 0 | 1): number {
  let s = 0;
  let n = 0;
  for (let i = ch; i < interleaved.length; i += 2) {
    const v = interleaved[i] ?? 0;
    s += v * v;
    n++;
  }
  return n ? Math.sqrt(s / n) : 0;
}

export function channelEnergy(interleaved: Float32Array, ch: 0 | 1): number {
  let s = 0;
  for (let i = ch; i < interleaved.length; i += 2) {
    const v = interleaved[i] ?? 0;
    s += v * v;
  }
  return s;
}

export function peakAndRms(interleaved: Float32Array): {
  peakAbs: number;
  rms: number;
} {
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < interleaved.length; i++) {
    const s = interleaved[i] ?? 0;
    const a = Math.abs(s);
    if (a > peak) peak = a;
    sumSq += s * s;
  }
  return {
    peakAbs: peak,
    rms: interleaved.length > 0 ? Math.sqrt(sumSq / interleaved.length) : 0,
  };
}

export function measureSignal(
  interleaved: Float32Array,
  sampleRate: number,
): SignalMetrics {
  const frames = Math.floor(interleaved.length / 2);
  const { peakAbs, rms } = peakAndRms(interleaved);
  return {
    sampleRate,
    frames,
    durationMs: (frames / sampleRate) * 1000,
    peakAbs,
    rms,
    rmsL: channelRms(interleaved, 0),
    rmsR: channelRms(interleaved, 1),
    nanInfCount: countNanInf(interleaved),
    clipCount: countClips(interleaved),
    energyL: channelEnergy(interleaved, 0),
    energyR: channelEnergy(interleaved, 1),
  };
}

/** Pearson correlation on mono mixdown after integer-sample lag. */
export function correlateMono(
  a: Float32Array,
  b: Float32Array,
  lagSamples = 0,
): number {
  const frames = Math.min(Math.floor(a.length / 2), Math.floor(b.length / 2));
  if (frames < 8) return 0;
  const mono = (src: Float32Array, i: number) =>
    0.5 * ((src[i * 2] ?? 0) + (src[i * 2 + 1] ?? 0));

  let n = 0;
  let sumA = 0;
  let sumB = 0;
  let sumAA = 0;
  let sumBB = 0;
  let sumAB = 0;
  for (let i = 0; i < frames; i++) {
    const j = i + lagSamples;
    if (j < 0 || j >= frames) continue;
    const va = mono(a, i);
    const vb = mono(b, j);
    n++;
    sumA += va;
    sumB += vb;
    sumAA += va * va;
    sumBB += vb * vb;
    sumAB += va * vb;
  }
  if (n < 8) return 0;
  const meanA = sumA / n;
  const meanB = sumB / n;
  const cov = sumAB / n - meanA * meanB;
  const va = sumAA / n - meanA * meanA;
  const vb = sumBB / n - meanB * meanB;
  if (!(va > 0) || !(vb > 0)) return 0;
  return cov / Math.sqrt(va * vb);
}

/** Best lag in [-maxLag, maxLag] maximizing |correlation|. */
export function bestCorrelateMono(
  a: Float32Array,
  b: Float32Array,
  maxLagSamples: number,
): { lag: number; correlation: number } {
  let bestLag = 0;
  let best = -Infinity;
  for (let lag = -maxLagSamples; lag <= maxLagSamples; lag++) {
    const c = correlateMono(a, b, lag);
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return { lag: bestLag, correlation: best };
}

/**
 * Band energy via Goertzel-like DFT bin around centerHz (mono mixdown).
 * Used for EQ direction checks — not a full spectrum analyzer.
 */
export function bandEnergyNear(
  interleaved: Float32Array,
  sampleRate: number,
  centerHz: number,
  halfWidthHz: number,
): number {
  const frames = Math.floor(interleaved.length / 2);
  if (frames < 16) return 0;
  const lo = Math.max(1, centerHz - halfWidthHz);
  const hi = Math.min(sampleRate / 2 - 1, centerHz + halfWidthHz);
  // Discrete sum of |X(k)|^2 for bins in [lo, hi] via direct DFT (short fixtures).
  const n = Math.min(frames, sampleRate); // at most 1s window from start
  let energy = 0;
  const k0 = Math.floor((lo * n) / sampleRate);
  const k1 = Math.ceil((hi * n) / sampleRate);
  for (let k = k0; k <= k1; k++) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / n;
    for (let i = 0; i < n; i++) {
      const s = 0.5 * ((interleaved[i * 2] ?? 0) + (interleaved[i * 2 + 1] ?? 0));
      re += s * Math.cos(w * i);
      im -= s * Math.sin(w * i);
    }
    energy += re * re + im * im;
  }
  return energy;
}

/** First frame where |mono| exceeds threshold (onset). */
export function firstOnsetFrame(
  interleaved: Float32Array,
  threshold: number,
): number {
  const frames = Math.floor(interleaved.length / 2);
  for (let i = 0; i < frames; i++) {
    const m = Math.abs(
      0.5 * ((interleaved[i * 2] ?? 0) + (interleaved[i * 2 + 1] ?? 0)),
    );
    if (m >= threshold) return i;
  }
  return -1;
}

export function windowEnergy(
  interleaved: Float32Array,
  startFrame: number,
  endFrame: number,
): number {
  const frames = Math.floor(interleaved.length / 2);
  const a = Math.max(0, Math.min(frames, startFrame));
  const b = Math.max(a, Math.min(frames, endFrame));
  let e = 0;
  for (let i = a; i < b; i++) {
    const l = interleaved[i * 2] ?? 0;
    const r = interleaved[i * 2 + 1] ?? 0;
    e += l * l + r * r;
  }
  return e;
}

export function dbRatio(num: number, den: number): number {
  if (!(num > 0) || !(den > 0)) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(num / den);
}
