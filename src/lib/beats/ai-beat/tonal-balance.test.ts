import { describe, expect, it } from "vitest";

import { balanceGeneratedWav, bandShares, planCorrection } from "@/lib/beats/ai-beat/tonal-balance";

const FS = 44100;

function wavOf(samples: Float32Array[], fs = FS): Uint8Array {
  const channels = samples.length;
  const frames = samples[0]!.length;
  const bytes = new Uint8Array(44 + frames * channels * 2);
  const v = new DataView(bytes.buffer);
  const tag = (o: number, t: string) => [...t].forEach((c, i) => (bytes[o + i] = c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + frames * channels * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, fs, true);
  v.setUint32(28, fs * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, frames * channels * 2, true);
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      v.setInt16(44 + (i * channels + c) * 2, Math.round((samples[c]![i] as number) * 32767), true);
    }
  }
  return bytes;
}

function tone(freqs: Array<[number, number]>, seconds = 3): Float32Array {
  const n = Math.round(FS * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (const [f, a] of freqs) s += a * Math.sin((2 * Math.PI * f * i) / FS);
    out[i] = s;
  }
  return out;
}

function readMono(bytes: Uint8Array): Float32Array {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = (bytes.byteLength - 44) / 4;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) out[i] = v.getInt16(44 + i * 4, true) / 32768;
  return out;
}

describe("balanceGeneratedWav", () => {
  it("trims a bass-heavy file, lifts its top end and keeps the peak under the ceiling", () => {
    const l = tone([[60, 0.55], [1000, 0.12], [4000, 0.01]]);
    const wav = wavOf([l, l]);
    const before = bandShares(readMono(wav), FS);
    const result = balanceGeneratedWav(wav);
    expect(result.report.applied).toBe(true);
    const after = readMono(result.bytes);
    const shares = bandShares(after, FS);
    expect(shares.low).toBeLessThan(before.low);
    expect(shares.high).toBeGreaterThan(before.high);
    let peak = 0;
    for (const x of after) peak = Math.max(peak, Math.abs(x));
    expect(peak).toBeLessThanOrEqual(0.9);
    expect(result.bytes.byteLength).toBe(wav.byteLength);
  });

  it("leaves a balanced file alone", () => {
    const l = tone([[100, 0.1], [800, 0.2], [3000, 0.12], [6000, 0.08]]);
    const wav = wavOf([l, l]);
    const result = balanceGeneratedWav(wav);
    expect(result.report.applied).toBe(false);
    expect(result.bytes).toBe(wav);
  });

  it("passes through anything that is not a 16-bit PCM WAV", () => {
    const junk = new Uint8Array(500).fill(7);
    expect(balanceGeneratedWav(junk).bytes).toBe(junk);
    expect(balanceGeneratedWav(junk).report.reason).toBe("unsupported");
  });

  it("does not touch a file shorter than a second", () => {
    const l = tone([[60, 0.5]], 0.3);
    const wav = wavOf([l, l]);
    expect(balanceGeneratedWav(wav).report.applied).toBe(false);
  });
});

describe("planCorrection", () => {
  it("caps both corrections and does nothing at target", () => {
    expect(planCorrection(0.5, 0.06)).toEqual({ lowCutDb: 0, highBoostDb: 0 });
    const hard = planCorrection(0.95, 0.001);
    expect(hard.lowCutDb).toBeLessThanOrEqual(7);
    expect(hard.highBoostDb).toBeLessThanOrEqual(9);
  });
});
