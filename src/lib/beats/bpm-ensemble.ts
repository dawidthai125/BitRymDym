/**
 * Production BPM ensemble — C_NEAR + RULE B (Design Freeze).
 * Pure logic (no I/O). Confidence is never a winner rule.
 */

import { BEAT_BPM_MAX, BEAT_BPM_MIN } from "@/lib/beats/validation";
import { roundBpm } from "@/lib/beats/audio-bpm-rank";

export type BpmDecisionStatus = "AUTO_SUGGEST" | "MANUAL_REQUIRED";

export type BpmReasonCode =
  | "AGREEMENT"
  | "NEAR_AGREEMENT"
  | "CONFLICT"
  | "OCTAVE_AMBIGUITY"
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
 * RULE B octave safety (GENERAL RULE — Design Freeze).
 * Never auto ×2 / ÷2.
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

/**
 * C_NEAR then RULE B — deterministic production resolver core.
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
  let cNearBpm: number;
  let cNearReason: BpmReasonCode;

  if (abs === 0) {
    cNearBpm = aBpm;
    cNearReason = "AGREEMENT";
  } else if (abs <= NEAR_TOL) {
    cNearBpm = Math.round((aBpm + bBpm) / 2);
    cNearReason = "NEAR_AGREEMENT";
  } else {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "CONFLICT",
      estimatorA: snapA,
      estimatorB: snapB,
    };
  }

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
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "OCTAVE_AMBIGUITY",
      estimatorA: snapA,
      estimatorB: snapB,
    };
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
 * Create policy for ensemble suggest (Design Freeze).
 * Client BPM is never trusted analysis; explicit override is allowed.
 */
export function resolveCreateBpmFromEnsemble(params: {
  clientBpm: number;
  bpmManualOverride: boolean;
  analysis: BeatBpmAnalysis | null;
  decodeAvailable: boolean;
}): { ok: true; bpm: number } | { ok: false; error: string } {
  const { clientBpm, bpmManualOverride, analysis, decodeAvailable } = params;

  if (
    typeof clientBpm !== "number" ||
    !Number.isInteger(clientBpm) ||
    clientBpm < BEAT_BPM_MIN ||
    clientBpm > BEAT_BPM_MAX
  ) {
    return { ok: false, error: "BPM musi być liczbą całkowitą 1–300." };
  }

  if (bpmManualOverride) {
    return { ok: true, bpm: clientBpm };
  }

  // Unsupported format / failed decode / MANUAL_REQUIRED → accept entered BPM.
  if (
    !decodeAvailable ||
    !analysis ||
    analysis.status === "MANUAL_REQUIRED" ||
    analysis.bpm == null
  ) {
    return { ok: true, bpm: clientBpm };
  }

  if (clientBpm === analysis.bpm) {
    return { ok: true, bpm: analysis.bpm };
  }

  return {
    ok: false,
    error:
      "BPM niezgodny z automatyczną sugestią. Przywróć wykrytą wartość lub oznacz zmianę jako ręczną.",
  };
}
