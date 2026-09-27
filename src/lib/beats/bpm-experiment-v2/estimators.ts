/**
 * Experiment V2 estimators — tooling only, not used by production create/probe.
 *
 * A = production path: @audio/beat tempo (ACF + ~120 prior)
 * B = combTempo (comb-filter resonance + ~120 prior, same ODF family)
 */

import { combTempo, tempo } from "@audio/beat";

import { roundBpm } from "@/lib/beats/audio-bpm-rank";

export type ExperimentEstimatorId = "A_tempo" | "B_combTempo";

export type ExperimentCandidate = {
  bpm: number;
  bpmRounded: number | null;
  confidence: number | null;
};

export type ExperimentEstimatorResult = {
  estimator: ExperimentEstimatorId;
  method: string;
  rawTopBpm: number | null;
  rawTopBpmFloat: number | null;
  confidence: number | null;
  candidates: ExperimentCandidate[] | null;
  detectionMs: number;
  errorMessage?: string;
};

const TEMPO_OPTS = {
  minBpm: 60,
  maxBpm: 200,
  candidates: 8,
} as const;

function mapResult(
  estimator: ExperimentEstimatorId,
  method: string,
  raw: {
    bpm?: number;
    confidence?: number;
    candidates?: Array<{ bpm: number; confidence: number }>;
  },
  detectionMs: number,
): ExperimentEstimatorResult {
  const list =
    Array.isArray(raw.candidates) && raw.candidates.length > 0
      ? raw.candidates.map((c) => ({
          bpm: c.bpm,
          bpmRounded: roundBpm(c.bpm),
          confidence: typeof c.confidence === "number" ? c.confidence : null,
        }))
      : typeof raw.bpm === "number"
        ? [
            {
              bpm: raw.bpm,
              bpmRounded: roundBpm(raw.bpm),
              confidence:
                typeof raw.confidence === "number" ? raw.confidence : null,
            },
          ]
        : null;

  const topFloat =
    typeof raw.bpm === "number" && Number.isFinite(raw.bpm) ? raw.bpm : null;

  return {
    estimator,
    method,
    rawTopBpm: topFloat != null ? roundBpm(topFloat) : null,
    rawTopBpmFloat: topFloat,
    confidence:
      typeof raw.confidence === "number" ? raw.confidence : null,
    candidates: list,
    detectionMs,
  };
}

export function runEstimatorA(
  samples: Float32Array,
  sampleRate: number,
): ExperimentEstimatorResult {
  const t0 = performance.now();
  try {
    const raw = tempo(samples, { fs: sampleRate, ...TEMPO_OPTS }) as {
      bpm?: number;
      confidence?: number;
      candidates?: Array<{ bpm: number; confidence: number }>;
    };
    return mapResult(
      "A_tempo",
      "ACF(ODF) + log-Gaussian(~120BPM) + max-norm",
      raw,
      Math.round(performance.now() - t0),
    );
  } catch (e) {
    return {
      estimator: "A_tempo",
      method: "ACF(ODF) + log-Gaussian(~120BPM) + max-norm",
      rawTopBpm: null,
      rawTopBpmFloat: null,
      confidence: null,
      candidates: null,
      detectionMs: Math.round(performance.now() - t0),
      errorMessage: e instanceof Error ? e.message : "tempo failed",
    };
  }
}

export function runEstimatorB(
  samples: Float32Array,
  sampleRate: number,
): ExperimentEstimatorResult {
  const t0 = performance.now();
  try {
    const raw = combTempo(samples, { fs: sampleRate, ...TEMPO_OPTS }) as {
      bpm?: number;
      confidence?: number;
      candidates?: Array<{ bpm: number; confidence: number }>;
    };
    return mapResult(
      "B_combTempo",
      "comb-filter resonance(ODF+harmonics) + log-Gaussian(~120BPM) + max-norm",
      raw,
      Math.round(performance.now() - t0),
    );
  } catch (e) {
    return {
      estimator: "B_combTempo",
      method: "comb-filter resonance(ODF+harmonics) + log-Gaussian(~120BPM) + max-norm",
      rawTopBpm: null,
      rawTopBpmFloat: null,
      confidence: null,
      candidates: null,
      detectionMs: Math.round(performance.now() - t0),
      errorMessage: e instanceof Error ? e.message : "combTempo failed",
    };
  }
}
