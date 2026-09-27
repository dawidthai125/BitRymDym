/**
 * Build a benchmark row from fixture meta + probe timings.
 * Pure evaluation — detector I/O happens in the runner.
 */

import { classifyBpmMatch } from "@/lib/beats/bpm-benchmark/classify";
import type {
  BenchmarkRow,
  BpmCandidateSnapshot,
  FixtureMeta,
} from "@/lib/beats/bpm-benchmark/types";

export function buildBenchmarkRow(params: {
  meta: FixtureMeta;
  rawDetectedBpm: number | null;
  normalizedDetectedBpm: number | null;
  confidence: number | null;
  candidates: BpmCandidateSnapshot[];
  decodeMs: number;
  detectionMs: number;
  errorMessage?: string;
}): BenchmarkRow {
  const totalMs = params.decodeMs + params.detectionMs;

  if (params.errorMessage) {
    return {
      file: params.meta.file,
      layer: params.meta.layer,
      genre: params.meta.genre,
      format: params.meta.format,
      expectedBpm: params.meta.expectedBpm,
      rawDetectedBpm: params.rawDetectedBpm,
      normalizedDetectedBpm: params.normalizedDetectedBpm,
      absoluteError: null,
      relativeError: null,
      confidence: params.confidence,
      candidates: params.candidates,
      decodeMs: params.decodeMs,
      detectionMs: params.detectionMs,
      totalMs,
      classification: "ERROR",
      errorMessage: params.errorMessage,
    };
  }

  if (
    params.normalizedDetectedBpm == null ||
    !Number.isFinite(params.normalizedDetectedBpm)
  ) {
    return {
      file: params.meta.file,
      layer: params.meta.layer,
      genre: params.meta.genre,
      format: params.meta.format,
      expectedBpm: params.meta.expectedBpm,
      rawDetectedBpm: params.rawDetectedBpm,
      normalizedDetectedBpm: null,
      absoluteError: null,
      relativeError: null,
      confidence: params.confidence,
      candidates: params.candidates,
      decodeMs: params.decodeMs,
      detectionMs: params.detectionMs,
      totalMs,
      classification: "ERROR",
      errorMessage: "No normalized BPM",
    };
  }

  const absoluteError = Math.abs(
    params.normalizedDetectedBpm - params.meta.expectedBpm,
  );
  const relativeError =
    params.meta.expectedBpm === 0
      ? null
      : absoluteError / params.meta.expectedBpm;

  return {
    file: params.meta.file,
    layer: params.meta.layer,
    genre: params.meta.genre,
    format: params.meta.format,
    expectedBpm: params.meta.expectedBpm,
    rawDetectedBpm: params.rawDetectedBpm,
    normalizedDetectedBpm: params.normalizedDetectedBpm,
    absoluteError,
    relativeError,
    confidence: params.confidence,
    candidates: params.candidates,
    decodeMs: params.decodeMs,
    detectionMs: params.detectionMs,
    totalMs,
    classification: classifyBpmMatch({
      expectedBpm: params.meta.expectedBpm,
      detectedBpm: params.normalizedDetectedBpm,
    }),
  };
}
