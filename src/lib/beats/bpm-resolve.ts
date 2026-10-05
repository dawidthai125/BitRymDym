/**
 * Deterministic BPM resolution for half-time / double-time pairs.
 * Pure logic — no I/O, no randomness, order-independent.
 */

import {
  BPM_HIPHOP_PREF_MAX,
  BPM_HIPHOP_PREF_MIN,
  isHalfOrDouble,
  roundBpm,
} from "@/lib/beats/audio-bpm-rank";
import { BEAT_BPM_MAX, BEAT_BPM_MIN } from "@/lib/beats/validation";

export type BpmResolveCandidate = {
  bpm: number;
  confidence: number;
};

export type BpmResolveConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type DetectedBpmResolution =
  | {
      status: "AUTO_SUGGEST";
      bpm: number;
      reason: "HALF_DOUBLE_RESOLVED" | "UNAMBIGUOUS";
      confidence: Exclude<BpmResolveConfidence, "NONE">;
      pair: [number, number] | null;
      scoreLow: number;
      scoreHigh: number;
    }
  | {
      status: "MANUAL_REQUIRED";
      bpm: null;
      reason: "TRUE_CONFLICT" | "NO_CANDIDATES" | "UNRESOLVED_PAIR";
      confidence: "NONE";
      pair: [number, number] | null;
    };

const NEAR = 1;
const WEAK_BAND_BIAS = 0.02;
const TOP_ESTIMATE_BIAS = 0.05;

function nearBpm(a: number, b: number, tol = NEAR): boolean {
  return Math.abs(a - b) <= tol;
}

function inWeakBand(bpm: number): boolean {
  return bpm >= BPM_HIPHOP_PREF_MIN && bpm <= BPM_HIPHOP_PREF_MAX;
}

/** Max confidence for a BPM among candidates (order-independent). */
export function maxConfidenceNear(
  bpm: number,
  candidates: readonly BpmResolveCandidate[],
  tol = NEAR,
): number {
  let max = 0;
  for (const c of candidates) {
    const r = roundBpm(c.bpm);
    if (r == null) continue;
    if (nearBpm(r, bpm, tol)) {
      const conf = Math.max(0, Math.min(1, c.confidence));
      if (conf > max) max = conf;
    }
  }
  return max;
}

/**
 * Score a BPM using detector confidence evidence only (+ weak band / top bias).
 * Deterministic for identical inputs.
 */
export function scoreBpmCandidate(params: {
  bpm: number;
  candidatesA: readonly BpmResolveCandidate[];
  candidatesB: readonly BpmResolveCandidate[];
  topEstimates?: readonly number[];
}): number {
  const { bpm, candidatesA, candidatesB, topEstimates = [] } = params;
  let score =
    maxConfidenceNear(bpm, candidatesA) + maxConfidenceNear(bpm, candidatesB);

  if (inWeakBand(bpm)) score += WEAK_BAND_BIAS;

  for (const top of topEstimates) {
    if (nearBpm(top, bpm)) score += TOP_ESTIMATE_BIAS;
  }

  return score;
}

/**
 * Find a half/double pair among rounded BPM values.
 * Prefers pairs that involve preferred BPMs (estimator tops), then smallest lo/hi.
 */
export function findHalfDoublePair(
  values: readonly number[],
  preferBpms: readonly number[] = [],
): [number, number] | null {
  const unique = [
    ...new Set(
      values
        .map((v) => roundBpm(v))
        .filter((v): v is number => v != null),
    ),
  ].sort((a, b) => a - b);

  if (unique.length < 2) return null;

  const preferred = preferBpms
    .map((v) => roundBpm(v))
    .filter((v): v is number => v != null);

  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      const lo = unique[i]!;
      const hi = unique[j]!;
      if (isHalfOrDouble(lo, hi)) pairs.push([lo, hi]);
    }
  }
  if (pairs.length === 0) return null;

  const involvesPreferred = (pair: [number, number]) =>
    preferred.some(
      (p) => nearBpm(p, pair[0]) || nearBpm(p, pair[1]),
    );

  // When tops are provided, only consider half/double pairs involving a top.
  const scoped =
    preferred.length > 0 ? pairs.filter(involvesPreferred) : pairs;
  if (scoped.length === 0) return null;

  scoped.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scoped[0]!;
}

const CROSS_SUPPORT_MIN_CONF = 0.7;
const CROSS_SUPPORT_MARGIN = 0.05;

/**
 * When estimator tops disagree non-harmonically, pick a BPM strongly
 * supported by both candidate lists (cross-support). Deterministic.
 */
export function resolveCrossSupportBpm(params: {
  candidatesA: readonly BpmResolveCandidate[];
  candidatesB: readonly BpmResolveCandidate[];
  topEstimates?: readonly (number | null | undefined)[];
}): DetectedBpmResolution {
  const candidatesA = [...params.candidatesA].sort(
    (a, b) => a.bpm - b.bpm || a.confidence - b.confidence,
  );
  const candidatesB = [...params.candidatesB].sort(
    (a, b) => a.bpm - b.bpm || a.confidence - b.confidence,
  );
  const tops = (params.topEstimates ?? [])
    .map((t) => (typeof t === "number" ? roundBpm(t) : null))
    .filter((t): t is number => t != null);

  const bpmSet = new Set<number>();
  for (const c of [...candidatesA, ...candidatesB, ...tops.map((t) => ({ bpm: t, confidence: 0 }))]) {
    const r = roundBpm(c.bpm);
    if (r != null) bpmSet.add(r);
  }

  type Scored = { bpm: number; score: number; confA: number; confB: number };
  const scored: Scored[] = [];
  for (const bpm of [...bpmSet].sort((a, b) => a - b)) {
    const confA = maxConfidenceNear(bpm, candidatesA);
    const confB = maxConfidenceNear(bpm, candidatesB);
    if (confA < CROSS_SUPPORT_MIN_CONF || confB < CROSS_SUPPORT_MIN_CONF) {
      continue;
    }
    // Must align with at least one estimator top — avoid inventing mid-list BPM.
    const nearTop = tops.some((t) => nearBpm(t, bpm));
    if (!nearTop) continue;

    let score = confA + confB;
    if (inWeakBand(bpm)) score += WEAK_BAND_BIAS;
    for (const top of tops) {
      if (nearBpm(top, bpm)) score += TOP_ESTIMATE_BIAS;
    }
    scored.push({ bpm, score, confA, confB });
  }

  if (scored.length === 0) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "TRUE_CONFLICT",
      confidence: "NONE",
      pair: null,
    };
  }

  scored.sort((a, b) => b.score - a.score || a.bpm - b.bpm);

  // Collapse near-duplicate BPM clusters (e.g. 91 vs 92) into one winner.
  const clusters: Scored[] = [];
  for (const entry of scored) {
    const existing = clusters.find((c) => nearBpm(c.bpm, entry.bpm));
    if (!existing) {
      clusters.push(entry);
      continue;
    }
    // Prefer BPM nearer an estimator top; else lower BPM (deterministic).
    const existingTopDist = Math.min(
      ...tops.map((t) => Math.abs(t - existing.bpm)),
      Number.POSITIVE_INFINITY,
    );
    const entryTopDist = Math.min(
      ...tops.map((t) => Math.abs(t - entry.bpm)),
      Number.POSITIVE_INFINITY,
    );
    if (
      entry.score > existing.score + 1e-9 ||
      (Math.abs(entry.score - existing.score) <= 1e-9 &&
        (entryTopDist < existingTopDist ||
          (entryTopDist === existingTopDist && entry.bpm < existing.bpm)))
    ) {
      clusters[clusters.indexOf(existing)] = entry;
    }
  }
  clusters.sort((a, b) => b.score - a.score || a.bpm - b.bpm);

  const best = clusters[0]!;
  const second = clusters[1];
  if (second && best.score - second.score < CROSS_SUPPORT_MARGIN) {
    if (isHalfOrDouble(best.bpm, second.bpm)) {
      return resolveDetectedBpm({
        candidatesA,
        candidatesB,
        topEstimates: tops,
        pair: [best.bpm, second.bpm],
      });
    }
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "TRUE_CONFLICT",
      confidence: "NONE",
      pair: null,
    };
  }

  if (best.bpm < BEAT_BPM_MIN || best.bpm > BEAT_BPM_MAX) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "TRUE_CONFLICT",
      confidence: "NONE",
      pair: null,
    };
  }

  return {
    status: "AUTO_SUGGEST",
    bpm: best.bpm,
    reason: "UNAMBIGUOUS",
    confidence: confidenceLabel(best.score, second?.score ?? 0),
    pair: null,
    scoreLow: best.confA,
    scoreHigh: best.confB,
  };
}

function confidenceLabel(
  winnerScore: number,
  loserScore: number,
): Exclude<BpmResolveConfidence, "NONE"> {
  const margin = winnerScore - loserScore;
  if (margin >= 0.35 && winnerScore >= 0.9) return "HIGH";
  if (margin >= 0.1 || winnerScore >= 0.7) return "MEDIUM";
  return "LOW";
}

/**
 * Resolve detected BPM when half/double ambiguity is present.
 *
 * - Never always-min / always-max.
 * - Uses detector confidence from both estimators.
 * - Weak hip-hop band bias only as tie-softener.
 * - Final equal-score tie-break: lower BPM (stable, documented).
 */
export function resolveDetectedBpm(params: {
  candidatesA?: readonly BpmResolveCandidate[];
  candidatesB?: readonly BpmResolveCandidate[];
  /** Estimator tops / C_NEAR suggestion — used as evidence, not forced winners. */
  topEstimates?: readonly (number | null | undefined)[];
  /** Explicit pair to resolve; if omitted, discovered from tops+candidates. */
  pair?: readonly [number, number] | null;
}): DetectedBpmResolution {
  const candidatesA = [...(params.candidatesA ?? [])].sort(
    (a, b) => a.bpm - b.bpm || a.confidence - b.confidence,
  );
  const candidatesB = [...(params.candidatesB ?? [])].sort(
    (a, b) => a.bpm - b.bpm || a.confidence - b.confidence,
  );

  const tops = (params.topEstimates ?? [])
    .map((t) => (typeof t === "number" ? roundBpm(t) : null))
    .filter((t): t is number => t != null);

  const allBpms = [
    ...tops,
    ...candidatesA.map((c) => c.bpm),
    ...candidatesB.map((c) => c.bpm),
  ];

  if (allBpms.length === 0 && !params.pair) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "NO_CANDIDATES",
      confidence: "NONE",
      pair: null,
    };
  }

  let pair: [number, number] | null = null;
  if (params.pair) {
    const lo = roundBpm(Math.min(params.pair[0], params.pair[1]));
    const hi = roundBpm(Math.max(params.pair[0], params.pair[1]));
    if (lo != null && hi != null && isHalfOrDouble(lo, hi)) {
      pair = [lo, hi];
    }
  }
  if (!pair) {
    pair = findHalfDoublePair(allBpms, tops);
  }

  // Single unambiguous candidate (no half/double pair discovered)
  if (!pair) {
    const uniqueTops = [...new Set(tops)].sort((a, b) => a - b);
    if (uniqueTops.length === 1) {
      const bpm = uniqueTops[0]!;
      if (bpm < BEAT_BPM_MIN || bpm > BEAT_BPM_MAX) {
        return {
          status: "MANUAL_REQUIRED",
          bpm: null,
          reason: "UNRESOLVED_PAIR",
          confidence: "NONE",
          pair: null,
        };
      }
      return {
        status: "AUTO_SUGGEST",
        bpm,
        reason: "UNAMBIGUOUS",
        confidence: "HIGH",
        pair: null,
        scoreLow: 0,
        scoreHigh: 0,
      };
    }
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "TRUE_CONFLICT",
      confidence: "NONE",
      pair: null,
    };
  }

  const [lo, hi] = pair;
  const scoreLow = scoreBpmCandidate({
    bpm: lo,
    candidatesA,
    candidatesB,
    topEstimates: tops,
  });
  const scoreHigh = scoreBpmCandidate({
    bpm: hi,
    candidatesA,
    candidatesB,
    topEstimates: tops,
  });

  // Both scores ~0 and neither is a top → cannot resolve from evidence
  if (scoreLow <= 1e-9 && scoreHigh <= 1e-9) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "UNRESOLVED_PAIR",
      confidence: "NONE",
      pair,
    };
  }

  let winner: number;
  if (scoreHigh > scoreLow + 1e-9) {
    winner = hi;
  } else if (scoreLow > scoreHigh + 1e-9) {
    winner = lo;
  } else {
    // Equal score: prefer weak band, then lower BPM (deterministic)
    const loIn = inWeakBand(lo);
    const hiIn = inWeakBand(hi);
    if (loIn && !hiIn) winner = lo;
    else if (hiIn && !loIn) winner = hi;
    else winner = lo;
  }

  if (winner < BEAT_BPM_MIN || winner > BEAT_BPM_MAX) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "UNRESOLVED_PAIR",
      confidence: "NONE",
      pair,
    };
  }

  const loserScore = winner === lo ? scoreHigh : scoreLow;
  const winnerScore = winner === lo ? scoreLow : scoreHigh;

  return {
    status: "AUTO_SUGGEST",
    bpm: winner,
    reason: "HALF_DOUBLE_RESOLVED",
    confidence: confidenceLabel(winnerScore, loserScore),
    pair,
    scoreLow,
    scoreHigh,
  };
}

// ---------------------------------------------------------------------------
// Multi-signal canonical scoring + AUTO gate
// ---------------------------------------------------------------------------

/**
 * Explicit composite weights (must sum to 1).
 * Raw beatTrack.confidence is intentionally excluded (denser-grid bias).
 */
export const BPM_SCORE_WEIGHTS = {
  estimator: 0.3,
  onset: 0.3,
  regularity: 0.2,
  segment: 0.2,
} as const;

/** Minimum composite margin (top − runner-up) for AUTO. */
export const BPM_AUTO_MARGIN_MIN = 0.08;

/** Minimum independent dimensions that must favor the winner. */
export const BPM_AUTO_MIN_DIMENSIONS = 2;

/** Soft floor on winner composite score. */
export const BPM_AUTO_MIN_COMPOSITE = 0.32;

/**
 * Near-tempo cluster tolerance (BPM).
 * |91−92|=1 → same cluster; |92−122|=30 → separate.
 * Documented small absolute tol — not ±5.
 */
export const BPM_NEAR_TEMPO_TOL = 1;

/**
 * Estimator tops farther apart than this (and not half/double) = hard conflict.
 * Requires strengthened AUTO gate.
 */
export const BPM_HARD_ESTIMATOR_DELTA = 10;

/** Stricter margin when independent estimators hard-disagree. */
export const BPM_HARD_CONFLICT_MARGIN_MIN = 0.15;

/** Stricter dimension agreement under hard estimator conflict. */
export const BPM_HARD_CONFLICT_MIN_DIMENSIONS = 3;

export type MultiSignalScores = {
  bpm: number;
  estimatorNorm: number;
  onset: number;
  regularity: number;
  segment: number;
  composite: number;
  dimensionsLeading: number;
};

export type CanonicalBpmResolution =
  | {
      status: "AUTO_SUGGEST";
      bpm: number;
      reason: "MULTI_SIGNAL_AGREED" | "HALF_DOUBLE_RESOLVED" | "UNAMBIGUOUS";
      confidence: Exclude<BpmResolveConfidence, "NONE">;
      scores: MultiSignalScores[];
      margin: number;
      runnerUpBpm: number | null;
      estimatorHardConflict: boolean;
    }
  | {
      status: "MANUAL_REQUIRED";
      bpm: null;
      reason:
        | "INSUFFICIENT_MARGIN"
        | "SIGNAL_DISAGREEMENT"
        | "SEGMENT_CONTRADICTION"
        | "ESTIMATOR_HARD_CONFLICT"
        | "TRUE_CONFLICT"
        | "NO_CANDIDATES"
        | "UNRESOLVED_PAIR";
      confidence: "NONE";
      scores: MultiSignalScores[];
      margin: number;
      runnerUpBpm: number | null;
      estimatorHardConflict: boolean;
    };

export type MultiSignalEvidenceInput = {
  bpm: number;
  estimatorSupport: number;
  onsetAlignment: number;
  ibiRegularity: number;
  segmentMean: number;
  segmentConsistency: number;
  segmentWinRate: number;
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Merge near-tempo candidates (|Δbpm| ≤ BPM_NEAR_TEMPO_TOL) into one cluster.
 * Representative: best estimatorSupport → onsetAlignment → lower BPM (deterministic).
 * Evidence fields use max() — no artificial boost from summing.
 */
export function clusterNearTempoCandidates(
  evidences: readonly MultiSignalEvidenceInput[],
): MultiSignalEvidenceInput[] {
  if (evidences.length === 0) return [];

  const sorted = [...evidences].sort((a, b) => a.bpm - b.bpm);
  const clusters: MultiSignalEvidenceInput[][] = [];

  for (const e of sorted) {
    const last = clusters[clusters.length - 1];
    if (
      last &&
      Math.abs(e.bpm - last[last.length - 1]!.bpm) <= BPM_NEAR_TEMPO_TOL
    ) {
      last.push(e);
    } else {
      clusters.push([e]);
    }
  }

  return clusters
    .map((group) => {
      if (group.length === 1) return group[0]!;

      // Deterministic representative — do not invent a mean BPM.
      const rep = [...group].sort(
        (a, b) =>
          b.estimatorSupport - a.estimatorSupport ||
          b.onsetAlignment - a.onsetAlignment ||
          a.bpm - b.bpm,
      )[0]!;

      return {
        bpm: rep.bpm,
        estimatorSupport: Math.max(...group.map((g) => g.estimatorSupport)),
        onsetAlignment: Math.max(...group.map((g) => g.onsetAlignment)),
        ibiRegularity: Math.max(...group.map((g) => g.ibiRegularity)),
        segmentMean: Math.max(...group.map((g) => g.segmentMean)),
        segmentConsistency: Math.max(...group.map((g) => g.segmentConsistency)),
        segmentWinRate: Math.max(...group.map((g) => g.segmentWinRate)),
      };
    })
    .sort((a, b) => a.bpm - b.bpm);
}

/**
 * True when independent estimator tops hard-disagree (not near, not half/double).
 */
export function isEstimatorHardConflict(
  aBpm: number | null | undefined,
  bBpm: number | null | undefined,
): boolean {
  if (typeof aBpm !== "number" || typeof bBpm !== "number") return false;
  const abs = Math.abs(aBpm - bBpm);
  if (abs <= BPM_NEAR_TEMPO_TOL) return false;
  if (abs <= 2) return false; // C_NEAR band — not a hard conflict
  if (isHalfOrDouble(aBpm, bBpm)) return false;
  return abs > BPM_HARD_ESTIMATOR_DELTA;
}

/**
 * Collapse half/double pairs to a single representative using estimator support
 * (resolveDetectedBpm). Prevents denser grids from competing as separate tops.
 */
export function normalizeHalfDoubleCandidates(
  evidences: readonly MultiSignalEvidenceInput[],
): MultiSignalEvidenceInput[] {
  const sorted = [...evidences].sort((a, b) => a.bpm - b.bpm);
  const used = new Set<number>();
  const out: MultiSignalEvidenceInput[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i]!;
    if (used.has(a.bpm)) continue;

    let twin: MultiSignalEvidenceInput | null = null;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j]!;
      if (used.has(b.bpm)) continue;
      if (isHalfOrDouble(a.bpm, b.bpm)) {
        twin = b;
        break;
      }
    }

    if (!twin) {
      out.push(a);
      used.add(a.bpm);
      continue;
    }

    const resolved = resolveDetectedBpm({
      pair: [a.bpm, twin.bpm],
      topEstimates: [a.bpm, twin.bpm],
      candidatesA: [
        { bpm: a.bpm, confidence: clamp01(a.estimatorSupport / 2) },
        { bpm: twin.bpm, confidence: clamp01(twin.estimatorSupport / 2) },
      ],
      candidatesB: [
        { bpm: a.bpm, confidence: clamp01(a.onsetAlignment) },
        { bpm: twin.bpm, confidence: clamp01(twin.onsetAlignment) },
      ],
    });

    const pickBpm =
      resolved.status === "AUTO_SUGGEST" ? resolved.bpm : Math.min(a.bpm, twin.bpm);
    const pick = pickBpm === a.bpm ? a : twin;
    out.push(pick);
    used.add(a.bpm);
    used.add(twin.bpm);
  }

  return out.sort((a, b) => a.bpm - b.bpm);
}

/**
 * Score multi-signal evidence. Estimator support normalized by max in set.
 * Order: near-tempo cluster → half/double collapse → score.
 */
export function scoreMultiSignalCandidates(
  evidences: readonly MultiSignalEvidenceInput[],
): MultiSignalScores[] {
  const clustered = clusterNearTempoCandidates(evidences);
  const normalized = normalizeHalfDoubleCandidates(clustered);
  if (normalized.length === 0) return [];

  const maxEst = Math.max(
    ...normalized.map((e) => e.estimatorSupport),
    1e-9,
  );

  const scored: MultiSignalScores[] = normalized.map((e) => {
    const estimatorNorm = clamp01(e.estimatorSupport / maxEst);
    const onset = clamp01(e.onsetAlignment);
    const regularity = clamp01(e.ibiRegularity);
    // Segment signal blends mean alignment, consistency, and win rate —
    // none of these reward denser grids by themselves.
    const segment = clamp01(
      0.5 * e.segmentMean +
        0.25 * e.segmentConsistency +
        0.25 * e.segmentWinRate,
    );
    const composite =
      BPM_SCORE_WEIGHTS.estimator * estimatorNorm +
      BPM_SCORE_WEIGHTS.onset * onset +
      BPM_SCORE_WEIGHTS.regularity * regularity +
      BPM_SCORE_WEIGHTS.segment * segment;

    return {
      bpm: e.bpm,
      estimatorNorm,
      onset,
      regularity,
      segment,
      composite,
      dimensionsLeading: 0,
    };
  });

  // Count how many dimensions each candidate leads (for agreement gate).
  const dims: Array<
    keyof Pick<
      MultiSignalScores,
      "estimatorNorm" | "onset" | "regularity" | "segment"
    >
  > = ["estimatorNorm", "onset", "regularity", "segment"];

  for (const dim of dims) {
    let bestVal = -1;
    let bestBpms: number[] = [];
    for (const s of scored) {
      const v = s[dim];
      if (v > bestVal + 1e-9) {
        bestVal = v;
        bestBpms = [s.bpm];
      } else if (Math.abs(v - bestVal) <= 1e-9) {
        bestBpms.push(s.bpm);
      }
    }
    for (const s of scored) {
      if (bestBpms.includes(s.bpm)) s.dimensionsLeading += 1;
    }
  }

  scored.sort((a, b) => b.composite - a.composite || a.bpm - b.bpm);
  return scored;
}

/**
 * Canonical multi-signal BPM decision (pure).
 * AUTO only with sufficient margin + ≥2 independent dimensions + no segment contradiction.
 * Hard estimator conflict (non half/double tops far apart) requires a stricter gate.
 */
export function resolveCanonicalBpm(params: {
  evidences: readonly MultiSignalEvidenceInput[];
  /** Independent estimator tops — used only for hard-conflict guard. */
  aBpm?: number | null;
  bBpm?: number | null;
}): CanonicalBpmResolution {
  const hardConflict = isEstimatorHardConflict(params.aBpm, params.bBpm);

  if (params.evidences.length === 0) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "NO_CANDIDATES",
      confidence: "NONE",
      scores: [],
      margin: 0,
      runnerUpBpm: null,
      estimatorHardConflict: hardConflict,
    };
  }

  const scores = scoreMultiSignalCandidates(params.evidences);
  if (scores.length === 0) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "NO_CANDIDATES",
      confidence: "NONE",
      scores: [],
      margin: 0,
      runnerUpBpm: null,
      estimatorHardConflict: hardConflict,
    };
  }

  if (scores.length === 1) {
    const only = scores[0]!;
    // Single surviving candidate after clustering — still block if tops hard-conflict
    // and the sole survivor is not near either top (defensive).
    if (only.composite < BPM_AUTO_MIN_COMPOSITE) {
      return {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "INSUFFICIENT_MARGIN",
        confidence: "NONE",
        scores,
        margin: 0,
        runnerUpBpm: null,
        estimatorHardConflict: hardConflict,
      };
    }
    if (hardConflict) {
      // One cluster left but estimators still hard-disagree → require strong composite
      // and that the winner is near at least one estimator top.
      const nearA =
        typeof params.aBpm === "number" &&
        Math.abs(only.bpm - params.aBpm) <= BPM_NEAR_TEMPO_TOL;
      const nearB =
        typeof params.bBpm === "number" &&
        Math.abs(only.bpm - params.bBpm) <= BPM_NEAR_TEMPO_TOL;
      if (!nearA && !nearB) {
        return {
          status: "MANUAL_REQUIRED",
          bpm: null,
          reason: "ESTIMATOR_HARD_CONFLICT",
          confidence: "NONE",
          scores,
          margin: only.composite,
          runnerUpBpm: null,
          estimatorHardConflict: true,
        };
      }
      // Sole survivor near a top after clustering others away — still MANUAL under
      // hard conflict unless we had a runner to prove margin. Conservative: MANUAL.
      return {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "ESTIMATOR_HARD_CONFLICT",
        confidence: "NONE",
        scores,
        margin: only.composite,
        runnerUpBpm: null,
        estimatorHardConflict: true,
      };
    }
    return {
      status: "AUTO_SUGGEST",
      bpm: only.bpm,
      reason: "UNAMBIGUOUS",
      confidence: "HIGH",
      scores,
      margin: only.composite,
      runnerUpBpm: null,
      estimatorHardConflict: false,
    };
  }

  const top = scores[0]!;
  const runner = scores[1]!;
  const margin = top.composite - runner.composite;

  const marginMin = hardConflict
    ? BPM_HARD_CONFLICT_MARGIN_MIN
    : BPM_AUTO_MARGIN_MIN;
  const dimsMin = hardConflict
    ? BPM_HARD_CONFLICT_MIN_DIMENSIONS
    : BPM_AUTO_MIN_DIMENSIONS;

  if (top.composite < BPM_AUTO_MIN_COMPOSITE) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "INSUFFICIENT_MARGIN",
      confidence: "NONE",
      scores,
      margin,
      runnerUpBpm: runner.bpm,
      estimatorHardConflict: hardConflict,
    };
  }

  if (margin < marginMin) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: hardConflict ? "ESTIMATOR_HARD_CONFLICT" : "INSUFFICIENT_MARGIN",
      confidence: "NONE",
      scores,
      margin,
      runnerUpBpm: runner.bpm,
      estimatorHardConflict: hardConflict,
    };
  }

  if (top.dimensionsLeading < dimsMin) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: hardConflict ? "ESTIMATOR_HARD_CONFLICT" : "SIGNAL_DISAGREEMENT",
      confidence: "NONE",
      scores,
      margin,
      runnerUpBpm: runner.bpm,
      estimatorHardConflict: hardConflict,
    };
  }

  // Segment contradiction: runner clearly preferred by segment signal.
  if (runner.segment > top.segment + 0.08) {
    return {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason: "SEGMENT_CONTRADICTION",
      confidence: "NONE",
      scores,
      margin,
      runnerUpBpm: runner.bpm,
      estimatorHardConflict: hardConflict,
    };
  }

  const halfDouble = isHalfOrDouble(top.bpm, runner.bpm);
  return {
    status: "AUTO_SUGGEST",
    bpm: top.bpm,
    reason: halfDouble ? "HALF_DOUBLE_RESOLVED" : "MULTI_SIGNAL_AGREED",
    confidence: confidenceLabel(top.composite, runner.composite),
    scores,
    margin,
    runnerUpBpm: runner.bpm,
    estimatorHardConflict: hardConflict,
  };
}
