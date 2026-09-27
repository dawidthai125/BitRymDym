import { describe, expect, it } from "vitest";

import {
  isHalfOrDouble,
  rankBpmCandidates,
  resolveCreateBpm,
  roundBpm,
} from "@/lib/beats/audio-bpm-rank";

describe("roundBpm", () => {
  it("rounds and enforces 1–300", () => {
    expect(roundBpm(139.7)).toBe(140);
    expect(roundBpm(0.4)).toBeNull();
    expect(roundBpm(600)).toBeNull();
  });
});

describe("isHalfOrDouble", () => {
  it("detects 70↔140 and 90↔180", () => {
    expect(isHalfOrDouble(70, 140)).toBe(true);
    expect(isHalfOrDouble(140, 70)).toBe(true);
    expect(isHalfOrDouble(90, 180)).toBe(true);
    expect(isHalfOrDouble(120, 140)).toBe(false);
  });
});

describe("rankBpmCandidates", () => {
  it("picks high-confidence candidate near 140", () => {
    const ranked = rankBpmCandidates([
      { bpm: 139.7, confidence: 1 },
      { bpm: 70, confidence: 0.4 },
    ]);
    expect(ranked).not.toBeNull();
    expect(ranked!.bpm).toBe(140);
    expect(ranked!.confidence).toBeGreaterThan(0.9);
  });

  it("expands half/double and marks octave ambiguity when close", () => {
    const ranked = rankBpmCandidates([
      { bpm: 70, confidence: 0.9 },
      { bpm: 140, confidence: 0.88 },
    ]);
    expect(ranked).not.toBeNull();
    expect(ranked!.octaveAmbiguous).toBe(true);
    expect(ranked!.uncertain).toBe(true);
    expect([70, 140]).toContain(ranked!.bpm);
  });

  it("returns null for empty/invalid", () => {
    expect(rankBpmCandidates([])).toBeNull();
    expect(rankBpmCandidates([{ bpm: 0.2, confidence: 1 }])).toBeNull();
  });
});

describe("resolveCreateBpm", () => {
  it("accepts manual override", () => {
    const r = resolveCreateBpm({
      clientBpm: 142,
      bpmManualOverride: true,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r).toEqual({ ok: true, bpm: 142 });
  });

  it("rejects client BPM outside 1–300", () => {
    expect(
      resolveCreateBpm({
        clientBpm: 999,
        bpmManualOverride: true,
        suggestedBpm: 120,
        decodeAvailable: true,
      }).ok,
    ).toBe(false);
    expect(
      resolveCreateBpm({
        clientBpm: 0,
        bpmManualOverride: false,
        suggestedBpm: null,
        decodeAvailable: false,
      }).ok,
    ).toBe(false);
  });

  it("rejects tampered BPM when not override and not matching suggest", () => {
    const r = resolveCreateBpm({
      clientBpm: 90,
      bpmManualOverride: false,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r.ok).toBe(false);
  });

  it("uses suggested BPM when client matches without override", () => {
    const r = resolveCreateBpm({
      clientBpm: 120,
      bpmManualOverride: false,
      suggestedBpm: 120,
      decodeAvailable: true,
    });
    expect(r).toEqual({ ok: true, bpm: 120 });
  });

  it("allows manual fill when no suggest", () => {
    const r = resolveCreateBpm({
      clientBpm: 128,
      bpmManualOverride: false,
      suggestedBpm: null,
      decodeAvailable: false,
    });
    expect(r).toEqual({ ok: true, bpm: 128 });
  });
});
