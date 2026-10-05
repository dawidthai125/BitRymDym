import "server-only";

import { parseBuffer } from "music-metadata";

import {
  analyzeBeatBpm,
  type BpmProbeResult,
} from "@/lib/beats/audio-bpm";
import type { BeatBpmAnalysis } from "@/lib/beats/bpm-ensemble";
import { validateAudioUploadMeta } from "@/lib/beats/audio-validation";
import { suggestTitleFromFilename } from "@/lib/beats/filename-title";
import {
  BEAT_DURATION_MAX,
  BEAT_DURATION_MIN,
} from "@/lib/beats/validation";
import {
  isLikelyEbmlWebmContainer,
  probeDurationSecondsViaAudioDecode,
} from "@/lib/beats/webm-duration-fallback";

/**
 * Rounding rule for music-metadata float seconds → integer duration_seconds:
 * Math.round (half-up). Then enforce BEAT_DURATION_MIN..BEAT_DURATION_MAX.
 */
export function roundDurationSeconds(rawSeconds: number): number {
  return Math.round(rawSeconds);
}

export type AudioDurationProbeResult =
  | {
      ok: true;
      durationSeconds: number;
      durationRawSeconds: number;
    }
  | { ok: false; error: string };

function finalizeDurationProbe(
  raw: number,
): AudioDurationProbeResult {
  if (!Number.isFinite(raw) || raw <= 0) {
    return {
      ok: false,
      error: "Nie udało się odczytać czasu trwania z pliku audio.",
    };
  }

  const durationSeconds = roundDurationSeconds(raw);
  if (durationSeconds < BEAT_DURATION_MIN) {
    return {
      ok: false,
      error: `Czas trwania musi wynosić co najmniej ${BEAT_DURATION_MIN} s.`,
    };
  }
  if (durationSeconds > BEAT_DURATION_MAX) {
    return {
      ok: false,
      error: `Czas trwania nie może przekraczać ${BEAT_DURATION_MAX} s (wykryto ${durationSeconds} s).`,
    };
  }

  return {
    ok: true,
    durationSeconds,
    durationRawSeconds: raw,
  };
}

/**
 * Probe audio bytes for duration (server source of truth).
 * Does not trust client-supplied duration.
 *
 * Chromium MediaRecorder WebM/Opus (esp. timesliced) often omits
 * Segment Info.Duration; music-metadata then returns no format.duration
 * because it ignores Cluster elements. Fallback: decode PCM via the
 * existing `audio-decode` dependency and use sampleCount/sampleRate.
 */
export async function probeAudioDurationFromBytes(params: {
  bytes: Uint8Array;
  contentTypeHint?: string | null;
  /** Filename/path hint — required for some music-metadata v11 MP3 detections. */
  originalFilename?: string | null;
}): Promise<AudioDurationProbeResult> {
  if (!params.bytes.length) {
    return { ok: false, error: "Plik audio jest pusty." };
  }

  try {
    const fileInfo =
      params.contentTypeHint || params.originalFilename
        ? {
            ...(params.contentTypeHint
              ? { mimeType: params.contentTypeHint }
              : {}),
            ...(params.originalFilename
              ? { path: params.originalFilename }
              : {}),
            size: params.bytes.byteLength,
          }
        : { size: params.bytes.byteLength };

    const metadata = await parseBuffer(
      Buffer.from(params.bytes),
      fileInfo,
      { duration: true },
    );

    let raw = metadata.format.duration;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
      if (
        isLikelyEbmlWebmContainer({
          bytes: params.bytes,
          contentTypeHint: params.contentTypeHint,
        })
      ) {
        const decoded = await probeDurationSecondsViaAudioDecode(params.bytes);
        if (decoded != null) {
          raw = decoded;
        }
      }
    }

    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
      return {
        ok: false,
        error: "Nie udało się odczytać czasu trwania z pliku audio.",
      };
    }

    return finalizeDurationProbe(raw);
  } catch {
    // Container parse hard-fail: still try WebM decode fallback when likely EBML.
    if (
      isLikelyEbmlWebmContainer({
        bytes: params.bytes,
        contentTypeHint: params.contentTypeHint,
      })
    ) {
      const decoded = await probeDurationSecondsViaAudioDecode(params.bytes);
      if (decoded != null) {
        return finalizeDurationProbe(decoded);
      }
    }
    return {
      ok: false,
      error: "Nie udało się przeanalizować pliku audio.",
    };
  }
}

export type AnalyzedBeatBpm =
  | {
      status: "auto_suggest";
      bpm: number;
      reason: string;
      analysis: BeatBpmAnalysis;
    }
  | {
      status: "manual_required";
      message: string;
      reason: string;
      analysis: BeatBpmAnalysis;
    }
  | {
      status: "unavailable";
      message: string;
      reason?: string;
      analysis?: BeatBpmAnalysis;
    };

export type AnalyzedBeatAudio =
  | {
      ok: true;
      durationSeconds: number;
      byteSize: number;
      contentType: string;
      titleSuggestion: string;
      bpm: AnalyzedBeatBpm;
      bpmProbe: BpmProbeResult;
    }
  | { ok: false; error: string };

function mapBpmProbe(probe: BpmProbeResult): AnalyzedBeatBpm {
  if (probe.status === "auto_suggest") {
    return {
      status: "auto_suggest",
      bpm: probe.bpm,
      reason: probe.reason,
      analysis: probe.analysis,
    };
  }
  if (probe.status === "manual_required") {
    return {
      status: "manual_required",
      message: probe.message,
      reason: probe.reason,
      analysis: probe.analysis,
    };
  }
  return {
    status: "unavailable",
    message: probe.message,
    reason: probe.reason,
    analysis: probe.analysis,
  };
}

/**
 * Full server-side audio gate: MIME/size + duration + BPM ensemble probe.
 */
export async function analyzeBeatAudioBytes(params: {
  bytes: Uint8Array;
  contentType: string;
  originalFilename?: string | null;
}): Promise<AnalyzedBeatAudio> {
  const meta = validateAudioUploadMeta({
    contentType: params.contentType,
    byteSize: params.bytes.byteLength,
  });
  if (!meta.ok) {
    return { ok: false, error: meta.errors.join("; ") };
  }

  const probe = await probeAudioDurationFromBytes({
    bytes: params.bytes,
    contentTypeHint: params.contentType,
    originalFilename: params.originalFilename,
  });
  if (!probe.ok) {
    return { ok: false, error: probe.error };
  }

  const bpmProbe = await analyzeBeatBpm({
    bytes: params.bytes,
    contentType: params.contentType,
  });

  return {
    ok: true,
    durationSeconds: probe.durationSeconds,
    byteSize: params.bytes.byteLength,
    contentType: params.contentType,
    titleSuggestion: suggestTitleFromFilename(params.originalFilename),
    bpm: mapBpmProbe(bpmProbe),
    bpmProbe,
  };
}
