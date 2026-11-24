/** M4 — analysis and master hear clip tempo, pitch, reverse/scratch and ducking like playback / export. */
import { describe, expect, it } from "vitest";

import { buildMixAnalysisSkeleton } from "@/lib/studio/mix-analysis/client";
import { computeMixMetrics } from "@/lib/studio/mix-analysis/metrics";
import { renderTrack, type MixAnalysisClip, type MixAnalysisInput } from "@/lib/studio/mix-analysis/render";
import { createStudioFxInstance } from "@/lib/studio/studio-fx-chain";
import { renderMixStereo } from "@/lib/studio/master/render-mix";
import { renderStudioDocumentOffline } from "@/lib/studio/studio-offline-render";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

const SR = 44100;
const N = SR; // 1 s source
/** Rising chirp: any change of direction, tempo or pitch moves energy. */
const chirp = (() => {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    out[i] = 0.4 * Math.sin(2 * Math.PI * (120 * t + 160 * t * t));
  }
  return out;
})();

function clip(over: Partial<MixAnalysisClip> = {}): MixAnalysisClip {
  return { trackId: "v", sourceKey: "take:1", sourceOffsetMs: 0, timelineStartMs: 0, durationMs: 1000, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0, ...over };
}
function input(c: MixAnalysisClip, effectsChain?: unknown): MixAnalysisInput {
  return {
    sampleRate: SR, lengthMs: 2000, masterGainDb: 0, masterPan: 0,
    tracks: [{ id: "v", name: "V", role: "lead_vocal", trackType: "VOCAL", gainDb: 0, pan: 0, muted: false, solo: false, effectsChain }],
    clips: [c],
    sources: { "take:1": { channels: [chirp, chirp] } },
  };
}
async function exported(c: MixAnalysisClip) {
  const res = await renderStudioDocumentOffline({
    document: {
      timelineLengthMs: 2000, masterGainDb: 0, masterPan: 0,
      tracks: [{ id: "v", gainDb: 0, pan: 0, muted: false, solo: false }],
      clips: [{ ...c, id: "c", sourceKind: "TAKE", sourceTakeId: "1", sourceBeatId: null }],
    },
    resolvePcm: () => {
      const interleaved = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) interleaved[2 * i] = interleaved[2 * i + 1] = chirp[i]!;
      return { sampleRate: SR, channels: 2, frames: N, interleaved };
    },
  } as Parameters<typeof renderStudioDocumentOffline>[0]);
  const left = new Float32Array(res.frames);
  for (let i = 0; i < res.frames; i++) left[i] = res.interleaved[2 * i]!;
  return left;
}
function corr(a: Float32Array, b: Float32Array): number {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { ab += a[i]! * b[i]!; aa += a[i]! ** 2; bb += b[i]! ** 2; }
  return ab / Math.sqrt(aa * bb || 1);
}

const CASES: [string, Partial<MixAnalysisClip>][] = [
  ["plain", {}],
  ["stretch 2×", { stretchRatio: 2, durationMs: 2000 }],
  ["pitch +700 cents", { pitchCents: 700 }],
  ["reverse", { scratchReverse: true }],
  ["reverse + stretch + offset", { scratchReverse: true, stretchRatio: 1.5, sourceOffsetMs: 100, durationMs: 1200 }],
  ["scratch cue + rate", { scratchCueMs: 100, scratchRate: 1.5, durationMs: 500 }],
];

describe("clip playback in the mix render", () => {
  it.each(CASES)("%s matches the WAV export", async (_name, over) => {
    const c = clip(over);
    const dry = renderTrack(input(c), input(c).tracks[0]!, false);
    expect(corr(dry.left, await exported(c))).toBeGreaterThan(0.995);
    // Same read positions through the FX path.
    const eqFlat = { schemaVersion: 1, effects: [createStudioFxInstance("eq", () => "3fa85f64-5717-4562-b3fc-2c963f66c001")] };
    const wet = input(c, eqFlat);
    expect(corr(dry.left, renderTrack(wet, wet.tracks[0]!, false).left)).toBeGreaterThan(0.99);
  });

  it("stretch, pitch and reverse really change the rendered sound", () => {
    const plain = renderMixStereo(input(clip()));
    for (const over of [{ stretchRatio: 2, durationMs: 2000 }, { pitchCents: 700 }, { scratchReverse: true }]) {
      expect(Math.abs(corr(plain.left, renderMixStereo(input(clip(over))).left))).toBeLessThan(0.5);
      expect(Math.abs(corr(plain.left, renderMixStereo(input(clip(over)), { raw: true }).left))).toBeLessThan(0.5);
    }
  });

  it("the skeleton carries the clip playback fields and the track type", () => {
    const doc = {
      project: { id: "p", beatId: null, timelineLengthMs: 2000, masterGainDb: 0, masterPan: 0, masterFxChain: { schemaVersion: 1, effects: [] } },
      tracks: [{ id: "v", name: "V", trackRole: "lead_vocal", trackType: "VOCAL", gainDb: 0, pan: 0, muted: false, solo: false, effectsChain: { schemaVersion: 1, effects: [] } }],
      clips: [{ id: "c", trackId: "v", sourceKind: "TAKE", sourceTakeId: "1", sourceBeatId: null, sourceOffsetMs: 0, timelineStartMs: 0, durationMs: 1000, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0, stretchRatio: 2, pitchCents: 8, scratchCueMs: 5, scratchReverse: true, scratchRate: 1.5 }],
    } as unknown as StudioProjectDocument;
    const s = buildMixAnalysisSkeleton(doc);
    expect(s.clips[0]).toMatchObject({ stretchRatio: 2, pitchCents: 8, scratchCueMs: 5, scratchReverse: true, scratchRate: 1.5 });
    expect(s.tracks[0]!.trackType).toBe("VOCAL");
  });
});

describe("ducking in the mix render", () => {
  let n = 0;
  const fx = (type: "sidechain" | "pocket", params: Record<string, number>) => ({
    schemaVersion: 1,
    effects: [{ ...createStudioFxInstance(type, () => `3fa85f64-5717-4562-b3fc-2c963f66b${String(++n).padStart(3, "0")}`), params }],
  });
  const tone = (hz: number, amp: number, on: (t: number) => boolean) => {
    const out = new Float32Array(SR * 4);
    for (let i = 0; i < out.length; i++) if (on(i / SR)) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
    return out;
  };
  const rms = (a: Float32Array, from: number, to: number) => {
    let s = 0;
    for (let i = Math.round(from * SR); i < Math.round(to * SR); i++) s += a[i]! ** 2;
    return Math.sqrt(s / ((to - from) * SR));
  };
  const base = (vocalFx: unknown, beatRole: "beat" | "instrument" = "beat"): MixAnalysisInput => ({
    sampleRate: SR, lengthMs: 4000, masterGainDb: 0, masterPan: 0,
    tracks: [
      { id: "v", name: "V", role: "lead_vocal", trackType: "VOCAL", gainDb: 0, pan: 0, muted: false, solo: false, effectsChain: vocalFx },
      { id: "b", name: "B", role: beatRole, trackType: "BEAT", gainDb: 0, pan: 0, muted: false, solo: false },
    ],
    clips: [clip({ durationMs: 4000 }), clip({ trackId: "b", sourceKey: "beat:1", durationMs: 4000 })],
    sources: {
      "take:1": { channels: [tone(300, 0.3, () => true)] },
      "beat:1": { channels: [tone(900, 0.6, (t) => t >= 2)] },
    },
  });

  it("sidechain: the vocal dips while the beat plays, in analysis and in the master", () => {
    const dry = base(undefined);
    const wet = base(fx("sidechain", { depth: 0.65, attackMs: 8, releaseMs: 140 }));
    const renderedWet = renderMixStereo(wet);
    const diff = renderMixStereo(dry).left.map((v, k) => v - renderedWet.left[k]!);
    // dry − wet = the removed vocal: nothing before the beat, ~65 % (−9 dB) under it.
    expect(rms(diff, 0.5, 1.5)).toBeLessThan(1e-6);
    expect(rms(diff, 2.5, 3.5)).toBeGreaterThan(0.08);
    const a = computeMixMetrics(dry).tracks.find((t) => t.trackId === "v")!;
    const b = computeMixMetrics(wet).tracks.find((t) => t.trackId === "v")!;
    expect(a.integratedLufs - b.integratedLufs).toBeGreaterThan(1);
  });

  it("pocket: the analysis measures the ducked beat and the section level", () => {
    const dry = computeMixMetrics(base(undefined));
    const wet = computeMixMetrics(base(fx("pocket", { verseDb: -3, hookDb: 0, depth: 0.5, doubleMs: 20, doubleCents: 0, doubleDb: -24 })));
    const lufs = (m: typeof dry, id: string) => m.tracks.find((t) => t.trackId === id)!.integratedLufs;
    // −3 dB section level; a mono vocal gets the same 3 dB back from the pan law (the live pocket node is stereo).
    const mono = wet.tracks.find((t) => t.trackId === "v")!.monoSource === true;
    expect(lufs(dry, "v") - lufs(wet, "v")).toBeCloseTo(mono ? 0 : 3, 1);
    expect(lufs(dry, "b") - lufs(wet, "b")).toBeGreaterThan(1.5);
    expect(wet.tracks.map((t) => t.trackId)).toEqual(["v", "b"]);
  });
});
