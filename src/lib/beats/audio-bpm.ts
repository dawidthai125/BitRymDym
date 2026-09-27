import "server-only";

import { combTempo, tempo } from "@audio/beat";

import {
  resolveEnsembleSuggestion,
  snapshotFromRaw,
  type BeatBpmAnalysis,
  type BpmReasonCode,
} from "@/lib/beats/bpm-ensemble";
import { decodeAudioToMonoPcm } from "@/lib/beats/audio-pcm-decode";

export type { BeatBpmAnalysis, BpmReasonCode };

export type BpmProbeResult =
  | {
      status: "auto_suggest";
      analysis: BeatBpmAnalysis;
      bpm: number;
      reason: BpmReasonCode;
      source: "ensemble";
    }
  | {
      status: "manual_required";
      analysis: BeatBpmAnalysis;
      reason: BpmReasonCode;
      message: string;
      source: "ensemble";
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
    case "OUT_OF_RANGE":
      return "BPM nie udało się wiarygodnie określić.";
    default:
      return "BPM nie udało się wiarygodnie określić.";
  }
}

/**
 * Production BPM probe: one PCM decode → tempo() + combTempo() → C_NEAR → RULE B.
 * Does not read ID3 BPM. Does not treat confidence as correctness.
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
    const analysis = resolveEnsembleSuggestion({
      aBpm: snapA.bpm,
      bBpm: snapB.bpm,
      candidatesA: snapA.candidates,
      candidatesB: snapB.candidates,
    });
    analysis.estimatorA = {
      ...snapA,
      confidence: snapA.confidence,
    };
    analysis.estimatorB = {
      ...snapB,
      confidence: snapB.confidence,
    };

    if (analysis.status === "AUTO_SUGGEST" && analysis.bpm != null) {
      return {
        status: "auto_suggest",
        analysis,
        bpm: analysis.bpm,
        reason: analysis.reason,
        source: "ensemble",
      };
    }

    return {
      status: "manual_required",
      analysis,
      reason: analysis.reason,
      message: manualMessage(analysis.reason),
      source: "ensemble",
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
