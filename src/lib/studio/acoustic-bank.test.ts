import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { encodePcm16Wav } from "@/lib/studio/samples/sample-synth";
import { renderMidiNotes } from "@/lib/studio/studio-midi";
import {
  loadAcousticBank,
  nearestAcousticNote,
  parseAcousticCatalog,
  parseWavPcm16,
  renderAcousticNote,
  type AcousticNote,
} from "@/lib/studio/acoustic-bank";
import { loadAcousticBankFromPublic } from "@/lib/studio/acoustic-bank-node";

function note(pcm: number[], root = 60): AcousticNote {
  return { root, rate: 100, pcm: Float32Array.from(pcm), loopStart: null, loopEnd: null };
}

describe("acoustic bank", () => {
  it("reads a 16-bit wav and skips a bad catalog row", () => {
    const wav = encodePcm16Wav(Float32Array.from([0, 0.5, -0.5, 0.25]), 44100);
    const parsed = parseWavPcm16(wav);
    expect(parsed?.rate).toBe(44100);
    expect(parsed?.pcm[1]).toBeCloseTo(0.5, 2);
    const catalog = parseAcousticCatalog(new TextEncoder().encode(JSON.stringify({
      notes: [
        { instrument: "piano", root: 60, file: "piano-c4.wav", loopStart: null, loopEnd: null },
        { instrument: "horn", root: 60, file: "../secret.wav" },
        { instrument: "guitar", root: 40, file: "guitar-40.wav", loopStart: 10, loopEnd: 40 },
      ],
    })));
    expect(catalog.map((row) => row.file)).toEqual(["piano-c4.wav", "guitar-40.wav"]);
    expect(catalog[1]?.loopStart).toBe(10);
  });

  it("plays the recorded root and doubles the read for an octave", () => {
    const ramp = Array.from({ length: 20 }, (_, i) => (i + 1) / 20);
    const played = renderAcousticNote({
      note: note(ramp),
      pitch: 60,
      length: 8,
      sampleRate: 100,
    });
    expect(played[1]).toBeCloseTo(0.1, 5);
    const octave = renderAcousticNote({
      note: note(ramp),
      pitch: 72,
      length: 8,
      sampleRate: 100,
    });
    expect(octave[1]).toBeCloseTo(0.15, 5);
    const picked = nearestAcousticNote([note([1], 48), note([1], 60), note([1], 72)], 70);
    expect(picked?.root).toBe(72);
  });

  it("loops inside the recorded note and leaves the synthesizer when no bank is passed", () => {
    const looped = renderAcousticNote({
      note: {
        ...note([0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 0.1, 0.2]),
        loopStart: 2,
        loopEnd: 10,
      },
      pitch: 60,
      length: 12,
      sampleRate: 100,
    });
    expect(looped[0]).toBeCloseTo(0.05, 5);
    expect(looped[10]).toBeCloseTo(0.25, 5);
    const synth = renderMidiNotes({
      notes: [{ t: 0, dur: 50, pitch: 60, vel: 1 }],
      instrument: "piano",
      sampleRate: 100,
      durationMs: 50,
    });
    const recorded = renderMidiNotes({
      notes: [{ t: 0, dur: 50, pitch: 60, vel: 1 }],
      instrument: "piano",
      sampleRate: 100,
      durationMs: 50,
      bank: { piano: [note([0.2, 0.8, 0.2, 0.8, 0.2])], guitar: [], bass: [] },
    });
    expect(synth.some((sample) => Math.abs(sample) > 0.02)).toBe(true);
    expect(recorded.some((sample, i) => sample !== synth[i])).toBe(true);
  });

  it("loads the shipped CC0 piano, bass, and guitar", async () => {
    const bank = await loadAcousticBankFromPublic();
    expect(bank?.piano.map((item) => item.root)).toEqual([36, 48, 60, 72]);
    expect(bank?.bass.map((item) => item.root)).toEqual([36, 48]);
    expect(bank?.guitar).toHaveLength(13);
    const guitar = bank?.guitar.find((item) => item.root === 36);
    expect(guitar?.loopStart).toBe(657845);
    expect(guitar && guitar.loopEnd && guitar.loopEnd <= guitar.pcm.length).toBe(true);
    const loud = bank?.piano.find((item) => item.root === 60);
    let peak = 0;
    if (loud) for (const sample of loud.pcm) peak = Math.max(peak, Math.abs(sample));
    expect(peak).toBeGreaterThan(0.5);
    const license = await readFile(path.join(process.cwd(), "public", "acoustic", "LICENSE.txt"), "utf8");
    expect(license.startsWith("Creative Commons Legal Code")).toBe(true);
    expect(license.includes("CC0 1.0 Universal")).toBe(true);
  });

  it("builds a bank from bytes the caller supplies", async () => {
    const wav = encodePcm16Wav(Float32Array.from([0, 0.5, -0.5, 0.25]), 16000);
    const catalog = new TextEncoder().encode(JSON.stringify({
      notes: [{ instrument: "bass", root: 36, file: "bass-c2.wav", loopStart: null, loopEnd: null }],
    }));
    const loaded = await loadAcousticBank(async (file) => {
      if (file === "catalog.json") return catalog;
      if (file === "bass-c2.wav") return wav;
      return null;
    });
    expect(loaded?.bass[0]?.root).toBe(36);
    expect(loaded?.piano).toEqual([]);
  });
});
