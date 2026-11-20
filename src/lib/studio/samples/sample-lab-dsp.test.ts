import { describe, expect, it } from "vitest";

import {
  applyFades,
  detectPitchHz,
  dominantNote,
  encodeWav16,
  estimateKey,
  hzToNote,
  loopLengthFrames,
  maxBarsFor,
  normalizePeak,
  peakDb,
  processTake,
  trimSilence,
} from "./sample-lab-dsp";

const SR = 48_000;
function sine(hz: number, seconds: number, amp = 0.5): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
  return out;
}
function withHarmonics(hz: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) {
    const t = (2 * Math.PI * hz * i) / SR;
    out[i] = 0.4 * Math.sin(t) + 0.25 * Math.sin(2 * t) + 0.15 * Math.sin(3 * t);
  }
  return out;
}

describe("sample lab DSP", () => {
  it("detects pitch of a pure tone and of a harmonic tone (no octave error)", () => {
    expect(detectPitchHz(sine(440, 0.05), SR)).toBeCloseTo(440, 0);
    expect(detectPitchHz(sine(82.41, 0.1), SR)).toBeCloseTo(82.41, 0);
    expect(detectPitchHz(withHarmonics(110, 0.1), SR)).toBeCloseTo(110, 0);
  });

  it("returns null for silence and noise", () => {
    expect(detectPitchHz(new Float32Array(2048), SR)).toBeNull();
    const noise = new Float32Array(4096).map(() => Math.random() * 2 - 1);
    expect(detectPitchHz(noise, SR)).toBeNull();
  });

  it("names notes and cents like a tuner", () => {
    expect(hzToNote(440)).toMatchObject({ label: "A4", cents: 0 });
    expect(hzToNote(82.41)).toMatchObject({ label: "E2" });
    expect(hzToNote(446).cents).toBeGreaterThan(20);
  });

  it("finds the dominant note and an approximate key", () => {
    expect(dominantNote([45, 45, 45, 57, 45])).toBe("A2");
    // A natural minor scale, tonic-heavy.
    const aMinor = [57, 59, 60, 62, 64, 65, 67, 57, 60, 64, 57, 64, 69, 57, 60];
    expect(estimateKey(aMinor)).toBe("Am");
    const cMajor = [60, 62, 64, 65, 67, 69, 71, 60, 64, 67, 60, 67, 72, 60, 64];
    expect(estimateKey(cMajor)).toBe("C");
    expect(estimateKey([60, 60])).toBeNull();
  });

  it("trims silence, fades and normalises to -1 dBFS", () => {
    const ch = new Float32Array(SR);
    ch.set(sine(220, 0.3, 0.2), SR / 2);
    const r = trimSilence([ch], SR);
    expect(r.start).toBeGreaterThan(SR / 2 - SR * 0.02);
    expect(r.end).toBeLessThan(SR / 2 + SR * 0.32);
    const s = [sine(220, 0.2, 0.25)];
    normalizePeak(s, -1);
    expect(peakDb(s)).toBeCloseTo(-1, 1);
    applyFades(s, SR, 5, 5);
    expect(Math.abs(s[0][0])).toBe(0);
  });

  it("cuts loops to whole bars and caps bars at 30 s", () => {
    expect(loopLengthFrames(90, 4, SR)).toBe(Math.round(((4 * 4 * 60) / 90) * SR));
    expect(maxBarsFor(90)).toBe(8); // 8 bars at 90 BPM = 21.3 s, 16 bars = 42.7 s
    expect(maxBarsFor(160)).toBe(16);
    const take = processTake({ channels: [sine(220, 12)], sampleRate: SR, type: "loop", bpm: 120, bars: 4, loopStart: SR });
    expect(take.channels[0].length).toBe(loopLengthFrames(120, 4, SR));
  });

  it("writes a valid 16-bit WAV header", () => {
    const wav = encodeWav16([sine(440, 0.01), sine(440, 0.01)], SR);
    const text = (o: number) => String.fromCharCode(...wav.subarray(o, o + 4));
    expect(text(0)).toBe("RIFF");
    expect(text(8)).toBe("WAVE");
    const v = new DataView(wav.buffer);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(SR);
    expect(wav.length).toBe(44 + 480 * 2 * 2);
  });

  it("labels a one-shot with its note", () => {
    const ch = new Float32Array(SR);
    ch.set(withHarmonics(110, 0.6), 4800);
    const res = processTake({ channels: [ch], sampleRate: SR, type: "oneshot", bpm: null, bars: null });
    expect(res.note).toBe("A2");
  });
});
