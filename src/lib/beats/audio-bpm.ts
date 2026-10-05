import "server-only";

import { combTempo, tempo } from "@audio/beat";

import {
  resolveEnsembleSuggestion,
  snapshotFromRaw,
  type BeatBpmAnalysis,
  type BpmReasonCode,
} from "@/lib/beats/bpm-ensemble";
import {
  collectBpmCandidates,
  gatherBpmEvidence,
} from "@/lib/beats/bpm-evidence";
import {
  resolveCanonicalBpm,
  type CanonicalBpmResolution,
} from "@/lib/beats/bpm-resolve";
import { decodeAudioToMonoPcm } from "@/lib/beats/audio-pcm-decode";

export type { BeatBpmAnalysis, BpmReasonCode };

export type BpmProbeResult =
  | {
      status: "auto_suggest";
      analysis: BeatBpmAnalysis;
      bpm: number;
      reason: BpmReasonCode;
      source: "ensemble";
      canonical?: CanonicalBpmResolution;
    }
  | {
      status: "manual_required";
      analysis: BeatBpmAnalysis;
      reason: BpmReasonCode;
      message: string;
      source: "ensemble";
      canonical?: CanonicalBpmResolution;
    }
  | {
      status: "unavailable";
      reason: "unsupported_format" | "decode_failed" | "analysis_failed";
      message: string;
      analysis?: BeatBpmAnalysis;
    };

const TEMPO_OPTS = {
  minBpm: 60,
  maxBpm: 200,
  candidates: 8,
} as const;

/** Cap evidence set size for CPU (deterministic: prefer tops, then lower BPM). */
const MAX_EVIDENCE_CANDIDATES = 6;

function manualMessage(reason: BpmReasonCode): string {
  switch (reason) {
    case "UNSUPPORTED_FORMAT":
      return "Automatyczne wykrywanie BPM dla tego formatu jest niedostępne.";
    case "DECODE_FAILED":
      return "Nie udało się zdekodować audio do analizy BPM.";
    case "ANALYSIS_FAILED":
    case "MISSING_ESTIMATE":
      return "BPM nie udało się wiarygodnie określić.";
    case "CONFLICT":
    case "OCTAVE_AMBIGUITY":
    case "HALF_DOUBLE_RESOLVED":
    case "MULTI_SIGNAL_AGREED":
    case "INSUFFICIENT_MARGIN":
    case "SIGNAL_DISAGREEMENT":
    case "SEGMENT_CONTRADICTION":
    case "ESTIMATOR_HARD_CONFLICT":
    case "OUT_OF_RANGE":
      return "BPM nie udało się wiarygodnie określić.";
    default:
      return "BPM nie udało się wiarygodnie określić.";
  }
}

function selectEvidenceBpms(params: {
  all: number[];
  aBpm: number | null;
  bBpm: number | null;
}): number[] {
  const prefer = new Set<number>();
  if (params.aBpm != null) prefer.add(params.aBpm);
  if (params.bBpm != null) prefer.add(params.bBpm);

  const preferred = params.all.filter((b) => prefer.has(b));
  const rest = params.all.filter((b) => !prefer.has(b));
  const merged = [...preferred, ...rest];
  return merged.slice(0, MAX_EVIDENCE_CANDIDATES);
}

function mapCanonicalReason(
  canonical: CanonicalBpmResolution,
): BpmReasonCode {
  if (canonical.status === "AUTO_SUGGEST") {
    if (canonical.reason === "MULTI_SIGNAL_AGREED") return "MULTI_SIGNAL_AGREED";
    if (canonical.reason === "HALF_DOUBLE_RESOLVED") return "HALF_DOUBLE_RESOLVED";
    return "AGREEMENT";
  }
  if (canonical.reason === "INSUFFICIENT_MARGIN") return "INSUFFICIENT_MARGIN";
  if (canonical.reason === "SIGNAL_DISAGREEMENT") return "SIGNAL_DISAGREEMENT";
  if (canonical.reason === "SEGMENT_CONTRADICTION") return "SEGMENT_CONTRADICTION";
  if (canonical.reason === "ESTIMATOR_HARD_CONFLICT") return "ESTIMATOR_HARD_CONFLICT";
  if (canonical.reason === "NO_CANDIDATES") return "MISSING_ESTIMATE";
  return "CONFLICT";
}

/**
 * Production BPM probe (single PCM decode):
 * tempo + combTempo → ensemble candidates → multi-signal evidence →
 * resolveCanonicalBpm AUTO gate.
 * Does not read ID3 BPM. Raw trackConf is never a sole winner.
 */
export async function analyzeBeatBpm(params: {
  bytes: Uint8Array;
  contentType: string;
}): Promise<BpmProbeResult> {
  const decoded = await decodeAudioToMonoPcm({
    bytes: params.bytes,
    contentType: params.contentType,
  });

  if (!decoded.ok) {
    const reasonCode: BpmReasonCode =
      decoded.reason === "unsupported_format"
        ? "UNSUPPORTED_FORMAT"
        : "DECODE_FAILED";
    return {
      status: "unavailable",
      reason:
        decoded.reason === "unsupported_format"
          ? "unsupported_format"
          : "decode_failed",
      message: decoded.message,
      analysis: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: reasonCode,
      },
    };
  }

  try {
    const rawA = tempo(decoded.samples, {
      fs: decoded.sampleRate,
      ...TEMPO_OPTS,
    }) as {
      bpm?: number;
      confidence?: number;
      candidates?: Array<{ bpm: number; confidence: number }>;
    };
    const rawB = combTempo(decoded.samples, {
      fs: decoded.sampleRate,
      ...TEMPO_OPTS,
    }) as {
      bpm?: number;
      confidence?: number;
      candidates?: Array<{ bpm: number; confidence: number }>;
    };

    const snapA = snapshotFromRaw(rawA);
    const snapB = snapshotFromRaw(rawB);
    const ensemble = resolveEnsembleSuggestion({
      aBpm: snapA.bpm,
      bBpm: snapB.bpm,
      candidatesA: snapA.candidates,
      candidatesB: snapB.candidates,
    });
    ensemble.estimatorA = {
      ...snapA,
      confidence: snapA.confidence,
    };
    ensemble.estimatorB = {
      ...snapB,
      confidence: snapB.confidence,
    };

    // Missing / decode-level failures stay MANUAL without multi-signal.
    if (
      ensemble.reason === "MISSING_ESTIMATE" ||
      ensemble.reason === "OUT_OF_RANGE"
    ) {
      return {
        status: "manual_required",
        analysis: ensemble,
        reason: ensemble.reason,
        message: manualMessage(ensemble.reason),
        source: "ensemble",
      };
    }

    const allCandidates = collectBpmCandidates({
      aBpm: snapA.bpm,
      bBpm: snapB.bpm,
      candidatesA: snapA.candidates,
      candidatesB: snapB.candidates,
    });
    const evidenceBpms = selectEvidenceBpms({
      all: allCandidates,
      aBpm: snapA.bpm,
      bBpm: snapB.bpm,
    });

    // Ensure ensemble suggestion (if any) is scored.
    if (
      ensemble.bpm != null &&
      !evidenceBpms.includes(ensemble.bpm) &&
      evidenceBpms.length >= MAX_EVIDENCE_CANDIDATES
    ) {
      evidenceBpms[evidenceBpms.length - 1] = ensemble.bpm;
    } else if (ensemble.bpm != null && !evidenceBpms.includes(ensemble.bpm)) {
      evidenceBpms.push(ensemble.bpm);
    }

    const evidence = gatherBpmEvidence({
      samples: decoded.samples,
      sampleRate: decoded.sampleRate,
      candidateBpms: evidenceBpms,
      candidatesA: snapA.candidates,
      candidatesB: snapB.candidates,
      aBpm: snapA.bpm,
      bBpm: snapB.bpm,
    });

    const canonical = resolveCanonicalBpm({
      evidences: evidence.candidates,
      aBpm: snapA.bpm,
      bBpm: snapB.bpm,
    });

    // Canonical multi-signal gate is authoritative for AUTO.
    // Ensemble may suggest; insufficient multi-signal evidence → MANUAL.
    if (canonical.status === "AUTO_SUGGEST") {
      const reason = mapCanonicalReason(canonical);
      const analysis: BeatBpmAnalysis = {
        status: "AUTO_SUGGEST",
        bpm: canonical.bpm,
        reason,
        estimatorA: ensemble.estimatorA,
        estimatorB: ensemble.estimatorB,
      };
      return {
        status: "auto_suggest",
        analysis,
        bpm: canonical.bpm,
        reason,
        source: "ensemble",
        canonical,
      };
    }

    const reason = mapCanonicalReason(canonical);
    const analysis: BeatBpmAnalysis = {
      status: "MANUAL_REQUIRED",
      bpm: null,
      reason,
      estimatorA: ensemble.estimatorA,
      estimatorB: ensemble.estimatorB,
    };
    return {
      status: "manual_required",
      analysis,
      reason,
      message: manualMessage(reason),
      source: "ensemble",
      canonical,
    };
  } catch {
    return {
      status: "unavailable",
      reason: "analysis_failed",
      message: "Analiza BPM nie powiodła się.",
      analysis: {
        status: "MANUAL_REQUIRED",
        bpm: null,
        reason: "ANALYSIS_FAILED",
      },
    };
  }
}

/** @deprecated Alias — prefer analyzeBeatBpm. */
export async function probeAudioBpmFromBytes(params: {
  bytes: Uint8Array;
  contentType: string;
}): Promise<BpmProbeResult> {
  return analyzeBeatBpm(params);
}
