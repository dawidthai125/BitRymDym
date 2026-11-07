import { describe, expect, it } from "vitest";

import { STUDIO_FX_DEFAULTS } from "@/lib/studio/studio-fx-chain";

import { stemFileName } from "./render-io";
import { renderMixStems, renderMixStereo } from "./render-mix";

const SR = 8000;

function rms(buf: Float32Array, a: number, b: number): number {
  let s = 0;
  const n = Math.max(1, b - a);
  for (let i = a; i < b; i++) s += buf[i]! * buf[i]!;
  return Math.sqrt(s / n);
}

function song(masterGainDb: number, vocalGainDb: number, pocket: boolean) {
  const n = SR;
  const beat = new Float32Array(n);
  const vocal = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    beat[i] = Math.sin((2 * Math.PI * 1000 * i) / SR) * 0.4;
    if (i > n / 2) vocal[i] = 0.5;
  }
  const chain = pocket
    ? { schemaVersion: 1, effects: [{ id: "00000000-0000-4000-8000-000000000001", type: "pocket", enabled: true, params: { ...STUDIO_FX_DEFAULTS.pocket, depth: 1, verseDb: -6, hookDb: 0 } }] }
    : undefined;
  return {
    sampleRate: SR,
    lengthMs: 1000,
    masterGainDb,
    masterPan: 0,
    tracks: [
      { id: "beat", name: "Bit", role: "beat" as const, gainDb: 0, pan: 0, muted: false, solo: false },
      { id: "vox", name: "Wokal", role: "lead_vocal" as const, gainDb: vocalGainDb, pan: 0, muted: false, solo: false, effectsChain: chain },
      { id: "mute", name: "Cicho", role: "adlib" as const, gainDb: 0, pan: 0, muted: true, solo: false },
    ],
    clips: [
      { trackId: "beat", sourceKey: "b", sourceOffsetMs: 0, timelineStartMs: 0, durationMs: 1000, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0 },
      { trackId: "vox", sourceKey: "v", sourceOffsetMs: 0, timelineStartMs: 0, durationMs: 1000, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0 },
      { trackId: "mute", sourceKey: "v", sourceOffsetMs: 0, timelineStartMs: 0, durationMs: 1000, gainDb: 0, muted: false, fadeInMs: 0, fadeOutMs: 0 },
    ],
    sources: { b: { channels: [beat, beat.slice()] }, v: { channels: [vocal, vocal.slice()] } },
    markers: [{ kind: "verse" as const, positionMs: 0 }, { kind: "hook" as const, positionMs: 500 }],
  };
}

describe("renderMixStems", () => {
  it("names a dry stem and a mix stem", () => {
    expect(stemFileName(1, "Wokal", "dry")).toBe("01-wokal.wav");
    expect(stemFileName(1, "Wokal", "mix")).toBe("01-wokal-mix.wav");
  });

  it("keeps track gain, drops master gain, silences a muted track, and ducks the beat under the pocket", () => {
    const quiet = renderMixStems(song(-40, 0, true));
    const loud = renderMixStems(song(0, 0, true));
    const hotter = renderMixStems(song(0, 6, false));
    const beat = quiet.find((s) => s.id === "beat")!;
    const vox = quiet.find((s) => s.id === "vox")!;
    const muted = quiet.find((s) => s.id === "mute")!;
    expect(rms(beat.audio.left, 0, SR)).toBeCloseTo(rms(loud.find((s) => s.id === "beat")!.audio.left, 0, SR), 5);
    expect(rms(hotter.find((s) => s.id === "vox")!.audio.left, SR / 2, SR)).toBeGreaterThan(rms(vox.audio.left, SR / 2, SR) * 1.5);
    expect(rms(muted.audio.left, 0, SR)).toBe(0);
    const early = rms(beat.audio.left, 400, 2400);
    const late = rms(beat.audio.left, 5600, SR - 10);
    expect(late).toBeLessThan(early * 0.85);
    const summed = renderMixStereo(song(-40, 0, true));
    expect(rms(summed.left, SR / 2, SR)).toBeLessThan(rms(vox.audio.left, SR / 2, SR));
  });
});
