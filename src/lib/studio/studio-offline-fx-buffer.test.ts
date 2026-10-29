/**
 * Whole-buffer offline FX (E3 render speed-up) ≡ the per-sample reference path.
 */
import { describe, expect, it } from "vitest";

import { createStudioFxInstance, type StudioFxType } from "@/lib/studio/studio-fx-chain";
import { buildStudioOfflineFxChain } from "@/lib/studio/studio-offline-fx";
import { fftPlan, fftRadix2, fftWithPlan } from "@/lib/studio/studio-offline-fx-fft";

const SR = 44100;
let k = 0;
const id = () => `3fa85f64-5717-4562-b3fc-2c963f66a${String(++k).padStart(3, "0")}`;

function noise(n: number, seed: number): Float32Array {
  let s = seed;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    // Bursts with silent gaps: exercises gate/compressor attack + release.
    a[i] = 0.8 * ((s / 2 ** 32) * 2 - 1) * Math.max(0, Math.sin(i / 3000));
  }
  return a;
}

function tweak(e: ReturnType<typeof createStudioFxInstance>) {
  const p = e.params as Record<string, unknown> & Record<string, Record<string, number>>;
  if (e.type === "compressor") Object.assign(p, { thresholdDb: -24, ratio: 4 });
  if (e.type === "limiter") Object.assign(p, { thresholdDb: -6 });
  if (e.type === "deesser" || e.type === "gate") Object.assign(p, { thresholdDb: -30 });
  if (e.type === "eq") { p.low.gainDb = 3; p.mid.gainDb = -2; p.high.gainDb = 4; }
  if (e.type === "delay" || e.type === "reverb") Object.assign(p, { mix: 0.3 });
  return e;
}

function compare(types: StudioFxType[], n: number, decay?: number) {
  const chainJson = {
    schemaVersion: 1,
    effects: types.map((t) => {
      const e = tweak(createStudioFxInstance(t, id));
      if (e.type === "reverb" && decay) (e.params as { decaySeconds: number }).decaySeconds = decay;
      return e;
    }),
  };
  const role = types.includes("limiter") ? "master" : "track";
  const a = buildStudioOfflineFxChain(chainJson, role, SR)!;
  const b = buildStudioOfflineFxChain(chainJson, role, SR)!;
  const l1 = noise(n, 1), r1 = noise(n, 2);
  const l2 = l1.slice(), r2 = r1.slice();
  const s = { left: 0, right: 0 };
  for (let i = 0; i < n; i++) {
    s.left = l1[i]; s.right = r1[i];
    const o = a.process(s);
    l1[i] = o.left; r1[i] = o.right;
  }
  b.processBuffer(l2, r2);
  let md = 0, pk = 0;
  for (let i = 0; i < n; i++) {
    md = Math.max(md, Math.abs(l1[i] - l2[i]), Math.abs(r1[i] - r2[i]));
    pk = Math.max(pk, Math.abs(l1[i]), Math.abs(r1[i]));
  }
  return { md, pk };
}

describe("offline FX whole-buffer path", () => {
  it.each([["eq"], ["compressor"], ["limiter"], ["deesser"], ["highpass"], ["gate"], ["delay"]] as StudioFxType[][])(
    "%s is sample-exact vs per-sample", (t) => {
      const { md } = compare([t], SR * 3);
      expect(md).toBeLessThanOrEqual(1e-7);
    });

  it.each([0.1, 1.2, 3])("reverb (decay %ss) nulls ≤ -120 dB incl. wet latency", (decay) => {
    const { md, pk } = compare(["reverb"], SR * 6, decay);
    expect(pk).toBeGreaterThan(0.1);
    expect(20 * Math.log10(md / pk + 1e-30)).toBeLessThan(-120);
  });

  it("full vocal chain nulls ≤ -120 dB", () => {
    const { md, pk } = compare(["highpass", "eq", "deesser", "compressor", "delay", "reverb"], SR * 5, 1.8);
    expect(20 * Math.log10(md / pk + 1e-30)).toBeLessThan(-120);
  });

  it("reverb with mix 0 is an exact passthrough", () => {
    const e = createStudioFxInstance("reverb", id);
    (e.params as { mix: number }).mix = 0;
    const c = buildStudioOfflineFxChain({ schemaVersion: 1, effects: [e] }, "track", SR)!;
    const l = noise(SR, 3), r = noise(SR, 4);
    const l0 = l.slice(), r0 = r.slice();
    c.processBuffer(l, r);
    expect(l).toEqual(l0);
    expect(r).toEqual(r0);
  });
});

describe("table FFT", () => {
  it.each([2, 8, 1024, 1 << 15])("n=%i matches fftRadix2 and round-trips", (n) => {
    const re = new Float64Array(n).map((_, i) => Math.sin(i * 0.37) + (i % 7) / 7);
    const im = new Float64Array(n).map((_, i) => Math.cos(i * 0.11));
    const r1 = re.slice(), i1 = im.slice(), r2 = re.slice(), i2 = im.slice();
    fftRadix2(r1, i1, false);
    fftWithPlan(fftPlan(n), r2, i2, false);
    let md = 0;
    for (let i = 0; i < n; i++) md = Math.max(md, Math.abs(r1[i] - r2[i]), Math.abs(i1[i] - i2[i]));
    expect(md).toBeLessThan(1e-8 * n);
    fftWithPlan(fftPlan(n), r2, i2, true);
    for (let i = 0; i < n; i++) expect(Math.abs(r2[i] - re[i])).toBeLessThan(1e-12);
  });
});
