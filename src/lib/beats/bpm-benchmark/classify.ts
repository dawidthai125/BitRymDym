/**
 * Benchmark classification — does not alter detector output.
 *
 * EXACT = detected === expected only (±2 is never EXACT).
 */

import { isHalfOrDouble } from "@/lib/beats/audio-bpm-rank";
import type { BpmClassification } from "@/lib/beats/bpm-benchmark/types";

export function classifyBpmMatch(params: {
  expectedBpm: number;
  detectedBpm: number;
}): BpmClassification {
  const { expectedBpm, detectedBpm } = params;
  const abs = Math.abs(detectedBpm - expectedBpm);

  if (detectedBpm === expectedBpm) {
    return "EXACT";
  }

  if (isHalfOrDouble(expectedBpm, detectedBpm)) {
    // expected 140, detected 70 → HALF; expected 70, detected 140 → DOUBLE
    if (detectedBpm < expectedBpm) {
      return "HALF";
    }
    return "DOUBLE";
  }

  if (abs === 1) {
    return "WITHIN_1";
  }
  if (abs === 2) {
    return "WITHIN_2";
  }
  return "MISS";
}

/** Correct for confidence analysis: EXACT | WITHIN_1 | WITHIN_2 */
export function isCorrectClassification(c: BpmClassification): boolean {
  return c === "EXACT" || c === "WITHIN_1" || c === "WITHIN_2";
}
