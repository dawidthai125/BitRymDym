/** „Ścisz pod bit”: the WAV export ducks like the live engine and the master (shared track-sidechain math). */
import { describe, expect, it } from "vitest";

import type { DecodedPcmStereo } from "@/lib/audio/render-decode";
import { applyTrackSidechain } from "@/lib/studio/mix-analysis/track-sidechain";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import { createStudioFxInstance } from "@/lib/studio/studio-fx-chain";
import { renderStudioDocumentOffline, STUDIO_OFFLINE_RENDER_SAMPLE_RATE as SR } from "@/lib/studio/studio-offline-render";

const N = SR; // 1 s
const chain = {
  schemaVersion: 1 as const,
  effects: [
    { ...createStudioFxInstance("sidechain", () => "3fa85f64-5717-4562-b3fc-2c963f66b001"), params: { depth: 0.65, attackMs: 8, releaseMs: 140 } },
  ],
};
const vocal = (i: number) => 0.3 * Math.sin((2 * Math.PI * 300 * i) / SR);
const beat = (i: number) => (i >= N / 4 && i < N / 2 ? 0.6 * Math.sin((2 * Math.PI * 90 * i) / SR) : 0);

function pcm(f: (i: number) => number): DecodedPcmStereo {
  const interleaved = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) interleaved[i * 2] = interleaved[i * 2 + 1] = f(i);
  return { sampleRate: SR, channels: 2, interleaved, frames: N };
}

function doc(beatTrack: { gainDb: number; muted: boolean }, fx: unknown): StudioEngineDocument {
  const base = { sourceOffsetMs: 0, timelineStartMs: 0, durationMs: 1000, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0 };
  return {
    timelineLengthMs: 1000, masterGainDb: 0, masterPan: 0, projectBeatId: "b",
    tracks: [
      { id: "v", trackType: "VOCAL", gainDb: 0, pan: 0, muted: false, solo: false, ...(fx ? { effectsChain: fx } : {}) },
      { id: "b", trackType: "BEAT", pan: 0, solo: false, ...beatTrack },
    ],
    clips: [
      { ...base, id: "c1", trackId: "v", sourceKind: "TAKE", sourceTakeId: "t", sourceBeatId: null },
      { ...base, id: "c2", trackId: "b", sourceKind: "BEAT_REF", sourceTakeId: null, sourceBeatId: "b" },
    ],
  } as unknown as StudioEngineDocument;
}

const render = (d: StudioEngineDocument) =>
  renderStudioDocumentOffline({ document: d, resolvePcm: (k) => (k.kind === "TAKE" ? pcm(vocal) : pcm(beat)) });

describe("WAV export: sidechain", () => {
  it("matches the master's duck sample for sample, with the key after the beat fader", async () => {
    const out = await render(doc({ gainDb: -6, muted: false }, chain));
    // Dry tracks come from the same renderer, so only the duck is compared.
    const dryVocal = await render(doc({ gainDb: -6, muted: true }, null));
    const dryMix = await render(doc({ gainDb: -6, muted: false }, null));
    const side = (f: (i: number, c: number) => number, c: number) => Float32Array.from({ length: N }, (_, i) => f(i, c));
    const voc = (i: number, c: number) => dryVocal.interleaved[i * 2 + c]!;
    const bit = (i: number, c: number) => dryMix.interleaved[i * 2 + c]! - dryVocal.interleaved[i * 2 + c]!;
    const v = { trackType: "VOCAL", effectsChain: chain, left: side(voc, 0), right: side(voc, 1) };
    const b = { trackType: "BEAT", left: side(bit, 0), right: side(bit, 1) };
    applyTrackSidechain([v, b], SR);
    let worst = 0;
    for (let i = 0; i < N; i++) worst = Math.max(worst, Math.abs(out.interleaved[i * 2]! - (v.left[i]! + b.left[i]!)));
    expect(worst).toBeLessThan(1e-4);
    // The duck really happens under the beat.
    const rms = (f: (i: number) => number, a: number, z: number) => Math.sqrt(Array.from({ length: z - a }, (_, k) => f(a + k) ** 2).reduce((x, y) => x + y, 0) / (z - a));
    expect(rms((i) => v.left[i]!, Math.round(N * 0.35), N / 2)).toBeLessThan(0.75 * rms(vocal, Math.round(N * 0.35), N / 2));
  });

  it("a muted beat does not duck the vocal; the last partial block is written", async () => {
    const wet = await render(doc({ gainDb: 0, muted: true }, chain));
    const dry = await render(doc({ gainDb: 0, muted: true }, null));
    expect(wet.interleaved).toEqual(dry.interleaved);
    expect(wet.interleaved.slice(-200).some((x) => x !== 0)).toBe(true);
  });
});
