/**
 * Production BPM ensemble — C_NEAR + half/double resolution.
 * Pure logic (no I/O). Confidence is never a sole winner rule.
 */

import { isHalfOrDouble, roundBpm } from "@/lib/beats/audio-bpm-rank";
import {
  findHalfDoublePair,
  resolveCrossSupportBpm,
  resolveDetectedBpm,
} from "@/lib/beats/bpm-resolve";
import {
  buildBpmUncertaintyEnvelope,
  resolveCreateBpm,
} from "@/lib/beats/bpm-uncertainty";
import { BEAT_BPM_MAX, BEAT_BPM_MIN } from "@/lib/beats/validation";

export type BpmDecisionStatus = "AUTO_SUGGEST" | "MANUAL_REQUIRED";

export type BpmReasonCode =
  | "AGREEMENT"
  | "NEAR_AGREEMENT"
  | "CONFLICT"
  | "OCTAVE_AMBIGUITY"
  | "HALF_DOUBLE_RESOLVED"
  | "MULTI_SIGNAL_AGREED"
  | "INSUFFICIENT_MARGIN"
  | "SIGNAL_DISAGREEMENT"
  | "SEGMENT_CONTRADICTION"
  | "ESTIMATOR_HARD_CONFLICT"
  | "UNSUPPORTED_FORMAT"
  | "DECODE_FAILED"
  | "ANALYSIS_FAILED"
  | "OUT_OF_RANGE"
  | "MISSING_ESTIMATE";

export type EnsembleEstimatorSnapshot = {
  bpm: number | null;
  confidence: number | null;
  candidates: Array<{ bpm: number; confidence: number }>;
};

export type BeatBpmAnalysis = {
  status: BpmDecisionStatus;
  bpm: number | null;
  reason: BpmReasonCode;
  estimatorA?: EnsembleEstimatorSnapshot;
  estimatorB?: EnsembleEstimatorSnapshot;
};

const DETECTOR_MAX_BPM = 200;
const DETECTOR_MIN_BPM = 60;
const NEAR_TOL = 2;
const CAND_TOL = 1;

function candidateHas(
  bpm: number,
  candidates: Array<{ bpm: number }>,
  tol = CAND_TOL,
): boolean {
  return candidates.some((c) => Math.abs(Math.round(c.bpm) - bpm) <= tol);
}

/**
 * Detect half/double (octave) ambiguity around a suggested BPM.
 * Used as a signal to invoke resolveDetectedBpm — not as an automatic MANUAL.
 */
export function hasOctaveAmbiguity(params: {
  suggestedBpm: number;
  candidatesA: Array<{ bpm: number }>;
  candidatesB: Array<{ bpm: number }>;
}): boolean {
  const { suggestedBpm } = params;
  const half = Math.round(suggestedBpm / 2);
  const dbl = suggestedBpm * 2;

  if (
    candidateHas(half, params.candidatesA) ||
    candidateHas(dbl, params.candidatesA) ||
    candidateHas(half, params.candidatesB) ||
    candidateHas(dbl, params.candidatesB)
  ) {
    return true;
  }

  // Low-side trap (e.g. 142→71): suggested ≤100 and 2× still in detector max.
  if (suggestedBpm <= 100 && dbl <= DETECTOR_MAX_BPM) return true;
  // High-side trap (e.g. 80→161): suggested ≥140 and ÷2 still in detector min.
  if (suggestedBpm >= 140 && half >= DETECTOR_MIN_BPM) return true;

  return false;
}

function octavePairForSuggested(params: {
  suggestedBpm: number;
  candidatesA: Array<{ bpm: number }>;
  candidatesB: Array<{ bpm: number }>;
}): [number, number] {
  const { suggestedBpm } = params;
  const half = Math.round(suggestedBpm / 2);
  const dbl = suggestedBpm * 2;

  const halfPresent =
    candidateHas(half, params.candidatesA) ||
    candidateHas(half, params.candidatesB);
  const dblPresent =
    candidateHas(dbl, params.candidatesA) ||
    candidateHas(dbl, params.candidatesB);

  if (halfPresent && !dblPresent) return [half, suggestedBpm];
  if (dblPresent && !halfPresent) return [suggestedBpm, dbl];
  if (halfPresent && dblPresent) {
    // Prefer the pair whose nearer side matches the suggestion.
    return suggestedBpm <= 100
      ? [suggestedBpm, dbl]
      : [half, suggestedBpm];
  }

  if (suggestedBpm <= 100 && dbl <= DETECTOR_MAX_BPM) {
    return [suggestedBpm, dbl];
  }
  if (suggestedBpm >= 140 && half >= DETECTOR_MIN_BPM) {
    return [half, suggestedBpm];
  }
  return [Math.min(suggestedBpm, half), Math.max(suggestedBpm, half * 2)];
}

function applyHalfDoubleResolution(params: {
  candidatesA: Array<{ bpm: number; confidence: number }>;
  candidatesB: Array<{ bpm: number; confidence: number }>;
  topEstimates: Array<number | null | undefined>;
  pair?: readonly [number, number] | null;
  snapA: EnsembleEstimatorSnapshot;
  snapB: EnsembleEstimatorSnapshot;
  manualFallback: BpmReasonCode;
}): BeatBpmAnalysis {
  const resolved = resolveDetectedBpm({
    candidatesA: params.candidatesA,
    candidatesB: params.candidatesB,
    topEstimates: params.topEstimates,
    pair: params.pair,
  });

  if (resolved.status === "AUTO_SUGGEST") {
    return {
      status: "AUTO_SUGGEST",
      bpm: resolved.bpm,
      reason:
        resolved.reason === "UNAMBIGUOUS"
          ? "AGREEMENT"
          : "HALF_DOUBLE_RESOLVED",
      estimatorA: params.snapA,
      estimatorB: params.snapB,
    };
  }

  return {
    status: "MANUAL_REQUIRED",
    bpm: null,
    reason: params.manualFallback,
    estimatorA: params.snapA,
    estimatorB: params.snapB,
  };
}

/**
 * C_NEAR, then deterministic half/double resolution when octave-related.
 * True non-harmonic conflicts stay MANUAL_REQUIRED.
 */
export function resolveEnsembleSuggestion(params: {
  aBpm: number | null;
  bBpm: number | null;
  candidatesA?: Array<{ bpm: number; confidence?: number }>;
  candidatesB?: Array<{ bpm: number; confidence?: number }>;
}): BeatBpmAnalysis {
  const { aBpm, bBpm } = params;
  const candidatesA = (params.candidatesA ?? []).map((c) => ({
    bpm: c.bpm,
    confidence: typeof c.confidence === "number" ? c.confidence : 0,
  }));
  const candidatesB = (params.candidatesB ?? []).map((c) => ({
    bpm: c.bpm,
    confidence: typeof c.confidence === "number" ? c.confidence : 0,
  }));

  const snapA: EnsembleEstimatorSnapshot = {
    bpm: aBpm,
    confidence: null,
    candidates: candidatesA,
  };
  const snapB: EnsembleEstimatorSnapshot = {
    bpm: bBpm,
    confidence: null,
    candidates: candidatesB,
  };

  if (aBpm == null || bBpm == null) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "MISSING_ESTIMATE",
      estimatorA: snapA,
      estimatorB: snapB,
    };
  }

  const abs = Math.abs(aBpm - bBpm);

  // Estimators disagree beyond near-tol — resolve from evidence before MANUAL.
  if (abs > NEAR_TOL) {
    if (isHalfOrDouble(aBpm, bBpm)) {
      return applyHalfDoubleResolution({
        candidatesA,
        candidatesB,
        topEstimates: [aBpm, bBpm],
        pair: [Math.min(aBpm, bBpm), Math.max(aBpm, bBpm)],
        snapA,
        snapB,
        manualFallback: "OCTAVE_AMBIGUITY",
      });
    }

    // Half/double twin of either top present in candidate pool.
    const poolPair = findHalfDoublePair(
      [
        aBpm,
        bBpm,
        ...candidatesA.map((c) => c.bpm),
        ...candidatesB.map((c) => c.bpm),
      ],
      [aBpm, bBpm],
    );
    if (poolPair) {
      const resolved = applyHalfDoubleResolution({
        candidatesA,
        candidatesB,
        topEstimates: [aBpm, bBpm],
        pair: poolPair,
        snapA,
        snapB,
        manualFallback: "CONFLICT",
      });
      if (resolved.status === "AUTO_SUGGEST") return resolved;
    }

    // Cross-support: both estimators strongly endorse the same BPM.
    const cross = resolveCrossSupportBpm({
      candidatesA,
      candidatesB,
      topEstimates: [aBpm, bBpm],
    });
    if (cross.status === "AUTO_SUGGEST") {
      return {
        status: "AUTO_SUGGEST",
        bpm: cross.bpm,
        reason:
          cross.reason === "HALF_DOUBLE_RESOLVED"
            ? "HALF_DOUBLE_RESOLVED"
            : "NEAR_AGREEMENT",
        estimatorA: snapA,
        estimatorB: snapB,
      };
    }

    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "CONFLICT",
      estimatorA: snapA,
      estimatorB: snapB,
    };
  }

  const cNearBpm = abs === 0 ? aBpm : Math.round((aBpm + bBpm) / 2);
  const cNearReason: BpmReasonCode =
    abs === 0 ? "AGREEMENT" : "NEAR_AGREEMENT";

  if (
    cNearBpm < BEAT_BPM_MIN ||
    cNearBpm > BEAT_BPM_MAX ||
    !Number.isInteger(cNearBpm)
  ) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "OUT_OF_RANGE",
      estimatorA: snapA,
      estimatorB: snapB,
    };
  }

  if (
    hasOctaveAmbiguity({
      suggestedBpm: cNearBpm,
      candidatesA,
      candidatesB,
    })
  ) {
    return applyHalfDoubleResolution({
      candidatesA,
      candidatesB,
      topEstimates: [aBpm, bBpm, cNearBpm],
      pair: octavePairForSuggested({
        suggestedBpm: cNearBpm,
        candidatesA,
        candidatesB,
      }),
      snapA,
      snapB,
      manualFallback: "OCTAVE_AMBIGUITY",
    });
  }

  return {
    status: "AUTO_SUGGEST",
    bpm: cNearBpm,
    reason: cNearReason,
    estimatorA: snapA,
    estimatorB: snapB,
  };
}

/** Map raw @audio/beat tops + candidates into rounded BPM snapshots. */
export function snapshotFromRaw(raw: {
  bpm?: number;
  confidence?: number;
  candidates?: Array<{ bpm: number; confidence: number }>;
}): EnsembleEstimatorSnapshot {
  const candidates: Array<{ bpm: number; confidence: number }> = [];
  if (Array.isArray(raw.candidates)) {
    for (const c of raw.candidates) {
      const r = roundBpm(c.bpm);
      if (r != null) {
        candidates.push({
          bpm: r,
          confidence: typeof c.confidence === "number" ? c.confidence : 0,
        });
      }
    }
  }
  const top =
    typeof raw.bpm === "number" ? roundBpm(raw.bpm) : (candidates[0]?.bpm ?? null);
  return {
    bpm: top,
    confidence: typeof raw.confidence === "number" ? raw.confidence : null,
    candidates,
  };
}

/**
 * Create policy for ensemble suggest — delegates to allowlist envelope.
 * `bpmManualOverride` never grants free 1–300 entry.
 */
export function resolveCreateBpmFromEnsemble(params: {
  clientBpm: number;
  bpmManualOverride: boolean;
  analysis: BeatBpmAnalysis | null;
  decodeAvailable: boolean;
}): { ok: true; bpm: number } | { ok: false; error: string } {
  const { clientBpm, bpmManualOverride, analysis, decodeAvailable } = params;

  if (!decodeAvailable) {
    const r = resolveCreateBpm({
      clientBpm,
      bpmManualOverride,
      suggestedBpm: null,
      decodeAvailable: false,
    });
    return r.ok ? { ok: true, bpm: r.bpm } : { ok: false, error: r.error };
  }

  if (analysis?.status === "AUTO_SUGGEST" && analysis.bpm != null) {
    const aBpm = analysis.estimatorA?.bpm ?? analysis.bpm;
    const bBpm = analysis.estimatorB?.bpm ?? analysis.bpm;
    const raw: number[] = [analysis.bpm];
    for (const est of [analysis.estimatorA, analysis.estimatorB]) {
      if (est?.bpm != null) raw.push(est.bpm);
      for (const c of est?.candidates ?? []) raw.push(Math.round(c.bpm));
    }
    const envelope = buildBpmUncertaintyEnvelope({
      decision: "AUTO_SUGGEST",
      reason: analysis.reason,
      message: "Wykryto automatycznie.",
      detectedBpm: analysis.bpm,
      canonical: null,
      aBpm: typeof aBpm === "number" ? aBpm : null,
      bBpm: typeof bBpm === "number" ? bBpm : null,
      rawCandidateBpms: raw,
    });
    const r = resolveCreateBpm({
      clientBpm,
      envelope,
      bpmManualOverride,
    });
    return r.ok ? { ok: true, bpm: r.bpm } : { ok: false, error: r.error };
  }

  // MANUAL_REQUIRED: build allowlist from estimator tops/candidates only — no free entry.
  const aBpm = analysis?.estimatorA?.bpm ?? null;
  const bBpm = analysis?.estimatorB?.bpm ?? null;
  const raw: number[] = [];
  for (const est of [analysis?.estimatorA, analysis?.estimatorB]) {
    if (est?.bpm != null) raw.push(est.bpm);
    for (const c of est?.candidates ?? []) raw.push(Math.round(c.bpm));
  }
  const envelope = buildBpmUncertaintyEnvelope({
    decision: "MANUAL_REQUIRED",
    reason: analysis?.reason ?? "MISSING_ESTIMATE",
    message: "BPM nie udało się wiarygodnie określić.",
    detectedBpm: aBpm ?? bBpm,
    canonical: null,
    aBpm,
    bBpm,
    rawCandidateBpms: raw,
  });
  const r = resolveCreateBpm({
    clientBpm,
    envelope,
    bpmManualOverride,
  });
  return r.ok ? { ok: true, bpm: r.bpm } : { ok: false, error: r.error };
}
