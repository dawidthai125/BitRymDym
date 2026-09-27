/**
 * Experiment V4 — GENERAL RULE safety filters on top of C_NEAR.
 * Tooling only. No fixture IDs. No production wiring.
 */

import type { ExperimentEstimatorResult } from "@/lib/beats/bpm-experiment-v2/estimators";
import {
  analyzePair,
  strategyCNear,
  type EnsembleResult,
  type PairAnalysis,
} from "@/lib/beats/bpm-experiment-v3/strategies";
import { isHalfOrDouble } from "@/lib/beats/audio-bpm-rank";

export type SafetyRuleId =
  | "C_NEAR"
  | "RULE_A_CANDIDATE_SUPPORT"
  | "RULE_B_OCTAVE_AMBIGUITY"
  | "RULE_C_SHORT_SIGNAL"
  | "RULE_D_CANDIDATE_DISAGREE"
  | "RULE_B_PLUS_D"
  | "RULE_B_PLUS_C";

export type SafetyRuleResult = EnsembleResult & {
  rule: SafetyRuleId;
};

/** GENERAL RULE: short loops are higher risk for false agreement. Analysis threshold only. */
export const SHORT_SIGNAL_SEC = 12;

function candidateHas(
  bpm: number,
  candidates: ExperimentEstimatorResult["candidates"],
  tol = 1,
): boolean {
  if (!candidates?.length) return false;
  return candidates.some((c) => {
    const r = c.bpmRounded;
    return r != null && Math.abs(r - bpm) <= tol;
  });
}

/** Expected / predicted ratio class for octave ambiguity (GENERAL RULE). */
export function octaveRelation(
  expected: number,
  predicted: number | null,
): "x1" | "x0_5" | "x2" | "other" | "unknown" {
  if (predicted == null || predicted <= 0 || expected <= 0) return "unknown";
  if (Math.abs(expected - predicted) <= 2) return "x1";
  const ratio = expected / predicted;
  if (Math.abs(ratio - 2) <= 0.06) return "x2";
  if (Math.abs(ratio - 0.5) <= 0.06) return "x0_5";
  if (isHalfOrDouble(expected, predicted)) {
    return expected > predicted ? "x2" : "x0_5";
  }
  return "other";
}

/**
 * True when an agreed BPM is octave-ambiguous without knowing truth.
 * GENERAL RULES (no expected BPM, no fixture IDs):
 * 1) Candidate list contains half or double of agreed BPM, OR
 * 2) Low-side trap: agreed ≤ 100 and 2×agreed still ≤ detector max (200), OR
 * 3) High-side trap: agreed ≥ 140 and agreed/2 still ≥ detector min (60).
 * Does NOT auto-pick ×2 / ÷2 — only flags MANUAL.
 */
export function hasOctaveAmbiguityInCandidates(
  agreedBpm: number,
  a: ExperimentEstimatorResult,
  b: ExperimentEstimatorResult,
): boolean {
  const half = Math.round(agreedBpm / 2);
  const dbl = agreedBpm * 2;
  const aHasHalf = candidateHas(half, a.candidates, 1);
  const aHasDbl = candidateHas(dbl, a.candidates, 1);
  const bHasHalf = candidateHas(half, b.candidates, 1);
  const bHasDbl = candidateHas(dbl, b.candidates, 1);
  if (aHasHalf || aHasDbl || bHasHalf || bHasDbl) return true;

  // Range-based octave trap (142→71 shape: 71 agreed, 142 never even a candidate).
  if (agreedBpm <= 100 && dbl <= 200) return true;
  if (agreedBpm >= 140 && half >= 60) return true;
  return false;
}

/**
 * Candidate intersection size (±1 BPM) between A and B lists.
 * GENERAL RULE.
 */
export function candidateIntersectionCount(
  a: ExperimentEstimatorResult,
  b: ExperimentEstimatorResult,
): number {
  if (!a.candidates?.length || !b.candidates?.length) return 0;
  let n = 0;
  for (const ac of a.candidates) {
    const ar = ac.bpmRounded;
    if (ar == null) continue;
    if (candidateHas(ar, b.candidates, 1)) n++;
  }
  return n;
}

function wrap(
  rule: SafetyRuleId,
  base: EnsembleResult,
  reasonOverride?: string,
): SafetyRuleResult {
  return {
    ...base,
    strategy: base.strategy,
    rule,
    reason: reasonOverride ?? base.reason,
  };
}

function manual(rule: SafetyRuleId, reason: string): SafetyRuleResult {
  return {
    strategy: "C_AGREEMENT_NEAR",
    rule,
    bpm: null,
    decision: "MANUAL_REQUIRED",
    reason,
  };
}

/** Baseline: unmodified C_NEAR. */
export function ruleCNear(pair: PairAnalysis): SafetyRuleResult {
  return wrap("C_NEAR", strategyCNear(pair));
}

/**
 * RULE A: C_NEAR only if tops mutually appear in each other's candidates
 * (or exact agreement). Else MANUAL.
 * GENERAL RULE — no expected BPM.
 */
export function ruleACandidateSupport(
  pair: PairAnalysis,
): SafetyRuleResult {
  const base = strategyCNear(pair);
  if (base.decision === "MANUAL_REQUIRED") {
    return wrap("RULE_A_CANDIDATE_SUPPORT", base);
  }
  if (pair.agreement === "AGREEMENT") {
    return wrap("RULE_A_CANDIDATE_SUPPORT", base, "C_NEAR + exact agreement");
  }
  if (pair.aTopInB && pair.bTopInA) {
    return wrap(
      "RULE_A_CANDIDATE_SUPPORT",
      base,
      "C_NEAR + mutual candidate support",
    );
  }
  return manual(
    "RULE_A_CANDIDATE_SUPPORT",
    "C_NEAR would accept but no mutual candidate support → MANUAL",
  );
}

/**
 * RULE B: C_NEAR, but if octave twin appears in candidates → MANUAL.
 * Does NOT auto-pick ×2. GENERAL RULE.
 */
export function ruleBOctaveAmbiguity(params: {
  pair: PairAnalysis;
  a: ExperimentEstimatorResult;
  b: ExperimentEstimatorResult;
}): SafetyRuleResult {
  const base = strategyCNear(params.pair);
  if (base.decision === "MANUAL_REQUIRED" || base.bpm == null) {
    return wrap("RULE_B_OCTAVE_AMBIGUITY", base);
  }
  if (hasOctaveAmbiguityInCandidates(base.bpm, params.a, params.b)) {
    return manual(
      "RULE_B_OCTAVE_AMBIGUITY",
      `C_NEAR ${base.bpm} but octave twin in candidates → MANUAL (no auto ×2)`,
    );
  }
  return wrap(
    "RULE_B_OCTAVE_AMBIGUITY",
    base,
    `${base.reason}; no octave twin in candidates`,
  );
}

/**
 * RULE C: C_NEAR, but short signal → MANUAL.
 * GENERAL RULE (duration threshold fixed for experiment, not tuned).
 */
export function ruleCShortSignal(params: {
  pair: PairAnalysis;
  durationSec: number;
}): SafetyRuleResult {
  const base = strategyCNear(params.pair);
  if (base.decision === "MANUAL_REQUIRED") {
    return wrap("RULE_C_SHORT_SIGNAL", base);
  }
  if (params.durationSec < SHORT_SIGNAL_SEC) {
    return manual(
      "RULE_C_SHORT_SIGNAL",
      `C_NEAR would accept but duration ${params.durationSec.toFixed(2)}s < ${SHORT_SIGNAL_SEC}s → MANUAL`,
    );
  }
  return wrap(
    "RULE_C_SHORT_SIGNAL",
    base,
    `${base.reason}; duration ok (${params.durationSec.toFixed(2)}s)`,
  );
}

/**
 * RULE D: C_NEAR, but if A top not in B candidates OR B top not in A → MANUAL
 * when near-agreement (exact agreement still allowed).
 * GENERAL RULE.
 */
export function ruleDCandidateDisagree(pair: PairAnalysis): SafetyRuleResult {
  const base = strategyCNear(pair);
  if (base.decision === "MANUAL_REQUIRED") {
    return wrap("RULE_D_CANDIDATE_DISAGREE", base);
  }
  if (pair.agreement === "AGREEMENT") {
    return wrap("RULE_D_CANDIDATE_DISAGREE", base, "exact agreement");
  }
  // Near agreement: require mutual top support
  if (!(pair.aTopInB && pair.bTopInA)) {
    return manual(
      "RULE_D_CANDIDATE_DISAGREE",
      "near-agree without mutual top-in-candidates → MANUAL",
    );
  }
  return wrap(
    "RULE_D_CANDIDATE_DISAGREE",
    base,
    "near-agree + mutual top support",
  );
}

/** RULE B + D combined (GENERAL). */
export function ruleBPlusD(params: {
  pair: PairAnalysis;
  a: ExperimentEstimatorResult;
  b: ExperimentEstimatorResult;
}): SafetyRuleResult {
  const d = ruleDCandidateDisagree(params.pair);
  if (d.decision === "MANUAL_REQUIRED") {
    return { ...d, rule: "RULE_B_PLUS_D" };
  }
  const b = ruleBOctaveAmbiguity(params);
  if (b.decision === "MANUAL_REQUIRED") {
    return { ...b, rule: "RULE_B_PLUS_D" };
  }
  return wrap("RULE_B_PLUS_D", b, `B+D pass: ${b.reason}`);
}

/** RULE B + C combined (GENERAL). */
export function ruleBPlusC(params: {
  pair: PairAnalysis;
  a: ExperimentEstimatorResult;
  b: ExperimentEstimatorResult;
  durationSec: number;
}): SafetyRuleResult {
  const c = ruleCShortSignal({
    pair: params.pair,
    durationSec: params.durationSec,
  });
  if (c.decision === "MANUAL_REQUIRED") {
    return { ...c, rule: "RULE_B_PLUS_C" };
  }
  const b = ruleBOctaveAmbiguity({
    pair: params.pair,
    a: params.a,
    b: params.b,
  });
  if (b.decision === "MANUAL_REQUIRED") {
    return { ...b, rule: "RULE_B_PLUS_C" };
  }
  return wrap("RULE_B_PLUS_C", b, `B+C pass: ${b.reason}`);
}

export const ALL_SAFETY_RULES: SafetyRuleId[] = [
  "C_NEAR",
  "RULE_A_CANDIDATE_SUPPORT",
  "RULE_B_OCTAVE_AMBIGUITY",
  "RULE_C_SHORT_SIGNAL",
  "RULE_D_CANDIDATE_DISAGREE",
  "RULE_B_PLUS_D",
  "RULE_B_PLUS_C",
];

export function runSafetyRule(
  id: SafetyRuleId,
  params: {
    pair: PairAnalysis;
    a: ExperimentEstimatorResult;
    b: ExperimentEstimatorResult;
    durationSec: number;
  },
): SafetyRuleResult {
  switch (id) {
    case "C_NEAR":
      return ruleCNear(params.pair);
    case "RULE_A_CANDIDATE_SUPPORT":
      return ruleACandidateSupport(params.pair);
    case "RULE_B_OCTAVE_AMBIGUITY":
      return ruleBOctaveAmbiguity(params);
    case "RULE_C_SHORT_SIGNAL":
      return ruleCShortSignal(params);
    case "RULE_D_CANDIDATE_DISAGREE":
      return ruleDCandidateDisagree(params.pair);
    case "RULE_B_PLUS_D":
      return ruleBPlusD(params);
    case "RULE_B_PLUS_C":
      return ruleBPlusC(params);
    default: {
      const _e: never = id;
      return manual(_e, "unknown rule");
    }
  }
}

export { analyzePair };
