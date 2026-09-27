/**
 * Experiment V4 metrics — C_NEAR safety + agreement-but-wrong analysis.
 */

import {
  classifyExperimentMatch,
  isExperimentCorrect,
  isHalfDouble,
  isHarmonic,
  type ExperimentClassification,
} from "@/lib/beats/bpm-experiment-v2/classify";
import type { SafetyRuleId, SafetyRuleResult } from "./rules";

export type AgreementWrongKind =
  | "HALF"
  | "DOUBLE"
  | "HARMONIC"
  | "NEIGHBOR"
  | "UNRELATED"
  | "WITHIN_TOL"
  | "UNKNOWN";

export function classifyAgreementWrong(
  expected: number,
  predicted: number,
): AgreementWrongKind {
  const cls = classifyExperimentMatch({
    expectedBpm: expected,
    detectedBpm: predicted,
  });
  if (isExperimentCorrect(cls)) return "WITHIN_TOL";
  if (cls === "HALF") return "HALF";
  if (cls === "DOUBLE") return "DOUBLE";
  if (isHarmonic(cls)) return "HARMONIC";
  if (cls === "NEIGHBOR") return "NEIGHBOR";
  return "UNRELATED";
}

export type RuleFixtureOutcome = {
  file: string;
  layer: string;
  expectedBpm: number;
  result: SafetyRuleResult;
  classification: ExperimentClassification | "ABSTAIN";
  autoAcceptCorrect: boolean | null;
};

export type RuleMetrics = {
  rule: SafetyRuleId;
  n: number;
  autoAccept: number;
  manualRequired: number;
  coverage: number;
  abstain: number;
  precision: number | null;
  falseAutoRate: number | null;
  autoCorrect: number;
  autoWrong: number;
  exact: number;
  within2: number;
  halfDouble: number;
  harmonic: number;
  miss: number;
};

export function scoreRuleOutcomes(
  rule: SafetyRuleId,
  outcomes: RuleFixtureOutcome[],
): RuleMetrics {
  const n = outcomes.length;
  const auto = outcomes.filter((o) => o.result.decision === "AUTO_ACCEPT");
  const manual = outcomes.filter(
    (o) => o.result.decision === "MANUAL_REQUIRED",
  );
  let autoCorrect = 0;
  let autoWrong = 0;
  for (const o of auto) {
    if (o.autoAcceptCorrect === true) autoCorrect++;
    else if (o.autoAcceptCorrect === false) autoWrong++;
  }
  return {
    rule,
    n,
    autoAccept: auto.length,
    manualRequired: manual.length,
    coverage: n ? +(auto.length / n).toFixed(4) : 0,
    abstain: n ? +(manual.length / n).toFixed(4) : 0,
    precision: auto.length ? +(autoCorrect / auto.length).toFixed(4) : null,
    falseAutoRate: auto.length ? +(autoWrong / auto.length).toFixed(4) : null,
    autoCorrect,
    autoWrong,
    exact: auto.filter((o) => o.classification === "EXACT").length,
    within2: auto.filter(
      (o) =>
        o.classification !== "ABSTAIN" &&
        isExperimentCorrect(o.classification as ExperimentClassification),
    ).length,
    halfDouble: auto.filter(
      (o) =>
        o.classification !== "ABSTAIN" &&
        isHalfDouble(o.classification as ExperimentClassification),
    ).length,
    harmonic: auto.filter(
      (o) =>
        o.classification !== "ABSTAIN" &&
        isHarmonic(o.classification as ExperimentClassification),
    ).length,
    miss: auto.filter((o) => o.classification === "MISS").length,
  };
}

export function outcomeForRule(params: {
  file: string;
  layer: string;
  expectedBpm: number;
  result: SafetyRuleResult;
}): RuleFixtureOutcome {
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
