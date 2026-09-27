/**
 * Experiment V2 — classification with harmonic labels.
 * Tooling only — does not alter production classifyBpmMatch.
 */

import { isHalfOrDouble } from "@/lib/beats/audio-bpm-rank";

export type ExperimentClassification =
  | "EXACT"
  | "WITHIN_1"
  | "WITHIN_2"
  | "HALF"
  | "DOUBLE"
  | "HARMONIC_4_3"
  | "HARMONIC_3_4"
  | "HARMONIC_2_3"
  | "NEIGHBOR"
  | "MISS"
  | "ERROR";

function nearRatio(detected: number, expected: number, target: number): boolean {
  if (expected <= 0 || detected <= 0) return false;
  return Math.abs(detected / expected - target) <= 0.06;
}

export function classifyExperimentMatch(params: {
  expectedBpm: number;
  detectedBpm: number | null;
}): ExperimentClassification {
  const { expectedBpm, detectedBpm } = params;
  if (detectedBpm == null || !Number.isFinite(detectedBpm)) return "ERROR";

  const abs = Math.abs(detectedBpm - expectedBpm);
  if (detectedBpm === expectedBpm) return "EXACT";

  if (isHalfOrDouble(expectedBpm, detectedBpm)) {
    return detectedBpm < expectedBpm ? "HALF" : "DOUBLE";
  }

  if (nearRatio(detectedBpm, expectedBpm, 4 / 3)) return "HARMONIC_4_3";
  if (nearRatio(detectedBpm, expectedBpm, 3 / 4)) return "HARMONIC_3_4";
  if (nearRatio(detectedBpm, expectedBpm, 2 / 3)) return "HARMONIC_2_3";

  if (abs === 1) return "WITHIN_1";
  if (abs === 2) return "WITHIN_2";
  if (abs <= 3) return "NEIGHBOR";
  return "MISS";
}

export function isExperimentCorrect(c: ExperimentClassification): boolean {
  return c === "EXACT" || c === "WITHIN_1" || c === "WITHIN_2";
}

export function isHalfDouble(c: ExperimentClassification): boolean {
  return c === "HALF" || c === "DOUBLE";
}

export function isHarmonic(c: ExperimentClassification): boolean {
  return (
    c === "HARMONIC_4_3" || c === "HARMONIC_3_4" || c === "HARMONIC_2_3"
  );
}
