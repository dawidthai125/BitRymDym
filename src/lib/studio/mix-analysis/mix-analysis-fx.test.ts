import { describe, expect, it } from "vitest";

import { computeMixMetrics } from "@/lib/studio/mix-analysis/metrics";
import type { MixAnalysisInput } from "@/lib/studio/mix-analysis/render";

const SR = 32000;
const FX = "3fa85f64-5717-4562-b3fc-2c963f66afc1";

function sine(freq: number, seconds: number, amp: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

function input(effectsChain?: unknown, masterEffectsChain?: unknown): MixAnalysisInput {
  return {
    sampleRate: SR,
    lengthMs: 3000,
    masterGainDb: 0,
    masterPan: 0,
    masterEffectsChain,
    tracks: [
      { id: "v", name: "Wokal", role: "lead_vocal", gainDb: 0, pan: 0, muted: false, solo: false, effectsChain },
    ],
    clips: [
      { trackId: "v", sourceKey: "s", sourceOffsetMs: 0, timelineStartMs: 0, durationMs: 3000, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0 },
    ],
    sources: { s: { channels: [sine(60, 3, 0.5)] } },
  };
}

describe("Stage 2 — analysis renders track/master FX (re-analysis after fixes)", () => {
  it("dry vs disabled chain are identical; enabled highpass lowers 60 Hz energy", () => {
    const dry = computeMixMetrics(input());
    const off = computeMixMetrics(
      input({ schemaVersion: 1, effects: [{ id: FX, type: "highpass", enabled: false, params: { frequencyHz: 300, q: 0.707 } }] }),
    );
    expect(off.tracks[0]?.integratedLufs).toBeCloseTo(dry.tracks[0]!.integratedLufs, 6);
    const hp = computeMixMetrics(
      input({ schemaVersion: 1, effects: [{ id: FX, type: "highpass", enabled: true, params: { frequencyHz: 300, q: 0.707 } }] }),
    );
    expect(hp.tracks[0]!.integratedLufs).toBeLessThan(dry.tracks[0]!.integratedLufs - 20);
  });

  it("master FX chain (limiter) is applied before master gain", () => {
    const dry = computeMixMetrics(input());
    const lim = computeMixMetrics(
      input(undefined, {
        schemaVersion: 1,
        effects: [{ id: FX, type: "limiter", enabled: true, params: { thresholdDb: -20, ceilingDb: -1 } }],
      }),
    );
    expect(lim.master.samplePeakDbfs).toBeLessThan(dry.master.samplePeakDbfs - 5);
  });

  it("invalid chain never throws — falls back to dry", () => {
    const bad = computeMixMetrics(input({ schemaVersion: 99, effects: [] }));
    expect(Number.isFinite(bad.tracks[0]!.integratedLufs)).toBe(true);
  });
});
