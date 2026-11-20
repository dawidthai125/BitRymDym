import { describe, expect, it } from "vitest";

import { encodeWav16 } from "./sample-lab-dsp";
import {
  buildSamplePrompt,
  checkSampleRequest,
  decodeWav16,
  findSamplePreset,
  generationSeconds,
  keyPhrase,
  parseSampleGenBody,
  shapeLoop,
  shapeOneShot,
} from "./sample-generator";

const SR = 44100;
const tone = (seconds: number, startSilence = 0) => {
  const x = new Float32Array(Math.round(SR * seconds));
  for (let i = Math.round(startSilence * SR); i < x.length; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR);
  return x;
};

describe("sample generator", () => {
  it("writes a one-instrument loop prompt with tempo, bars and key", () => {
    const p = buildSamplePrompt({ preset: findSamplePreset("rhodes")!, type: "loop", bpm: 90, bars: 4, key: "Am", style: "lo-fi" });
    expect(p).toContain("Rhodes");
    expect(p).toContain("in A minor");
    expect(p).toContain("90 BPM");
    expect(p).toContain("4 bars");
    expect(p).toContain("no drums");
    expect(p).toContain("lo-fi");
    const d = buildSamplePrompt({ preset: findSamplePreset("boombap")!, type: "loop", bpm: 90, bars: 2, key: "Am", style: "" });
    expect(d).toContain("drums only");
    expect(d).not.toContain("minor");
    const o = buildSamplePrompt({ preset: findSamplePreset("bass808")!, type: "oneshot", bpm: null, bars: null, key: "F1", style: "" });
    expect(o).toContain("one-shot");
    expect(o).toContain("tuned to F1");
    expect(keyPhrase("F#")).toBe("in F# major");
  });

  it("refuses impossible requests in Polish", () => {
    const strings = findSamplePreset("strings")!;
    expect(checkSampleRequest({ preset: strings, type: "oneshot", bpm: null, bars: null, key: null, style: "" })).toContain("typu");
    expect(checkSampleRequest({ preset: strings, type: "loop", bpm: 70, bars: 16, key: null, style: "" })).toContain("30 s");
    expect(checkSampleRequest({ preset: strings, type: "loop", bpm: 90, bars: 4, key: null, style: "" })).toBeNull();
    expect(generationSeconds({ type: "loop", bpm: 90, bars: 4 })).toBe(14);
    expect(parseSampleGenBody({ preset: "nope" })).toEqual({ ok: false, error: "Wybierz instrument." });
    const ok = parseSampleGenBody({ preset: "piano", type: "loop", bpm: "92", bars: 4, key: "Dm", style: "jazz" });
    expect(ok.ok && ok.req.bpm).toBe(92);
  });

  it("cuts a loop to exact bars from its first sound", () => {
    const loop = shapeLoop([tone(14, 0.5), tone(14, 0.5)], SR, 90, 4)!;
    expect(loop[0]!.length).toBe(Math.round(((4 * 4 * 60) / 90) * SR));
    expect(Math.max(...Array.from(loop[0]!.subarray(0, 2000), Math.abs))).toBeGreaterThan(0.5);
  });

  it("trims a one-shot and keeps the 1 s catalog minimum", () => {
    const hit = tone(0.4, 0.3);
    const out = shapeOneShot([hit], SR)!;
    expect(out[0]!.length).toBe(Math.ceil(1.02 * SR));
    expect(Math.max(...Array.from(out[0]!.subarray(0, 2000), Math.abs))).toBeGreaterThan(0.5);
  });

  it("reads back a 16-bit WAV", () => {
    const wav = encodeWav16([tone(1), tone(1)], SR);
    const back = decodeWav16(wav)!;
    expect(back.sampleRate).toBe(SR);
    expect(back.channels).toHaveLength(2);
    expect(back.channels[0]!.length).toBe(SR);
    expect(decodeWav16(new Uint8Array(10))).toBeNull();
  });
});

describe("one-shot tuning", () => {
  const sine = (hz: number, s = 1) => {
    const x = new Float32Array(Math.round(44100 * s));
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / 44100) + 0.2 * Math.sin((2 * Math.PI * 2 * hz * i) / 44100);
    return x;
  };
  it("reads a low 808 note that the time-domain tracker misread", async () => {
    const { oneShotNote, oneShotFundamentalHz } = await import("./sample-generator");
    expect(oneShotNote(sine(49), 44100)).toBe("G1");
    expect(oneShotFundamentalHz(sine(110), 44100)).toBeCloseTo(110, 0);
  });
  it("retunes G1 to F1 and refuses huge shifts", async () => {
    const { noteNameToHz, oneShotNote, retuneOneShot } = await import("./sample-generator");
    const out = retuneOneShot([sine(49)], 49, noteNameToHz("F1")!)!;
    expect(oneShotNote(out[0]!, 44100)).toBe("F1");
    expect(retuneOneShot([sine(49)], 49, 200)).toBeNull();
    expect(noteNameToHz("A4")).toBeCloseTo(440, 5);
  });
});
