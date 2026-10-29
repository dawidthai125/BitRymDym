import { describe, expect, it } from "vitest";

import { fftInPlace, kWeightingFilters, truePeak } from "@/lib/studio/mix-analysis/dsp";
import { measureLoudness } from "@/lib/studio/mix-analysis/loudness";
import { computeMixMetrics, countClipEvents, stereoMetrics } from "@/lib/studio/mix-analysis/metrics";
import { stereoPan, type MixAnalysisInput } from "@/lib/studio/mix-analysis/render";
import { buildMixVerdict, MIX_THRESHOLDS } from "@/lib/studio/mix-analysis/verdict";

const dbfs = (db: number) => Math.pow(10, db / 20);

function sine(freq: number, seconds: number, amp: number, sr: number, phase = 0): Float32Array {
  const n = Math.round(seconds * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr + phase);
  return out;
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function noise(seconds: number, amp: number, sr: number, seed = 1): Float32Array {
  let s = seed;
  const out = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < out.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = amp * ((s / 2 ** 32) * 2 - 1);
  }
  return out;
}

describe("Stage 1 — BS.1770 K-weighting & loudness (±0.5 LU)", () => {
  it("48 kHz K-weighting coefficients match ITU-R BS.1770-4 Table 1/2", () => {
    const [shelf, hp] = kWeightingFilters(48000);
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 6);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 6);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 6);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 6);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 6);
    expect(hp.a1).toBeCloseTo(-1.99004745483398, 6);
    expect(hp.a2).toBeCloseTo(0.99007225036621, 6);
  });

  for (const sr of [48000, 44100, 32000]) {
    it(`EBU Tech 3341 case 1: stereo 1 kHz sine at −23 dBFS → −23 LUFS (${sr} Hz)`, () => {
      const s = sine(1000, 20, dbfs(-23), sr);
      const r = measureLoudness([s, s], sr);
      expect(Math.abs(r.integratedLufs - -23)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(r.shortTermMaxLufs - -23)).toBeLessThanOrEqual(0.5);
    });
  }

  it("EBU Tech 3341 case 2: −33 dBFS stereo 1 kHz → −33 LUFS", () => {
    const sr = 48000;
    const s = sine(1000, 20, dbfs(-33), sr);
    expect(Math.abs(measureLoudness([s, s], sr).integratedLufs - -33)).toBeLessThanOrEqual(0.5);
  });

  it("mono 997 Hz full-scale sine → −3.01 LKFS (BS.1770 reference)", () => {
    const sr = 48000;
    const r = measureLoudness([sine(997, 10, 1, sr)], sr);
    expect(Math.abs(r.integratedLufs - -3.01)).toBeLessThanOrEqual(0.5);
  });

  it("EBU Tech 3341 case 3: −36/−23/−36 dBFS 10 s each → relative gate → −23 LUFS", () => {
    const sr = 48000;
    const s = concat(sine(1000, 10, dbfs(-36), sr), sine(1000, 60, dbfs(-23), sr), sine(1000, 10, dbfs(-36), sr));
    const r = measureLoudness([s, s], sr, { truePeak: false });
    expect(Math.abs(r.integratedLufs - -23)).toBeLessThanOrEqual(0.5);
  });

  it("EBU Tech 3341 case 5: absolute gate ignores −72 dBFS segments", () => {
    const sr = 48000;
    const s = concat(sine(1000, 10, dbfs(-26), sr), sine(1000, 10, dbfs(-20), sr), sine(1000, 10, dbfs(-26), sr), sine(1000, 10, dbfs(-72), sr));
    const r = measureLoudness([s, s], sr, { truePeak: false });
    // Reference value from EBU Tech 3341 test 5: −23 ±0.1 LUFS (gated mix of −26/−20).
    expect(Math.abs(r.integratedLufs - -23)).toBeLessThanOrEqual(0.5);
  });

  it("silence → −∞ integrated", () => {
    const z = new Float32Array(48000 * 5);
    expect(measureLoudness([z, z], 48000).integratedLufs).toBe(-Infinity);
  });

  it("LRA of a steady tone ≈ 0 LU, and of −20/−30 alternation ≈ 10 LU", () => {
    const sr = 32000;
    const steady = sine(1000, 30, dbfs(-20), sr);
    expect(measureLoudness([steady, steady], sr, { truePeak: false }).lraLu).toBeLessThan(0.5);
    const alt = concat(sine(1000, 20, dbfs(-20), sr), sine(1000, 20, dbfs(-30), sr));
    expect(Math.abs(measureLoudness([alt, alt], sr, { truePeak: false }).lraLu - 10)).toBeLessThanOrEqual(1);
  });
});

describe("Stage 1 — true peak, FFT, stereo, clipping", () => {
  it("fs/4 sine at 45° phase: sample peak −3 dB, true peak ≈ 0 dBTP", () => {
    const sr = 48000;
    const s = sine(sr / 4, 1, 1, sr, Math.PI / 4);
    let sp = 0;
    for (const v of s) sp = Math.max(sp, Math.abs(v));
    expect(20 * Math.log10(sp)).toBeCloseTo(-3.01, 1);
    expect(Math.abs(20 * Math.log10(truePeak(s)))).toBeLessThanOrEqual(0.5);
  });

  it("FFT puts a bin-centred sine in its bin", () => {
    const n = 1024;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 37 * i) / n);
    fftInPlace(re, im);
    expect(Math.hypot(re[37], im[37])).toBeCloseTo(n / 2, 6);
    expect(Math.hypot(re[36], im[36])).toBeLessThan(1e-6);
  });

  it("correlation: mono = 1, inverted = −1, independent noise ≈ 0", () => {
    const a = noise(2, 0.3, 8000, 1);
    const b = noise(2, 0.3, 8000, 99);
    const inv = a.map((v) => -v);
    expect(stereoMetrics(a, a).correlation).toBeCloseTo(1, 6);
    expect(stereoMetrics(a, inv).correlation).toBeCloseTo(-1, 6);
    expect(Math.abs(stereoMetrics(a, b).correlation as number)).toBeLessThan(0.05);
  });

  it("counts runs of ≥3 full-scale samples as one clip event", () => {
    const s = new Float32Array(100);
    s.set([1, 1, 1, 1], 10);
    s.set([1, 1], 40);
    s.set([-1, -1, -1], 60);
    expect(countClipEvents(s)).toBe(2);
  });

  it("StereoPanner law: centre mono = −3 dB per side, hard left = all left", () => {
    const [l, r] = stereoPan(1, 1, true, 0);
    expect(l).toBeCloseTo(Math.SQRT1_2, 6);
    expect(r).toBeCloseTo(Math.SQRT1_2, 6);
    const [l2, r2] = stereoPan(1, 1, false, -1);
    expect(l2).toBeCloseTo(2, 6);
    expect(r2).toBeCloseTo(0, 6);
  });
});

function project(opts: {
  vocalDb: number;
  beatDb: number;
  adlibPan?: number;
  vocalNoiseDb?: number;
  sibilantDb?: number;
}): MixAnalysisInput {
  const sr = 16000;
  const sec = 12;
  // "Vocal": 300 Hz + 2 kHz partials, phrases with gaps (noise floor in gaps).
  const vocal = new Float32Array(sr * sec);
  const floor = noise(sec, dbfs(opts.vocalNoiseDb ?? -80), sr, 7);
  for (let i = 0; i < vocal.length; i++) {
    const t = i / sr;
    const on = Math.floor(t / 1.5) % 2 === 0 ? 1 : 0;
    vocal[i] = floor[i] + on * (0.5 * Math.sin(2 * Math.PI * 300 * t) + 0.5 * Math.sin(2 * Math.PI * 2000 * t));
  }
  if (opts.sibilantDb !== undefined) {
    const s = noise(sec, 1, sr, 3);
    // Short bursts of 5–9 kHz-ish energy (6.5 kHz tone) every phrase.
    for (let i = 0; i < vocal.length; i++) {
      const t = i / sr;
      if (Math.floor(t / 1.5) % 2 === 0 && t % 1.5 < 0.12) vocal[i] += dbfs(opts.sibilantDb) * Math.sin(2 * Math.PI * 6500 * t) + 0 * s[i];
    }
  }
  // "Beat": 80 Hz kick-ish tone + 500 Hz pad, continuous.
  // Broadband "beat": 80 Hz tone + white noise (covers 1–4 kHz and mask bands).
  const beat = noise(sec, 0.25, sr, 11);
  for (let i = 0; i < beat.length; i++) {
    beat[i] += 0.4 * Math.sin((2 * Math.PI * 80 * i) / sr);
  }
  const clip = (trackId: string, sourceKey: string) => ({
    trackId,
    sourceKey,
    sourceOffsetMs: 0,
    timelineStartMs: 0,
    durationMs: sec * 1000,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
  });
  return {
    sampleRate: sr,
    lengthMs: sec * 1000,
    masterGainDb: 0,
    masterPan: 0,
    tracks: [
      { id: "b", name: "Bit", role: "beat", gainDb: opts.beatDb, pan: 0, muted: false, solo: false },
      { id: "v", name: "Wokal", role: "lead_vocal", gainDb: opts.vocalDb, pan: 0, muted: false, solo: false },
      { id: "a", name: "Adlib", role: "adlib", gainDb: opts.vocalDb - 8, pan: opts.adlibPan ?? -0.4, muted: false, solo: false },
    ],
    clips: [clip("b", "beat"), clip("v", "vocal"), clip("a", "vocal")],
    sources: { beat: { channels: [beat] }, vocal: { channels: [vocal] } },
  };
}

const card = (v: ReturnType<typeof buildMixVerdict>, id: string) => v.cards.find((c) => c.id === id);

describe("Stage 1 — mix metrics & verdict on synthetic projects", () => {
  it("balanced mix: vocal above beat, clean, adlib panned → no red, mastering allowed", () => {
    const m = computeMixMetrics(project({ vocalDb: -12, beatDb: -9 }));
    const v = buildMixVerdict(m);
    expect(m.vocalVsBeatLu as number).toBeGreaterThanOrEqual(MIX_THRESHOLDS.balance.greenMin);
    expect(m.vocalVsBeatLu as number).toBeLessThanOrEqual(MIX_THRESHOLDS.balance.greenMax);
    expect(card(v, "balance")?.status).toBe("green");
    expect(card(v, "masking")?.status).toBe("green");
    expect(card(v, "presence")?.status).toBe("green");
    expect(card(v, "noise")?.status).toBe("green");
    expect(card(v, "panorama")?.status).toBe("green");
    expect(card(v, "clipping")?.status).toBe("green");
    expect(v.redCount).toBe(0);
    expect(v.canMaster).toBe(true);
  });

  it("vocal far under the beat → balance, presence and masking red, mastering blocked", () => {
    const m = computeMixMetrics(project({ vocalDb: -40, beatDb: 0 }));
    const v = buildMixVerdict(m);
    expect(m.vocalVsBeatLu as number).toBeLessThan(MIX_THRESHOLDS.balance.yellowMin);
    expect(card(v, "balance")?.status).toBe("red");
    expect(card(v, "balance")?.messageKey).toBe("vocalBuried");
    expect(card(v, "presence")?.status).toBe("red");
    expect(card(v, "masking")?.status).toBe("red");
    expect(v.canMaster).toBe(false);
    expect(v.overall).toBe("red");
  });

  it("loud room noise in vocal gaps → noise red", () => {
    const m = computeMixMetrics(project({ vocalDb: -12, beatDb: -9, vocalNoiseDb: -20 }));
    expect(card(buildMixVerdict(m), "noise")?.status).toBe("red");
  });

  it("adlib in the centre → panorama yellow", () => {
    const m = computeMixMetrics(project({ vocalDb: -12, beatDb: -9, adlibPan: 0 }));
    expect(card(buildMixVerdict(m), "panorama")?.messageKey).toBe("adlibsCentred");
  });

  it("hot gain → clipping red", () => {
    const m = computeMixMetrics(project({ vocalDb: 12, beatDb: 6 }));
    expect(card(buildMixVerdict(m), "clipping")?.status).toBe("red");
  });

  it("harsh 6.5 kHz bursts far above the vocal → sibilance red; none → green", () => {
    const harsh = computeMixMetrics(project({ vocalDb: -12, beatDb: -9, sibilantDb: 6 }));
    expect(card(buildMixVerdict(harsh), "sibilance")?.status).toBe("red");
    const clean = computeMixMetrics(project({ vocalDb: -12, beatDb: -9 }));
    expect(card(buildMixVerdict(clean), "sibilance")?.status).toBe("green");
  });

  it("progress callback reaches 1", () => {
    const seen: number[] = [];
    computeMixMetrics(project({ vocalDb: -12, beatDb: -9 }), (f) => seen.push(f));
    expect(seen.at(-1)).toBe(1);
  });
});

describe("mixAnalysisTimeoutMs", () => {
  it("keeps 45 s for short projects and scales to the 300 s ceiling for 4:00 × 8 tracks", async () => {
    const { mixAnalysisTimeoutMs, MIX_ANALYSIS_TIMEOUT_MS, MIX_ANALYSIS_MAX_TIMEOUT_MS } = await import("./client");
    expect(mixAnalysisTimeoutMs([{ durationMs: 30000, muted: false }])).toBe(MIX_ANALYSIS_TIMEOUT_MS);
    expect(mixAnalysisTimeoutMs([{ durationMs: 240000, muted: false }, { durationMs: 240000, muted: false }])).toBe(150000);
    expect(mixAnalysisTimeoutMs([{ durationMs: 240000, muted: true }])).toBe(MIX_ANALYSIS_TIMEOUT_MS);
    const eight = Array.from({ length: 8 }, () => ({ durationMs: 240000, muted: false }));
    expect(mixAnalysisTimeoutMs(eight)).toBe(MIX_ANALYSIS_MAX_TIMEOUT_MS);
  });
});
