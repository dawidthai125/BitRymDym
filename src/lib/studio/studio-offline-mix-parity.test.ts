/** WAV export vs the mix-analysis / master render: pan law (mono and stereo files) and the rap pocket. */
import { describe, expect, it } from "vitest";

import type { DecodedPcmStereo } from "@/lib/audio/render-decode";
import { renderMixStereo } from "@/lib/studio/master/render-mix";
import type { MixAnalysisInput } from "@/lib/studio/mix-analysis/render";
import { studioEngineDocumentFromProject } from "@/lib/studio/studio-engine-document-from-project";
import { createStudioFxInstance, type StudioFxType } from "@/lib/studio/studio-fx-chain";
import { renderStudioDocumentOffline, STUDIO_OFFLINE_RENDER_SAMPLE_RATE as SR } from "@/lib/studio/studio-offline-render";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

const MS = 2000;
const N = (SR * MS) / 1000;
const tone = (hz: number, amp: number) => Float32Array.from({ length: N }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
const MONO = [tone(110, 0.3)];
const STEREO = [tone(110, 0.3), tone(170, 0.1)];
const BEAT = [tone(900, 0.4), tone(900, 0.4)];

let n = 0;
const chain = (type: StudioFxType) => ({
  schemaVersion: 1 as const,
  effects: [createStudioFxInstance(type, () => `3fa85f64-5717-4562-b3fc-2c963f66c${String(++n).padStart(3, "0")}`)],
});

function pcm(channels: Float32Array[]): DecodedPcmStereo {
  const interleaved = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    interleaved[i * 2] = channels[0]![i]!;
    interleaved[i * 2 + 1] = (channels[1] ?? channels[0]!)[i]!;
  }
  return { sampleRate: SR, channels: 2, interleaved, frames: N };
}

type Case = { vocal: Float32Array[]; pan?: number; fx?: StudioFxType; beat?: boolean; masterPan?: number; gainDb?: number; off?: boolean; markers?: { kind: "verse" | "hook"; positionMs: number }[] };

async function both(c: Case) {
  const inserted = c.fx ? chain(c.fx) : null;
  if (inserted && c.off) inserted.effects[0]!.enabled = false;
  const effectsChain = inserted ?? { schemaVersion: 1 as const, effects: [] };
  const clipBase = { sourceOffsetMs: 0, timelineStartMs: 0, durationMs: MS, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0 };
  const strip = { gainDb: 0, muted: false, solo: false };
  const vocal = { id: "v", name: "V", trackRole: "lead_vocal", trackType: "VOCAL", pan: c.pan ?? 0, effectsChain, ...strip, gainDb: c.gainDb ?? 0 };
  const beat = { id: "b", name: "B", trackRole: "beat", trackType: "BEAT", pan: 0, effectsChain: { schemaVersion: 1, effects: [] }, ...strip };
  const tracks = c.beat ? [vocal, beat] : [vocal];
  const doc = {
    project: { id: "p", beatId: "b1", timelineLengthMs: MS, masterGainDb: 0, masterPan: c.masterPan ?? 0, masterFxChain: { schemaVersion: 1, effects: [] } },
    tracks,
    markers: (c.markers ?? []).map((m, i) => ({ id: `m${i}`, label: "", ...m })),
    clips: [
      { ...clipBase, id: "c1", trackId: "v", sourceKind: "TAKE", sourceTakeId: "t", sourceBeatId: null },
      ...(c.beat ? [{ ...clipBase, id: "c2", trackId: "b", sourceKind: "BEAT_REF", sourceTakeId: null, sourceBeatId: "b1" }] : []),
    ],
  } as unknown as StudioProjectDocument;
  const out = await renderStudioDocumentOffline({
    document: studioEngineDocumentFromProject(doc),
    resolvePcm: (k) => pcm(k.kind === "TAKE" ? c.vocal : BEAT),
  });
  const mix = renderMixStereo({
    sampleRate: SR, lengthMs: MS, masterGainDb: 0, masterPan: c.masterPan ?? 0, markers: c.markers ?? [],
    tracks: tracks.map((t) => ({ id: t.id, name: t.name, role: t.trackRole, trackType: t.trackType, gainDb: t.gainDb, pan: t.pan, muted: false, solo: false, effectsChain: t.effectsChain })),
    clips: [{ ...clipBase, trackId: "v", sourceKey: "take" }, ...(c.beat ? [{ ...clipBase, trackId: "b", sourceKey: "beat" }] : [])],
    sources: { take: { channels: c.vocal }, beat: { channels: BEAT } },
  } as unknown as MixAnalysisInput);
  return { out: out.interleaved, mix };
}

const rmsDb = (at: (i: number) => number, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += at(i) ** 2;
  return 10 * Math.log10(s / (to - from) + 1e-12);
};

/** Both channels, in both halves: level within 0.05 dB (the two readers round clip positions differently by a sample). */
async function expectSame(c: Case) {
  const { out, mix } = await both(c);
  for (const [from, to] of [[SR / 10, N / 2], [N / 2 + SR / 10, N]] as const) {
    expect(Math.abs(rmsDb((i) => out[i * 2]!, from, to) - rmsDb((i) => mix.left[i]!, from, to))).toBeLessThan(0.05);
    expect(Math.abs(rmsDb((i) => out[i * 2 + 1]!, from, to) - rmsDb((i) => mix.right[i]!, from, to))).toBeLessThan(0.05);
  }
  return { out, mix };
}

describe("WAV export matches the mix render", () => {
  it("mono file at centre plays at unity on both sides, with and without inserts", async () => {
    const src = rmsDb((i) => MONO[0]![i]!, SR / 10, N / 2);
    for (const c of [{}, { fx: "compressor", off: true }, { fx: "reverb", off: true }, { fx: "gate", off: true }] as const) {
      const { out } = await expectSame({ vocal: MONO, ...c });
      expect(rmsDb((i) => out[i * 2]!, SR / 10, N / 2) - src).toBeCloseTo(0, 1);
      expect(rmsDb((i) => out[i * 2 + 1]!, SR / 10, N / 2) - src).toBeCloseTo(0, 1);
    }
  });

  it("mono file panned, and through inserts", async () => {
    await expectSame({ vocal: MONO, pan: 0.5 });
    for (const fx of ["highpass", "reverb", "compressor", "gate", "deesser"] as const) await expectSame({ vocal: MONO, pan: -0.7, fx });
  });

  it("the fader sits after the inserts: a compressor hears the same signal at every fader", async () => {
    const level = async (gainDb: number) => {
      const { out } = await expectSame({ vocal: MONO, fx: "compressor", gainDb });
      return rmsDb((i) => out[i * 2]!, SR / 10, N);
    };
    const zero = await level(0);
    expect((await level(12)) - zero).toBeCloseTo(12, 1);
    expect((await level(-12)) - zero).toBeCloseTo(-12, 1);
    await expectSame({ vocal: STEREO, fx: "compressor", gainDb: 9, pan: 0.4 });
  });

  it("stereo file: unity at centre, equal power when panned, master pan too", async () => {
    const { out } = await expectSame({ vocal: STEREO });
    expect(out[2 * 12345]).toBeCloseTo(STEREO[0]![12345]!, 1);
    await expectSame({ vocal: STEREO, pan: -0.4 });
    await expectSame({ vocal: STEREO, pan: 0.6, fx: "highpass" });
    await expectSame({ vocal: STEREO, masterPan: 0.3 });
  });

  it("rap pocket: verse level, hook double and the beat duck", async () => {
    const markers = [{ kind: "verse" as const, positionMs: 0 }, { kind: "hook" as const, positionMs: MS / 2 }];
    await expectSame({ vocal: MONO, beat: true, fx: "pocket", markers });
    await expectSame({ vocal: STEREO, beat: true, fx: "pocket" });
    const dry = await both({ vocal: MONO, beat: true });
    const wet = await both({ vocal: MONO, beat: true, fx: "pocket" });
    expect(rmsDb((i) => wet.out[i * 2]!, SR / 10, N)).toBeLessThan(rmsDb((i) => dry.out[i * 2]!, SR / 10, N) - 0.5);
  });
});
