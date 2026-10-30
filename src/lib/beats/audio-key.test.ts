import { describe, expect, it } from "vitest";

import {
  KEY_SUGGEST_MIN_CONFIDENCE,
  beatKeyDetectedLabel,
  detectBeatKeyFromMonoPcm,
  keyConfidence,
  parseBeatKeySuggestion,
} from "@/lib/beats/audio-key";

const SR = 22050;

function midiHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

/** i–iv–v–i progression in A minor (sines), 8 s. */
function aMinorProgression(): Float32Array {
  const chords = [
    [57, 60, 64, 45], // Am
    [62, 65, 69, 50], // Dm
    [64, 67, 71, 52], // Em
    [57, 60, 64, 45], // Am
  ];
  const seconds = 8;
  const out = new Float32Array(SR * seconds);
  const per = out.length / chords.length;
  for (let c = 0; c < chords.length; c += 1) {
    for (let i = 0; i < per; i += 1) {
      const t = (c * per + i) / SR;
      let v = 0;
      for (const m of chords[c]!) v += Math.sin(2 * Math.PI * midiHz(m) * t);
      out[c * per + i] = v / 4;
    }
  }
  return out;
}

describe("beat key detection (analyze step)", () => {
  it("detects A minor from a minor progression with a usable confidence", () => {
    const s = detectBeatKeyFromMonoPcm(aMinorProgression(), SR);
    expect(s).not.toBeNull();
    expect(s!.key).toBe("A");
    expect(s!.scale).toBe("minor");
    expect(s!.confidence).toBeGreaterThanOrEqual(KEY_SUGGEST_MIN_CONFIDENCE);
    expect(beatKeyDetectedLabel(s!)).toBe("Am");
  });

  it("silence / too short → no suggestion", () => {
    expect(detectBeatKeyFromMonoPcm(new Float32Array(SR * 2), SR)).toBeNull();
    expect(detectBeatKeyFromMonoPcm(new Float32Array(100), SR)).toBeNull();
    expect(detectBeatKeyFromMonoPcm(new Float32Array(0), 0)).toBeNull();
  });

  it("confidence is clamped and rises with the margin", () => {
    expect(keyConfidence(2, 1)).toBe(1);
    expect(keyConfidence(-1, 0)).toBe(0);
    expect(keyConfidence(0.8, 0.08)).toBeGreaterThan(keyConfidence(0.8, 0.01));
  });

  it("validates suggestions echoed back by the client", () => {
    expect(parseBeatKeySuggestion({ key: "F#", scale: "major", confidence: 0.61234 })).toEqual({
      key: "F#",
      scale: "major",
      confidence: 0.612,
    });
    expect(parseBeatKeySuggestion({ key: "H", scale: "major", confidence: 0.5 })).toBeNull();
    expect(parseBeatKeySuggestion({ key: "A", scale: "dorian", confidence: 0.5 })).toBeNull();
    expect(parseBeatKeySuggestion({ key: "A", scale: "minor", confidence: 2 })).toBeNull();
    expect(parseBeatKeySuggestion("Am")).toBeNull();
    expect(parseBeatKeySuggestion(null)).toBeNull();
  });
});
