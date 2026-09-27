import { describe, expect, it } from "vitest";

import {
  SYNTHETIC_BPM_MATRIX,
  syntheticFixtureFilename,
} from "./synthetic-bpm-matrix";
import {
  encodeMonoWavPcm16,
  generateKickClickTrack,
} from "./synthetic-wav";

describe("synthetic BPM matrix SSOT", () => {
  it("includes required rap-zone and half/double anchors", () => {
    for (const bpm of [70, 87, 88, 90, 91, 93, 96, 101, 140, 180]) {
      expect(SYNTHETIC_BPM_MATRIX).toContain(bpm);
    }
  });

  it("builds expected filenames", () => {
    expect(syntheticFixtureFilename(87)).toBe("bpm-87-steady.wav");
  });
});

describe("synthetic wav generator", () => {
  it("encodes mono 44.1k PCM with expected length", () => {
    const sr = 44100;
    const samples = generateKickClickTrack({
      bpm: 140,
      durationSeconds: 1,
      sampleRate: sr,
    });
    expect(samples.length).toBe(sr);
    const wav = encodeMonoWavPcm16(samples, sr);
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(sr);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  });

  it("places energy near expected beat period", () => {
    const sr = 44100;
    const bpm = 120;
    const samples = generateKickClickTrack({
      bpm,
      durationSeconds: 2,
      sampleRate: sr,
    });
    const period = Math.floor((60 / bpm) * sr);
    // First sample of beat 0 and beat 1 should be non-zero transient
    expect(Math.abs(samples[0]!)).toBeGreaterThan(0.1);
    expect(Math.abs(samples[period]!)).toBeGreaterThan(0.1);
    // Mid-period quiet
    expect(Math.abs(samples[Math.floor(period / 2)]!)).toBeLessThan(0.05);
  });
});
