/**
 * P5.5 — TAKE clip helpers for StudioTransport (pure, no I/O).
 * Signed preview URLs remain owned by /api/takes/preview.
 */

import type { StudioClipDto } from "@/lib/studio/studio-types";

export type TakeClipTiming = {
  takeId: string;
  timelineStartMs: number;
  sourceOffsetMs: number;
  durationMs: number;
  gainDb?: number;
  muted?: boolean;
};

/** TAKE clips with a source take, sorted by timeline start. */
export function listTakeClipTimings(
  clips: readonly StudioClipDto[],
): TakeClipTiming[] {
  return clips
    .filter((c) => c.sourceKind === "TAKE" && c.sourceTakeId)
    .map((c) => ({
      takeId: c.sourceTakeId!,
      timelineStartMs: c.timelineStartMs,
      sourceOffsetMs: c.sourceOffsetMs,
      durationMs: c.durationMs,
      gainDb: c.gainDb,
      muted: c.muted,
    }))
    .sort((a, b) => a.timelineStartMs - b.timelineStartMs);
}

/** Active TAKE under playhead, or null if none. */
export function pickTakeClipAtPlayhead(
  clips: readonly TakeClipTiming[],
  playheadMs: number,
): TakeClipTiming | null {
  return (
    clips.find(
      (c) =>
        playheadMs >= c.timelineStartMs &&
        playheadMs < c.timelineStartMs + c.durationMs,
    ) ?? null
  );
}
