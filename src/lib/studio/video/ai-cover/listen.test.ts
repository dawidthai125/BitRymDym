import { describe, expect, it } from "vitest";

import { audioFeaturesFromPcm, coverPromptFromAudio } from "./listen";
import { MOOD_COVERS } from "./moods";

function promptOf(id: (typeof MOOD_COVERS)[number]["id"]): string {
  const mood = MOOD_COVERS.find((item) => item.id === id);
  if (!mood) throw new Error(id);
  return mood.prompt;
}

describe("audioFeaturesFromPcm", () => {
  it("places a 1 kHz sine near 1 kHz and about -6 dB", () => {
    const sampleRate = 8000;
    const samples = new Float32Array(1024);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
    }
    const features = audioFeaturesFromPcm(samples, sampleRate);
    expect(features.centroidHz).toBeGreaterThan(700);
    expect(features.centroidHz).toBeLessThan(1400);
    expect(features.peakDb).toBeGreaterThan(-8);
    expect(features.peakDb).toBeLessThan(-4);
  });
});

describe("coverPromptFromAudio", () => {
  it("uses night or street for a high centroid and a loud peak", () => {
    expect(coverPromptFromAudio({ centroidHz: 2501, peakDb: -5.9 })).toEqual({
      moodId: "night",
      prompt: promptOf("night"),
    });
    expect(coverPromptFromAudio({ centroidHz: 4000, peakDb: -1 })).toEqual({
      moodId: "street",
      prompt: promptOf("street"),
    });
  });

  it("uses calm or dark for a quiet, dark centroid", () => {
    expect(coverPromptFromAudio({ centroidHz: 200, peakDb: -20 })).toEqual({
      moodId: "calm",
      prompt: promptOf("calm"),
    });
    expect(coverPromptFromAudio({ centroidHz: 700, peakDb: -6 })).toEqual({
      moodId: "dark",
      prompt: promptOf("dark"),
    });
  });

  it("uses gold in the middle and only existing mood prompts", () => {
    const mid = coverPromptFromAudio({ centroidHz: 1500, peakDb: -3 });
    expect(mid).toEqual({ moodId: "gold", prompt: promptOf("gold") });
    expect(coverPromptFromAudio({ centroidHz: 2500, peakDb: -1 }).moodId).toBe("gold");
    expect(coverPromptFromAudio({ centroidHz: 800, peakDb: -30 }).moodId).toBe("gold");
    expect(coverPromptFromAudio({ centroidHz: 100, peakDb: -5.9 }).moodId).toBe("gold");
    const prompts = new Set(MOOD_COVERS.map((item) => item.prompt));
    expect(prompts.has(mid.prompt)).toBe(true);
  });
});
