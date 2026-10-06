/**
 * P5.5 — pure Studio recording helpers (playhead → Clip geometry).
 * Take lifecycle / eligibility remain in src/lib/takes (SSOT).
 */

import { assertIntegerMs } from "@/lib/studio/studio-time";

/** Convert server Take duration (seconds, float probe) → integer ms for Clip. */
export function takeDurationSecondsToMs(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("durationSeconds must be a positive finite number.");
  }
  const ms = Math.round(durationSeconds * 1000);
  if (ms < 1) {
    throw new Error("Recorded duration must be at least 1 ms.");
  }
  return ms;
}

/**
 * Geometry for a newly recorded Take placed at the Studio playhead.
 * source_offset_ms is always 0 for a fresh capture.
 */
export function geometryForStudioRecording(params: {
  playheadMs: number;
  durationSeconds: number;
  timelineLengthMs: number;
}): {
  timelineStartMs: number;
  durationMs: number;
  sourceOffsetMs: 0;
} {
  assertIntegerMs(params.playheadMs, "playheadMs");
  assertIntegerMs(params.timelineLengthMs, "timelineLengthMs");
  if (params.playheadMs < 0) {
    throw new Error("playheadMs must be >= 0.");
  }
  if (params.playheadMs >= params.timelineLengthMs) {
    throw new Error("playheadMs must be inside the project timeline.");
  }
  const durationMs = takeDurationSecondsToMs(params.durationSeconds);
  const end = params.playheadMs + durationMs;
  if (end > params.timelineLengthMs) {
    throw new Error(
      "Nagranie wykracza poza długość projektu. Skróć nagranie lub wydłuż projekt.",
    );
  }
  return {
    timelineStartMs: params.playheadMs,
    durationMs,
    sourceOffsetMs: 0,
  };
}

export function listTakeClips<
  T extends {
    sourceKind: string;
    sourceTakeId: string | null;
    timelineStartMs: number;
  },
>(clips: readonly T[]): T[] {
  return clips
    .filter((c) => c.sourceKind === "TAKE" && c.sourceTakeId)
    .slice()
    .sort((a, b) => a.timelineStartMs - b.timelineStartMs);
}

/**
 * P5.6 Keep idempotency: same track + take + timeline start → reuse Clip.
 * Overlapping different placements of the same Take are still allowed.
 */
export function findIdenticalTakeClipPlacement<
  T extends {
    trackId: string;
    sourceKind: string;
    sourceTakeId: string | null;
    timelineStartMs: number;
  },
>(
  clips: readonly T[],
  params: { trackId: string; takeId: string; timelineStartMs: number },
): T | undefined {
  return clips.find(
    (c) =>
      c.trackId === params.trackId &&
      c.sourceKind === "TAKE" &&
      c.sourceTakeId === params.takeId &&
      c.timelineStartMs === params.timelineStartMs,
  );
}
