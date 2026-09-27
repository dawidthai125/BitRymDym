/**
 * Aggregate benchmark rows into layer/genre summaries + confidence analysis.
 */

import {
  isCorrectClassification,
} from "@/lib/beats/bpm-benchmark/classify";
import type {
  BenchmarkRow,
  BpmClassification,
  ConfidenceBucketCounts,
  GroupSummary,
  ThresholdSweepRow,
} from "@/lib/beats/bpm-benchmark/types";

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function rate(n: number, d: number): number {
  if (d === 0) return 0;
  return n / d;
}

export function summarizeGroup(
  group: string,
  rows: readonly BenchmarkRow[],
): GroupSummary {
  const scored = rows.filter(
    (r) =>
      r.classification !== "SKIPPED" &&
      r.classification !== "ERROR" &&
      r.absoluteError != null,
  );
  const n = scored.length;
  const exact = scored.filter((r) => r.classification === "EXACT").length;
  const w1 = scored.filter(
    (r) =>
      r.classification === "EXACT" || r.classification === "WITHIN_1",
  ).length;
  const w2 = scored.filter(
    (r) =>
      r.classification === "EXACT" ||
      r.classification === "WITHIN_1" ||
      r.classification === "WITHIN_2",
  ).length;
  const halfDouble = scored.filter(
    (r) =>
      r.classification === "HALF" || r.classification === "DOUBLE",
  ).length;
  const miss = scored.filter((r) => r.classification === "MISS").length;
  const absErrors = scored
    .map((r) => r.absoluteError)
    .filter((x): x is number => typeof x === "number");
  const confs = scored
    .map((r) => r.confidence)
    .filter((x): x is number => typeof x === "number");

  return {
    group,
    fixtureCount: n,
    exactHitRate: rate(exact, n),
    within1HitRate: rate(w1, n),
    within2HitRate: rate(w2, n),
    halfDoubleCount: halfDouble,
    missCount: miss,
    averageAbsoluteError: mean(absErrors),
    maxAbsoluteError: absErrors.length ? Math.max(...absErrors) : null,
    averageConfidence: mean(confs),
  };
}

export function summarizeByLayer(
  rows: readonly BenchmarkRow[],
): GroupSummary[] {
  const layers = [
    "SYNTHETIC",
    "RAP_BOOMBAP",
    "RAP_TRAP",
    "RAP_DRILL",
  ] as const;
  return layers.map((layer) =>
    summarizeGroup(
      layer,
      rows.filter((r) => r.layer === layer),
    ),
  );
}

export function summarizeByGenre(
  rows: readonly BenchmarkRow[],
): GroupSummary[] {
  const genres = ["synthetic", "boombap", "trap", "drill"] as const;
  return genres.map((genre) =>
    summarizeGroup(
      genre.toUpperCase(),
      rows.filter((r) => r.genre === genre),
    ),
  );
}

export function confidenceBuckets(
  rows: readonly BenchmarkRow[],
  threshold = 0.45,
): ConfidenceBucketCounts {
  const scored = rows.filter(
    (r) =>
      r.classification !== "SKIPPED" &&
      r.classification !== "ERROR" &&
      typeof r.confidence === "number",
  );

  let correctGe045 = 0;
  let correctLt045 = 0;
  let incorrectGe045 = 0;
  let incorrectLt045 = 0;

  for (const r of scored) {
    const correct = isCorrectClassification(
      r.classification as BpmClassification,
    );
    const ge = (r.confidence ?? 0) >= threshold;
    if (correct && ge) correctGe045++;
    else if (correct && !ge) correctLt045++;
    else if (!correct && ge) incorrectGe045++;
    else incorrectLt045++;
  }

  return { correctGe045, correctLt045, incorrectGe045, incorrectLt045 };
}

/**
 * Sweep provisional thresholds — analysis only, does not change product code.
 * "Positive" = would treat as confident auto (≥ threshold).
 * Correctness = EXACT|WITHIN_1|WITHIN_2.
 */
export function sweepConfidenceThresholds(
  rows: readonly BenchmarkRow[],
  thresholds: readonly number[] = [0.4, 0.45, 0.5, 0.55, 0.6],
): ThresholdSweepRow[] {
  const scored = rows.filter(
    (r) =>
      r.classification !== "SKIPPED" &&
      r.classification !== "ERROR" &&
      typeof r.confidence === "number",
  );

  return thresholds.map((threshold) => {
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;
    for (const r of scored) {
      const correct = isCorrectClassification(
        r.classification as BpmClassification,
      );
      const predictedConfident = (r.confidence ?? 0) >= threshold;
      if (predictedConfident && correct) truePositives++;
      else if (predictedConfident && !correct) falsePositives++;
      else if (!predictedConfident && !correct) trueNegatives++;
      else falseNegatives++;
    }
    return {
      threshold,
      truePositives,
      falsePositives,
      trueNegatives,
      falseNegatives,
    };
  });
}
