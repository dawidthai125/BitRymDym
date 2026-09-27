/**
 * Experiment V3 metrics — tooling only.
 */

import {
  classifyExperimentMatch,
  isExperimentCorrect,
  isHalfDouble,
  isHarmonic,
  type ExperimentClassification,
} from "@/lib/beats/bpm-experiment-v2/classify";
import type {
  EnsembleResult,
  EnsembleStrategyId,
} from "@/lib/beats/bpm-experiment-v3/strategies";

export type StrategyFixtureOutcome = {
  file: string;
  layer: string;
  expectedBpm: number;
  result: EnsembleResult;
  classification: ExperimentClassification | "ABSTAIN";
  autoAcceptCorrect: boolean | null;
};

export type StrategyMetrics = {
  strategy: EnsembleStrategyId;
  n: number;
  autoAccept: number;
  manualRequired: number;
  coverage: number;
  abstainRate: number;
  precisionOfAutoAccept: number | null;
  autoAcceptCorrect: number;
  autoAcceptIncorrect: number;
  exact: number;
  within1: number;
  within2: number;
  halfDouble: number;
  harmonic: number;
  miss: number;
  /** Among AUTO_ACCEPT only */
  autoClassCounts: Record<string, number>;
};

export function scoreStrategyOutcomes(
  strategy: EnsembleStrategyId,
  outcomes: StrategyFixtureOutcome[],
): StrategyMetrics {
  const n = outcomes.length;
  const auto = outcomes.filter((o) => o.result.decision === "AUTO_ACCEPT");
  const manual = outcomes.filter(
    (o) => o.result.decision === "MANUAL_REQUIRED",
  );
  let autoCorrect = 0;
  let autoIncorrect = 0;
  const autoClassCounts: Record<string, number> = {};

  for (const o of auto) {
    const cls = o.classification;
    autoClassCounts[String(cls)] = (autoClassCounts[String(cls)] || 0) + 1;
    if (o.autoAcceptCorrect === true) autoCorrect++;
    else if (o.autoAcceptCorrect === false) autoIncorrect++;
  }

  const exact = auto.filter((o) => o.classification === "EXACT").length;
  const within1 = auto.filter((o) =>
    ["EXACT", "WITHIN_1"].includes(String(o.classification)),
  ).length;
  const within2 = auto.filter(
    (o) =>
      o.classification !== "ABSTAIN" &&
      isExperimentCorrect(o.classification as ExperimentClassification),
  ).length;
  const halfDouble = auto.filter(
    (o) =>
      o.classification !== "ABSTAIN" &&
      isHalfDouble(o.classification as ExperimentClassification),
  ).length;
  const harmonic = auto.filter(
    (o) =>
      o.classification !== "ABSTAIN" &&
      isHarmonic(o.classification as ExperimentClassification),
  ).length;
  const miss = auto.filter((o) => o.classification === "MISS").length;

  return {
    strategy,
    n,
    autoAccept: auto.length,
    manualRequired: manual.length,
    coverage: n ? +(auto.length / n).toFixed(4) : 0,
    abstainRate: n ? +(manual.length / n).toFixed(4) : 0,
    precisionOfAutoAccept: auto.length
      ? +(autoCorrect / auto.length).toFixed(4)
      : null,
    autoAcceptCorrect: autoCorrect,
    autoAcceptIncorrect: autoIncorrect,
    exact,
    within1,
    within2,
    halfDouble,
    harmonic,
    miss,
    autoClassCounts,
  };
}

export function outcomeForFixture(params: {
  file: string;
  layer: string;
  expectedBpm: number;
  result: EnsembleResult;
}): StrategyFixtureOutcome {
  if (params.result.decision === "MANUAL_REQUIRED") {
    return {
      file: params.file,
      layer: params.layer,
      expectedBpm: params.expectedBpm,
      result: params.result,
      classification: "ABSTAIN",
      autoAcceptCorrect: null,
    };
  }
  const classification = classifyExperimentMatch({
    expectedBpm: params.expectedBpm,
    detectedBpm: params.result.bpm,
  });
  return {
    file: params.file,
    layer: params.layer,
    expectedBpm: params.expectedBpm,
    result: params.result,
    classification,
    autoAcceptCorrect: isExperimentCorrect(classification),
  };
}
