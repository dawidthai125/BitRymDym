import { describe, expect, it } from "vitest";

import type { ExperimentEstimatorResult } from "@/lib/beats/bpm-experiment-v2/estimators";
import { analyzePair } from "@/lib/beats/bpm-experiment-v3/strategies";
import {
  hasOctaveAmbiguityInCandidates,
  octaveRelation,
  ruleBOctaveAmbiguity,
  ruleCNear,
} from "@/lib/beats/bpm-experiment-v4/rules";
import { classifyAgreementWrong } from "@/lib/beats/bpm-experiment-v4/metrics";

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

describe("V4 octave / agreement helpers", () => {
  it("detects octave relation expected/predicted", () => {
    expect(octaveRelation(142, 71)).toBe("x2");
    expect(octaveRelation(71, 142)).toBe("x0_5");
    expect(octaveRelation(100, 100)).toBe("x1");
  });

  it("classifies agreement-but-wrong as HALF", () => {
    expect(classifyAgreementWrong(142, 71)).toBe("HALF");
  });

  it("RULE B abstains when octave twin in candidates (142→71 case shape)", () => {
    const a = est(71, [
      { bpm: 71, confidence: 1 },
      { bpm: 142, confidence: 0.8 },
    ]);
    const b = est(71, [
      { bpm: 71, confidence: 1 },
      { bpm: 142, confidence: 0.7 },
    ]);
    const pair = analyzePair({ a, b });
    expect(pair.agreement).toBe("AGREEMENT");
    expect(hasOctaveAmbiguityInCandidates(71, a, b)).toBe(true);
    const cNear = ruleCNear(pair);
    expect(cNear.decision).toBe("AUTO_ACCEPT");
    expect(cNear.bpm).toBe(71);
    const ruled = ruleBOctaveAmbiguity({ pair, a, b });
    expect(ruled.decision).toBe("MANUAL_REQUIRED");
  });

  it("RULE B abstains on low-side agreement even when 142 absent from candidates", () => {
    // Real 142→71 shape: both tops 71, expected 142 never appears in lists.
    const a = est(71, [
      { bpm: 71, confidence: 1 },
      { bpm: 96, confidence: 0.68 },
    ]);
    const b = est(71, [
      { bpm: 71, confidence: 1 },
      { bpm: 95, confidence: 0.67 },
    ]);
    const pair = analyzePair({ a, b });
    expect(hasOctaveAmbiguityInCandidates(71, a, b)).toBe(true);
    expect(ruleBOctaveAmbiguity({ pair, a, b }).decision).toBe(
      "MANUAL_REQUIRED",
    );
  });

  it("RULE B still accepts mid-band agreement without octave trap (GENERAL)", () => {
    const a = est(110, [{ bpm: 110, confidence: 1 }]);
    const b = est(110, [{ bpm: 110, confidence: 1 }]);
    const pair = analyzePair({ a, b });
    // 110: low-side rule (≤100) false; high-side (≥140) false; no twin → accept
    const ruled = ruleBOctaveAmbiguity({ pair, a, b });
    expect(ruled.decision).toBe("AUTO_ACCEPT");
    expect(ruled.bpm).toBe(110);
  });
});
