/**
 * Stage 1 — ITU-R BS.1770-4 / EBU R128 loudness (own implementation).
 * Momentary 400 ms, short-term 3 s (100 ms hop), integrated with
 * absolute (-70 LUFS) and relative (-10 LU) gating, LRA (EBU Tech 3342).
 */

import { kWeight, percentile, toDb, truePeak } from "@/lib/studio/mix-analysis/dsp";

export type LoudnessResult = {
  /** Integrated loudness, LUFS (-Infinity when fully gated / silent). */
  integratedLufs: number;
  /** Loudest 3 s short-term loudness, LUFS. */
  shortTermMaxLufs: number;
  /** Short-term series (100 ms hop), LUFS. */
  shortTermLufs: number[];
  /** Loudness range, LU. */
  lraLu: number;
  samplePeakDbfs: number;
  truePeakDbtp: number;
};

const SEG_SECONDS = 0.1;

function loudnessFromPower(power: number): number {
  return power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity;
}

/** Sum over channels of K-weighted mean square per 100 ms segment. */
function segmentPowers(channels: readonly Float32Array[], sampleRate: number): Float64Array {
  const seg = Math.round(sampleRate * SEG_SECONDS);
  const len = channels[0]?.length ?? 0;
  const count = Math.floor(len / seg);
  const out = new Float64Array(count);
  for (const ch of channels) {
    const k = kWeight(ch, sampleRate);
    for (let s = 0; s < count; s++) {
      let acc = 0;
      const off = s * seg;
      for (let i = 0; i < seg; i++) acc += k[off + i] * k[off + i];
      out[s] += acc / seg;
    }
  }
  return out;
}

function windowPowers(seg: Float64Array, width: number): number[] {
  const out: number[] = [];
  if (seg.length < width) return out;
  let acc = 0;
  for (let i = 0; i < width; i++) acc += seg[i];
  out.push(acc / width);
  for (let i = width; i < seg.length; i++) {
    acc += seg[i] - seg[i - width];
    out.push(Math.max(0, acc) / width);
  }
  return out;
}

export function integratedFromBlocks(blockPowers: readonly number[]): number {
  const abs = blockPowers.filter((p) => loudnessFromPower(p) > -70);
  if (abs.length === 0) return -Infinity;
  const absMean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = loudnessFromPower(absMean) - 10;
  const gated = abs.filter((p) => loudnessFromPower(p) > rel);
  if (gated.length === 0) return -Infinity;
  return loudnessFromPower(gated.reduce((a, b) => a + b, 0) / gated.length);
}

export function measureLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
  opts: { truePeak?: boolean } = {},
): LoudnessResult {
  const seg = segmentPowers(channels, sampleRate);
  const momentary = windowPowers(seg, 4); // 400 ms blocks, 75% overlap
  const shortPow = windowPowers(seg, 30); // 3 s, 100 ms hop
  const integratedLufs = integratedFromBlocks(momentary);
  const shortTermLufs = shortPow.map(loudnessFromPower);
  let shortTermMaxLufs = -Infinity;
  for (const v of shortTermLufs) if (v > shortTermMaxLufs) shortTermMaxLufs = v;
  // Short program (< 3 s): fall back to the whole-signal momentary max.
  if (shortTermLufs.length === 0) {
    for (const p of momentary) {
      const v = loudnessFromPower(p);
      if (v > shortTermMaxLufs) shortTermMaxLufs = v;
    }
  }
  // LRA — EBU Tech 3342.
  const absST = shortPow.filter((p) => loudnessFromPower(p) > -70);
  let lraLu = 0;
  if (absST.length > 1) {
    const mean = absST.reduce((a, b) => a + b, 0) / absST.length;
    const rel = loudnessFromPower(mean) - 20;
    const gated = absST.map(loudnessFromPower).filter((v) => v > rel);
    if (gated.length > 1) lraLu = percentile(gated, 95) - percentile(gated, 10);
  }
  let sp = 0;
  let tp = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > sp) sp = a;
    }
    if (opts.truePeak !== false) tp = Math.max(tp, truePeak(ch));
  }
  return {
    integratedLufs,
    shortTermMaxLufs,
    shortTermLufs,
    lraLu,
    samplePeakDbfs: toDb(sp),
    truePeakDbtp: opts.truePeak === false ? toDb(sp) : toDb(tp),
  };
}
