/**
 * BPM evidence gathering (I/O over already-decoded PCM).
 * Uses @audio/beat only — no second decode, no ID3 BPM, no new deps.
 *
 * Raw beatTrack.confidence is NEVER a sole winner (denser grids score higher).
 */

import { beatTrack, onsets } from "@audio/beat";

import { isHalfOrDouble, roundBpm } from "@/lib/beats/audio-bpm-rank";
import { maxConfidenceNear } from "@/lib/beats/bpm-resolve";

export type EstimatorCand = { bpm: number; confidence: number };

export type BpmCandidateEvidence = {
  bpm: number;
  /** Combined estimator support from tempo + combTempo candidates (0–2+). */
  estimatorSupport: number;
  /** Onset–grid hit rate in [0, 1]. */
  onsetAlignment: number;
  /** IBI regularity = 1 − CV, clamped to [0, 1]. Not raw trackConf. */
  ibiRegularity: number;
  /** Mean per-segment onset alignment in [0, 1]. */
  segmentMean: number;
  /** 1 − normalized std of per-segment scores; higher = more stable. */
  segmentConsistency: number;
  /** Fraction of segments where this BPM ranks first (or tied). */
  segmentWinRate: number;
  nBeats: number;
  nOnsets: number;
};

export type BpmEvidenceBundle = {
  candidates: BpmCandidateEvidence[];
  onsetCount: number;
  segmentCount: number;
  durationSec: number;
};

const SEGMENT_COUNT = 4;
const MIN_SEGMENT_SEC = 8;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function ibiRegularity(beats: Float64Array): { regularity: number; nBeats: number } {
  const ibis: number[] = [];
  for (let i = 1; i < beats.length; i += 1) {
    const d = beats[i]! - beats[i - 1]!;
    if (d > 0) ibis.push(d);
  }
  if (ibis.length < 2) {
    return { regularity: 0, nBeats: beats.length };
  }
  const m = mean(ibis);
  const cv = m > 0 ? stddev(ibis) / m : Number.POSITIVE_INFINITY;
  const regularity = Number.isFinite(cv) ? Math.max(0, Math.min(1, 1 - cv)) : 0;
  return { regularity, nBeats: beats.length };
}

/**
 * Build a uniform beat grid and measure onset hit rate within ±tol of a beat.
 * Phase chosen to maximize hits (deterministic sweep).
 */
export function onsetGridAlignment(params: {
  onsetTimes: Float64Array | number[];
  bpm: number;
  durationSec: number;
  /** Override time window (segment). */
  t0?: number;
  t1?: number;
}): number {
  const bpm = params.bpm;
  if (!(bpm > 0) || params.durationSec <= 0) return 0;

  const interval = 60 / bpm;
  const t0 = params.t0 ?? 0;
  const t1 = params.t1 ?? params.durationSec;
  const onsetsInRange: number[] = [];
  for (const o of params.onsetTimes) {
    if (o >= t0 && o < t1) onsetsInRange.push(o);
  }
  if (onsetsInRange.length === 0) return 0;

  const tol = Math.min(0.08, interval * 0.25);
  const nPhase = 16;
  let bestHits = 0;

  for (let p = 0; p < nPhase; p += 1) {
    const phase = t0 + (p / nPhase) * interval;
    let hits = 0;
    for (const o of onsetsInRange) {
      const dist =
        (((o - phase) % interval) + interval) % interval;
      const err = dist > interval / 2 ? interval - dist : dist;
      if (err <= tol) hits += 1;
    }
    if (hits > bestHits) bestHits = hits;
  }

  return bestHits / onsetsInRange.length;
}

function estimatorSupport(
  bpm: number,
  candidatesA: readonly EstimatorCand[],
  candidatesB: readonly EstimatorCand[],
  tops: readonly number[],
): number {
  let score =
    maxConfidenceNear(bpm, candidatesA) + maxConfidenceNear(bpm, candidatesB);
  for (const top of tops) {
    if (Math.abs(top - bpm) <= 1) score += 0.05;
  }
  return score;
}

/**
 * Collect unique BPM candidates from estimator tops + lists.
 * Includes half/double twins of tops when present in the pool (not invented).
 */
export function collectBpmCandidates(params: {
  aBpm: number | null;
  bBpm: number | null;
  candidatesA: readonly EstimatorCand[];
  candidatesB: readonly EstimatorCand[];
}): number[] {
  const tops = [params.aBpm, params.bBpm]
    .map((t) => (typeof t === "number" ? roundBpm(t) : null))
    .filter((t): t is number => t != null);

  const pool = new Set<number>(tops);
  for (const c of [...params.candidatesA, ...params.candidatesB]) {
    const r = roundBpm(c.bpm);
    if (r != null) pool.add(r);
  }

  // Add half/double of tops only if already observed in pool (no invention).
  for (const top of tops) {
    const half = roundBpm(top / 2);
    const dbl = roundBpm(top * 2);
    if (half != null && [...pool].some((p) => isHalfOrDouble(p, half) || p === half)) {
      pool.add(half);
    }
    if (dbl != null && [...pool].some((p) => isHalfOrDouble(p, dbl) || p === dbl)) {
      pool.add(dbl);
    }
    // Also add exact half/double of top when twin exists near 2×/½ in pool
    for (const p of [...pool]) {
      if (isHalfOrDouble(p, top)) {
        pool.add(p);
        pool.add(top);
      }
    }
  }

  return [...pool].sort((a, b) => a - b);
}

/**
 * Gather independent evidence for each candidate BPM.
 * `samples` must already be decoded mono PCM (single decode upstream).
 */
export function gatherBpmEvidence(params: {
  samples: Float32Array;
  sampleRate: number;
  candidateBpms: readonly number[];
  candidatesA: readonly EstimatorCand[];
  candidatesB: readonly EstimatorCand[];
  aBpm: number | null;
  bBpm: number | null;
}): BpmEvidenceBundle {
  const { samples, sampleRate } = params;
  const durationSec = samples.length / sampleRate;
  const tops = [params.aBpm, params.bBpm].filter(
    (t): t is number => typeof t === "number",
  );

  const onsetTimes = onsets(samples, { fs: sampleRate }) as Float64Array;

  const nSeg = Math.max(
    1,
    Math.min(
      SEGMENT_COUNT,
      Math.floor(durationSec / MIN_SEGMENT_SEC) || 1,
    ),
  );
  const segLen = durationSec / nSeg;

  const evidences: BpmCandidateEvidence[] = [];

  for (const bpm of params.candidateBpms) {
    const rounded = roundBpm(bpm);
    if (rounded == null) continue;

    const track = beatTrack(samples, {
      fs: sampleRate,
      bpm: rounded,
      minBpm: 60,
      maxBpm: 200,
    }) as { beats: Float64Array; confidence: number };

    const { regularity, nBeats } = ibiRegularity(track.beats);
    const onsetAlignment = onsetGridAlignment({
      onsetTimes,
      bpm: rounded,
      durationSec,
    });

    const segScores: number[] = [];
    for (let s = 0; s < nSeg; s += 1) {
      const t0 = s * segLen;
      const t1 = (s + 1) * segLen;
      segScores.push(
        onsetGridAlignment({
          onsetTimes,
          bpm: rounded,
          durationSec,
          t0,
          t1,
        }),
      );
    }

    const segmentMean = mean(segScores);
    const segStd = stddev(segScores);
    const segmentConsistency =
      segmentMean > 1e-9
        ? Math.max(0, Math.min(1, 1 - segStd / Math.max(segmentMean, 0.05)))
        : 0;

    evidences.push({
      bpm: rounded,
      estimatorSupport: estimatorSupport(
        rounded,
        params.candidatesA,
        params.candidatesB,
        tops,
      ),
      onsetAlignment,
      ibiRegularity: regularity,
      segmentMean,
      segmentConsistency,
      segmentWinRate: 0, // filled after all candidates scored
      nBeats,
      nOnsets: onsetTimes.length,
    });
  }

  // Per-segment winners → win rate (deterministic: lower BPM wins ties).
  for (let s = 0; s < nSeg; s += 1) {
    const t0 = s * segLen;
    const t1 = (s + 1) * segLen;
    let bestBpm = evidences[0]?.bpm ?? 0;
    let bestScore = -1;
    for (const ev of evidences) {
      const sc = onsetGridAlignment({
        onsetTimes,
        bpm: ev.bpm,
        durationSec,
        t0,
        t1,
      });
      if (
        sc > bestScore + 1e-9 ||
        (Math.abs(sc - bestScore) <= 1e-9 && ev.bpm < bestBpm)
      ) {
        bestScore = sc;
        bestBpm = ev.bpm;
      }
    }
    for (const ev of evidences) {
      if (ev.bpm === bestBpm) {
        ev.segmentWinRate += 1 / nSeg;
      }
    }
  }

  evidences.sort((a, b) => a.bpm - b.bpm);

  return {
    candidates: evidences,
    onsetCount: onsetTimes.length,
    segmentCount: nSeg,
    durationSec,
  };
}
