import { STUDIO_MAX_SONG_MS } from "@/config/studio";
import { geometryForStudioRecording } from "@/lib/studio/studio-record-ops";

import { RECORDER_SAMPLE_RATE, wavDurationSeconds } from "@/lib/recorder/pcm-wav";

/** Existing routes. No new desktop API and no second master. */
export const DESKTOP_VOCAL_UPLOAD_STEPS = [
  "POST /api/studio/projects",
  "POST /api/takes/session",
  "PUT signedUrl",
  "POST /api/takes/finalize",
  "POST /api/studio/projects/:projectId/record/place",
] as const;

export function createProjectBody(title: string, beatId: string): {
  title: string;
  beatId: string;
} {
  const trimmed = title.trim();
  if (trimmed.length < 1) throw new Error("Tytuł projektu jest pusty.");
  if (beatId.trim().length < 1) throw new Error("Najpierw wybierz bit w projekcie.");
  return { title: trimmed, beatId };
}

export function takeSessionBody(beatId: string, wavByteSize: number): {
  beatId: string;
  contentType: "audio/wav";
  byteSize: number;
} {
  if (beatId.trim().length < 1) throw new Error("Najpierw wybierz bit w projekcie.");
  if (!Number.isInteger(wavByteSize) || wavByteSize < 1) {
    throw new Error("Plik jest za duży lub ma nieprawidłowy rozmiar.");
  }
  return { beatId, contentType: "audio/wav", byteSize: wavByteSize };
}

export function finalizeTakeBody(takeId: string): { takeId: string } {
  if (takeId.trim().length < 1) throw new Error("Brak nagrania do dokończenia.");
  return { takeId };
}

/**
 * Place on the vocal track that project create already seeds.
 * Pan stays on the track. Clip gain stays at the database default.
 */
export function placeVocalBody(input: {
  trackId: string;
  takeId: string;
  playheadMs: number;
  samples: Int16Array;
  sampleRate?: number;
  timelineLengthMs?: number;
  expectedDocumentVersion: number;
}): {
  trackId: string;
  takeId: string;
  timelineStartMs: number;
  durationMs: number;
  sourceOffsetMs: number;
  expectedDocumentVersion: number;
} {
  if (input.trackId.trim().length < 1 || input.takeId.trim().length < 1) {
    throw new Error("Brak ścieżki albo nagrania.");
  }
  if (!Number.isInteger(input.expectedDocumentVersion)) {
    throw new Error("expectedDocumentVersion jest wymagane.");
  }
  const sampleRate = input.sampleRate ?? RECORDER_SAMPLE_RATE;
  const geometry = geometryForStudioRecording({
    playheadMs: input.playheadMs,
    durationSeconds: wavDurationSeconds(input.samples, sampleRate),
    timelineLengthMs: input.timelineLengthMs ?? STUDIO_MAX_SONG_MS,
  });
  return {
    trackId: input.trackId,
    takeId: input.takeId,
    timelineStartMs: geometry.timelineStartMs,
    durationMs: geometry.durationMs,
    sourceOffsetMs: geometry.sourceOffsetMs,
    expectedDocumentVersion: input.expectedDocumentVersion,
  };
}
