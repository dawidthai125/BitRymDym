import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STEM_AUDIO_MAX_BYTES } from "@/config/recording";
import { gateStemFile, guessStemRole, planStemImport, stemTrackName } from "./stem-import-client";

const f = (name: string, size = 1000, type = "") => ({ name, type, size });

describe("stem import client — file gate", () => {
  it("accepts wav, mp3, m4a, aac (type or extension)", () => {
    for (const name of ["a.wav", "b.mp3", "c.m4a", "d.aac"]) expect(gateStemFile(f(name)).ok, name).toBe(true);
    expect(gateStemFile(f("x.bin", 10, "audio/wav")).ok).toBe(true);
  });
  it("rejects other formats and files above the stem cap", () => {
    expect(gateStemFile(f("a.flac")).ok).toBe(false);
    expect(gateStemFile(f("a.wav", STEM_AUDIO_MAX_BYTES)).ok).toBe(true);
    const big = gateStemFile(f("a.wav", STEM_AUDIO_MAX_BYTES + 1));
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.message).toContain("48 MB");
  });
});

describe("stem import client — plan", () => {
  it("imports up to the free slots and reports the rest", () => {
    const files = [f("a.wav"), f("b.wav"), f("c.wav"), f("d.flac"), f("e.wav")];
    const plan = planStemImport(files, 2);
    expect(plan.accepted).toEqual([0, 1]);
    expect(plan.rejected).toHaveLength(3);
    expect(plan.rejected.some((m) => m.startsWith("d.flac"))).toBe(true);
    expect(plan.rejected.some((m) => m.includes("brak wolnych"))).toBe(true);
  });
  it("accepts nothing when there is no free slot", () => {
    expect(planStemImport([f("a.wav")], 0).accepted).toEqual([]);
    expect(planStemImport([f("a.wav")], -3).accepted).toEqual([]);
  });
});

describe("stem import client — names and roles", () => {
  it("names a track after the file", () => {
    expect(stemTrackName("vocal_main.final.wav")).toBe("vocal main.final");
    expect(stemTrackName(".wav")).toBe("Stem");
    expect(stemTrackName("x".repeat(80) + ".mp3")).toHaveLength(40);
  });
  it("guesses the role from the file name", () => {
    const cases: [string, string][] = [
      ["Lead Vocal.wav", "lead_vocal"],
      ["wokal glowny.mp3", "lead_vocal"],
      ["adlibs 1.wav", "adlib"],
      ["Vox DBL.wav", "double"],
      ["backing vocals.wav", "backing"],
      ["808 bass.wav", "instrument"],
      ["Drums.mp3", "instrument"],
      ["cos.wav", "other"],
    ];
    for (const [name, role] of cases) expect(guessStemRole(name), name).toBe(role);
  });
});

describe("stem import — wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("card is hidden below Silver and in the simple view", () => {
    const panel = read("src/components/studio/studio-recording-panel.tsx");
    expect(panel).toContain("!simple && stemLimit > 0");
    const editor = read("src/components/studio/studio-editor.tsx");
    expect(editor).toContain("stemLimit={maxStemsForTier(trackCapacity.premiumTier)}");
  });
  it("stems are placed at 0 ms through the shared persist queue", () => {
    const panel = read("src/components/studio/studio-recording-panel.tsx");
    expect(panel).toContain("timelineStartMs: 0");
    expect(panel).toContain("/stems/track");
  });
  it("track route is gated by plan and uses the CAS services", () => {
    const route = read("src/app/api/studio/projects/[projectId]/stems/track/route.ts");
    expect(route).toContain("maxStemsForTier");
    expect(route).toContain("addStudioTrack");
    expect(route).toContain("updateStudioTrackControls");
  });
});
