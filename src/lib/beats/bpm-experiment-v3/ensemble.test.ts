import { describe, expect, it } from "vitest";

import { normalizeTempoRelation, pickHarmonicNormalized } from "./relations";
import {
  analyzePair,
  strategyG1,
  strategyG3,
  strategyG4,
} from "./strategies";
import type { ExperimentEstimatorResult } from "@/lib/beats/bpm-experiment-v2/estimators";

function est(
  bpm: number,
  candidates: Array<{ bpm: number; confidence: number }>,
): ExperimentEstimatorResult {
  return {
    estimator: "A_tempo",
    method: "test",
    rawTopBpm: bpm,
    rawTopBpmFloat: bpm,
    confidence: 1,
    candidates: candidates.map((c) => ({
      bpm: c.bpm,
      bpmRounded: Math.round(c.bpm),
      confidence: c.confidence,
    })),
    detectionMs: 1,
  };
}

describe("normalizeTempoRelation", () => {
  it("detects equal / half / 4:3 / 3:4 / 2:3", () => {
    expect(normalizeTempoRelation(90, 90).kind).toBe("equal");
    expect(normalizeTempoRelation(71, 142).kind).toBe("x2");
    expect(normalizeTempoRelation(142, 71).kind).toBe("x0_5");
    expect(normalizeTempoRelation(90, 120).kind).toBe("x4_3");
    expect(normalizeTempoRelation(140, 105).kind).toBe("x3_4");
    expect(normalizeTempoRelation(140, 94).kind).toBe("x2_3");
  });

  it("picks hip-hop band on harmonic pair (GENERAL RULE)", () => {
    expect(pickHarmonicNormalized(90, 180)).toBe(90);
    expect(pickHarmonicNormalized(70, 140)).toBe(70);
  });
});

describe("ensemble strategies", () => {
  it("G1 abstains on conflict", () => {
    const pair = analyzePair({
      a: est(120, [{ bpm: 120, confidence: 1 }]),
      b: est(90, [{ bpm: 90, confidence: 1 }]),
    });
    const r = strategyG1(pair);
    expect(r.decision).toBe("MANUAL_REQUIRED");
  });

  it("G3 accepts harmonic band pick", () => {
    const pair = analyzePair({
      a: est(120, [{ bpm: 120, confidence: 1 }]),
      b: est(90, [{ bpm: 90, confidence: 1 }]),
    });
    // Directed A→B: 120→90 is ×3/4 (not ×4/3).
    expect(pair.relation.kind).toBe("x3_4");
    const r = strategyG3(pair);
    expect(r.decision).toBe("AUTO_ACCEPT");
    expect(r.bpm).toBe(90);
  });

  it("G4 near agreement uses mean", () => {
    const pair = analyzePair({
      a: est(99, [{ bpm: 99, confidence: 1 }]),
      b: est(100, [{ bpm: 100, confidence: 1 }]),
    });
    const r = strategyG4(pair);
    expect(r.decision).toBe("AUTO_ACCEPT");
    expect(r.bpm).toBe(100);
  });
});
