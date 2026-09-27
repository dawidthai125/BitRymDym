/**
 * Experiment V3 — ensemble strategies (tooling only, not production).
 */

import type { ExperimentEstimatorResult } from "@/lib/beats/bpm-experiment-v2/estimators";
import {
  isHarmonicRelation,
  normalizeTempoRelation,
  pickHarmonicNormalized,
  type TempoRelation,
} from "@/lib/beats/bpm-experiment-v3/relations";

export type EnsembleDecision = "AUTO_ACCEPT" | "MANUAL_REQUIRED";

export type EnsembleStrategyId =
  | "A_ONLY"
  | "B_ONLY"
  | "C_AGREEMENT_EXACT"
  | "C_AGREEMENT_NEAR"
  | "G1_AGREEMENT_OR_MANUAL"
  | "G2_AGREEMENT_OR_CROSS_SUPPORT"
  | "G3_AGREEMENT_OR_HARMONIC"
  | "G4_AGREE_CROSS_OR_HARMONIC";

export type CandidateSupportKind =
  | "A_TOP_IN_B"
  | "B_TOP_IN_A"
  | "MUTUAL_CANDIDATE_SUPPORT"
  | "NO_CANDIDATE_SUPPORT"
  | "UNKNOWN";

export type EnsembleResult = {
  bpm: number | null;
  decision: EnsembleDecision;
  reason: string;
  strategy: EnsembleStrategyId;
};

export type PairAnalysis = {
  aBpm: number | null;
  bBpm: number | null;
  aConfidence: number | null;
  bConfidence: number | null;
  confidenceDelta: number | null;
  agreement: "AGREEMENT" | "NEAR_AGREEMENT" | "CONFLICT" | "UNKNOWN";
  relation: TempoRelation;
  candidateSupport: CandidateSupportKind;
  aTopInB: boolean;
  bTopInA: boolean;
  expectedInA: boolean | null;
  expectedInB: boolean | null;
};

function inCandidates(
  bpm: number | null,
  candidates: ExperimentEstimatorResult["candidates"],
  tol = 1,
): boolean {
  if (bpm == null || !candidates?.length) return false;
  return candidates.some((c) => {
    const r = c.bpmRounded;
    return r != null && Math.abs(r - bpm) <= tol;
  });
}

export function analyzePair(params: {
  a: ExperimentEstimatorResult;
  b: ExperimentEstimatorResult;
  expectedBpm?: number;
}): PairAnalysis {
  const aBpm = params.a.rawTopBpm;
  const bBpm = params.b.rawTopBpm;
  const aTopInB = inCandidates(aBpm, params.b.candidates, 1);
  const bTopInA = inCandidates(bBpm, params.a.candidates, 1);

  let candidateSupport: CandidateSupportKind = "UNKNOWN";
  if (aBpm == null || bBpm == null) {
    candidateSupport = "UNKNOWN";
  } else if (aTopInB && bTopInA) {
    candidateSupport = "MUTUAL_CANDIDATE_SUPPORT";
  } else if (aTopInB) {
    candidateSupport = "A_TOP_IN_B";
  } else if (bTopInA) {
    candidateSupport = "B_TOP_IN_A";
  } else {
    candidateSupport = "NO_CANDIDATE_SUPPORT";
  }

  let agreement: PairAnalysis["agreement"] = "UNKNOWN";
  if (aBpm != null && bBpm != null) {
    const abs = Math.abs(aBpm - bBpm);
    if (abs === 0) agreement = "AGREEMENT";
    else if (abs <= 2) agreement = "NEAR_AGREEMENT";
    else agreement = "CONFLICT";
  }

  const aConf = params.a.confidence;
  const bConf = params.b.confidence;
  const confidenceDelta =
    aConf != null && bConf != null ? bConf - aConf : null;

  return {
    aBpm,
    bBpm,
    aConfidence: aConf,
    bConfidence: bConf,
    confidenceDelta,
    agreement,
    relation: normalizeTempoRelation(aBpm, bBpm),
    candidateSupport,
    aTopInB,
    bTopInA,
    expectedInA:
      params.expectedBpm != null
        ? inCandidates(params.expectedBpm, params.a.candidates, 1)
        : null,
    expectedInB:
      params.expectedBpm != null
        ? inCandidates(params.expectedBpm, params.b.candidates, 1)
        : null,
  };
}

function accept(
  strategy: EnsembleStrategyId,
  bpm: number,
  reason: string,
): EnsembleResult {
  return { strategy, bpm, decision: "AUTO_ACCEPT", reason };
}

function manual(
  strategy: EnsembleStrategyId,
  reason: string,
): EnsembleResult {
  return { strategy, bpm: null, decision: "MANUAL_REQUIRED", reason };
}

/** Baseline: always accept A. */
export function strategyAOnly(a: ExperimentEstimatorResult): EnsembleResult {
  if (a.rawTopBpm == null) {
    return manual("A_ONLY", "A returned no BPM");
  }
  return accept("A_ONLY", a.rawTopBpm, "baseline tempo()");
}

/** Baseline: always accept B. */
export function strategyBOnly(b: ExperimentEstimatorResult): EnsembleResult {
  if (b.rawTopBpm == null) {
    return manual("B_ONLY", "B returned no BPM");
  }
  return accept("B_ONLY", b.rawTopBpm, "baseline combTempo()");
}

/** C exact agreement only. GENERAL RULE. */
export function strategyCExact(pair: PairAnalysis): EnsembleResult {
  if (pair.agreement === "AGREEMENT" && pair.aBpm != null) {
    return accept("C_AGREEMENT_EXACT", pair.aBpm, "A==B exact agreement");
  }
  return manual("C_AGREEMENT_EXACT", "no exact agreement");
}

/** C near agreement (±2) → mean rounded. GENERAL RULE. */
export function strategyCNear(pair: PairAnalysis): EnsembleResult {
  if (pair.aBpm == null || pair.bBpm == null) {
    return manual("C_AGREEMENT_NEAR", "missing A or B");
  }
  if (pair.agreement === "AGREEMENT") {
    return accept("C_AGREEMENT_NEAR", pair.aBpm, "A==B exact");
  }
  if (pair.agreement === "NEAR_AGREEMENT") {
    const mean = Math.round((pair.aBpm + pair.bBpm) / 2);
    return accept(
      "C_AGREEMENT_NEAR",
      mean,
      `near agreement |A-B|<=2 → mean ${mean}`,
    );
  }
  return manual("C_AGREEMENT_NEAR", "conflict beyond ±2");
}

/** G1: agreement → accept; else manual. GENERAL RULE. */
export function strategyG1(pair: PairAnalysis): EnsembleResult {
  if (pair.agreement === "AGREEMENT" && pair.aBpm != null) {
    return accept("G1_AGREEMENT_OR_MANUAL", pair.aBpm, "exact agreement");
  }
  return manual("G1_AGREEMENT_OR_MANUAL", "conflict → MANUAL_REQUIRED");
}

/**
 * G2: agreement → accept;
 * A top in B candidates → accept A;
 * B top in A candidates → accept B;
 * mutual but unequal → MANUAL.
 * GENERAL RULE (no fixture IDs).
 */
export function strategyG2(pair: PairAnalysis): EnsembleResult {
  if (pair.agreement === "AGREEMENT" && pair.aBpm != null) {
    return accept(
      "G2_AGREEMENT_OR_CROSS_SUPPORT",
      pair.aBpm,
      "exact agreement",
    );
  }
  if (pair.aTopInB && pair.bTopInA && pair.aBpm != null && pair.bBpm != null) {
    if (pair.aBpm === pair.bBpm) {
      return accept(
        "G2_AGREEMENT_OR_CROSS_SUPPORT",
        pair.aBpm,
        "mutual candidate support equal",
      );
    }
    return manual(
      "G2_AGREEMENT_OR_CROSS_SUPPORT",
      "mutual cross-support but A≠B → MANUAL",
    );
  }
  if (pair.aTopInB && pair.aBpm != null) {
    return accept(
      "G2_AGREEMENT_OR_CROSS_SUPPORT",
      pair.aBpm,
      "A top supported in B candidates",
    );
  }
  if (pair.bTopInA && pair.bBpm != null) {
    return accept(
      "G2_AGREEMENT_OR_CROSS_SUPPORT",
      pair.bBpm,
      "B top supported in A candidates",
    );
  }
  return manual(
    "G2_AGREEMENT_OR_CROSS_SUPPORT",
    "no agreement / no cross-support",
  );
}

/**
 * G3: agreement → accept; harmonic relation → pick band-normalized; else manual.
 * GENERAL RULE (70–160 soft band preference among harmonic pair).
 */
export function strategyG3(pair: PairAnalysis): EnsembleResult {
  if (pair.agreement === "AGREEMENT" && pair.aBpm != null) {
    return accept(
      "G3_AGREEMENT_OR_HARMONIC",
      pair.aBpm,
      "exact agreement",
    );
  }
  if (
    pair.aBpm != null &&
    pair.bBpm != null &&
    isHarmonicRelation(pair.relation.kind)
  ) {
    const picked = pickHarmonicNormalized(pair.aBpm, pair.bBpm);
    return accept(
      "G3_AGREEMENT_OR_HARMONIC",
      picked,
      `harmonic ${pair.relation.kind} → prefer hip-hop band / nearer 100 → ${picked}`,
    );
  }
  return manual("G3_AGREEMENT_OR_HARMONIC", "no agreement / no harmonic");
}

/**
 * G4: agreement → accept;
 * near-agreement → mean;
 * harmonic → band pick;
 * one-way cross-support → that top;
 * else MANUAL.
 * Does NOT use higher-confidence-wins (RCA: confidence≠correctness).
 * GENERAL RULE.
 */
export function strategyG4(pair: PairAnalysis): EnsembleResult {
  if (pair.aBpm == null || pair.bBpm == null) {
    return manual("G4_AGREE_CROSS_OR_HARMONIC", "missing A or B");
  }
  if (pair.agreement === "AGREEMENT") {
    return accept("G4_AGREE_CROSS_OR_HARMONIC", pair.aBpm, "exact agreement");
  }
  if (pair.agreement === "NEAR_AGREEMENT") {
    const mean = Math.round((pair.aBpm + pair.bBpm) / 2);
    return accept(
      "G4_AGREE_CROSS_OR_HARMONIC",
      mean,
      `near agreement → mean ${mean}`,
    );
  }
  if (isHarmonicRelation(pair.relation.kind)) {
    const picked = pickHarmonicNormalized(pair.aBpm, pair.bBpm);
    return accept(
      "G4_AGREE_CROSS_OR_HARMONIC",
      picked,
      `harmonic ${pair.relation.kind} → ${picked}`,
    );
  }
  if (pair.aTopInB && !pair.bTopInA) {
    return accept(
      "G4_AGREE_CROSS_OR_HARMONIC",
      pair.aBpm,
      "A top in B candidates",
    );
  }
  if (pair.bTopInA && !pair.aTopInB) {
    return accept(
      "G4_AGREE_CROSS_OR_HARMONIC",
      pair.bBpm,
      "B top in A candidates",
    );
  }
  return manual(
    "G4_AGREE_CROSS_OR_HARMONIC",
    "conflict without safe support → MANUAL",
  );
}

export const ALL_STRATEGIES: EnsembleStrategyId[] = [
  "A_ONLY",
  "B_ONLY",
  "C_AGREEMENT_EXACT",
  "C_AGREEMENT_NEAR",
  "G1_AGREEMENT_OR_MANUAL",
  "G2_AGREEMENT_OR_CROSS_SUPPORT",
  "G3_AGREEMENT_OR_HARMONIC",
  "G4_AGREE_CROSS_OR_HARMONIC",
];

export function runStrategy(
  id: EnsembleStrategyId,
  a: ExperimentEstimatorResult,
  b: ExperimentEstimatorResult,
  pair: PairAnalysis,
): EnsembleResult {
  switch (id) {
    case "A_ONLY":
      return strategyAOnly(a);
    case "B_ONLY":
      return strategyBOnly(b);
    case "C_AGREEMENT_EXACT":
      return strategyCExact(pair);
    case "C_AGREEMENT_NEAR":
      return strategyCNear(pair);
    case "G1_AGREEMENT_OR_MANUAL":
      return strategyG1(pair);
    case "G2_AGREEMENT_OR_CROSS_SUPPORT":
      return strategyG2(pair);
    case "G3_AGREEMENT_OR_HARMONIC":
      return strategyG3(pair);
    case "G4_AGREE_CROSS_OR_HARMONIC":
      return strategyG4(pair);
    default: {
      const _exhaustive: never = id;
      return manual(_exhaustive, "unknown strategy");
    }
  }
}
