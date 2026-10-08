/**
 * Phase 4 — Pure preview / commit planning for MOVE + TRIM + SPLIT geometry.
 * Reuses existing CAS ops (move / trim_left / trim_right / set_geometry).
 * Take bytes are never mutated.
 */

import { STUDIO_CLIP_MIN_DURATION_MS } from "@/config/studio";
import {
  assertClipPlacement,
  type StudioClipGeometry,
} from "@/lib/studio/studio-clip-ops";
import { assertIntegerMs, clipEndMs } from "@/lib/studio/studio-time";
import {
  snapTimelineMs,
  type StudioSnapConfig,
} from "@/lib/studio/studio-timeline-view";

export type StudioClipEditCommit =
  | { kind: "noop" }
  | { kind: "move"; timelineStartMs: number }
  | { kind: "trim_left"; trimMs: number }
  | { kind: "trim_right"; trimMs: number }
  | {
      kind: "set_geometry";
      timelineStartMs: number;
      durationMs: number;
      sourceOffsetMs: number;
    };

export function clipGeometryEqual(
  a: StudioClipGeometry,
  b: StudioClipGeometry,
): boolean {
  return (
    a.timelineStartMs === b.timelineStartMs &&
    a.durationMs === b.durationMs &&
    a.sourceOffsetMs === b.sourceOffsetMs
  );
}

/**
 * Map absolute preview geometry → existing PATCH op.
 * Prefer specialized ops when they match; otherwise set_geometry.
 */
export function planClipGeometryCommit(
  original: StudioClipGeometry,
  next: StudioClipGeometry,
): StudioClipEditCommit {
  if (clipGeometryEqual(original, next)) return { kind: "noop" };

  const startDelta = next.timelineStartMs - original.timelineStartMs;
  const offsetDelta = next.sourceOffsetMs - original.sourceOffsetMs;
  const durationDelta = next.durationMs - original.durationMs;

  // MOVE — start changes; duration + sourceOffset unchanged.
  if (
    startDelta !== 0 &&
    durationDelta === 0 &&
    offsetDelta === 0
  ) {
    return { kind: "move", timelineStartMs: next.timelineStartMs };
  }

  // TRIM LEFT inward — start↑, offset↑, duration↓ by same trimMs.
  if (
    startDelta > 0 &&
    offsetDelta === startDelta &&
    durationDelta === -startDelta
  ) {
    return { kind: "trim_left", trimMs: startDelta };
  }

  // TRIM RIGHT inward — duration↓ only.
  if (
    startDelta === 0 &&
    offsetDelta === 0 &&
    durationDelta < 0
  ) {
    return { kind: "trim_right", trimMs: -durationDelta };
  }

  return {
    kind: "set_geometry",
    timelineStartMs: next.timelineStartMs,
    durationMs: next.durationMs,
    sourceOffsetMs: next.sourceOffsetMs,
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Preview left-edge drag to absolute timeline position.
 * Supports inward (trim_left) and outward extend when sourceOffset allows.
 */
export function previewTrimLeftToEdgeMs(params: {
  clip: StudioClipGeometry;
  edgeTimelineMs: number;
  timelineLengthMs: number;
  sourceDurationMs: number | null;
  snap?: StudioSnapConfig;
}): StudioClipGeometry | null {
  const { clip, timelineLengthMs, sourceDurationMs } = params;
  assertIntegerMs(clip.timelineStartMs, "timelineStartMs");
  assertIntegerMs(clip.durationMs, "durationMs");
  assertIntegerMs(clip.sourceOffsetMs, "sourceOffsetMs");

  const end = clipEndMs(clip);
  const minStart = Math.max(0, clip.timelineStartMs - clip.sourceOffsetMs);
  const maxStart = end - STUDIO_CLIP_MIN_DURATION_MS;
  if (maxStart < minStart) return null;

  let edge = Math.round(params.edgeTimelineMs);
  if (params.snap) {
    edge = snapTimelineMs(edge, params.snap, {
      minMs: minStart,
      maxMs: maxStart,
    });
  } else {
    edge = clampInteger(edge, minStart, maxStart);
  }

  // Outward extend requires known source duration / offset headroom.
  if (edge < clip.timelineStartMs) {
    const extendMs = clip.timelineStartMs - edge;
    if (clip.sourceOffsetMs < extendMs) return null;
    if (sourceDurationMs == null) {
      // Without source length, only allow inward trim.
      return null;
    }
  }

  const nextDuration = end - edge;
  const nextOffset = clip.sourceOffsetMs + (edge - clip.timelineStartMs);
  if (nextOffset < 0) return null;
  if (sourceDurationMs != null && nextOffset + nextDuration > sourceDurationMs) {
    return null;
  }
  if (nextDuration < STUDIO_CLIP_MIN_DURATION_MS) return null;

  const next: StudioClipGeometry = {
    timelineStartMs: edge,
    durationMs: nextDuration,
    sourceOffsetMs: nextOffset,
  };
  try {
    assertClipPlacement({ ...next, timelineLengthMs });
  } catch {
    return null;
  }
  return clipGeometryEqual(clip, next) ? null : next;
}

/**
 * Preview right-edge drag to absolute timeline end position.
 * Supports inward (trim_right) and outward extend when source allows.
 */
export function previewTrimRightToEdgeMs(params: {
  clip: StudioClipGeometry;
  edgeTimelineMs: number;
  timelineLengthMs: number;
  sourceDurationMs: number | null;
  snap?: StudioSnapConfig;
}): StudioClipGeometry | null {
  const { clip, timelineLengthMs, sourceDurationMs } = params;
  assertIntegerMs(clip.timelineStartMs, "timelineStartMs");
  assertIntegerMs(clip.durationMs, "durationMs");
  assertIntegerMs(clip.sourceOffsetMs, "sourceOffsetMs");

  const minEnd = clip.timelineStartMs + STUDIO_CLIP_MIN_DURATION_MS;
  const maxEndByTimeline = timelineLengthMs;
  const maxEndBySource =
    sourceDurationMs == null
      ? clipEndMs(clip) // inward only when source unknown
      : clip.timelineStartMs +
        Math.max(
          STUDIO_CLIP_MIN_DURATION_MS,
          sourceDurationMs - clip.sourceOffsetMs,
        );
  const maxEnd = Math.min(maxEndByTimeline, maxEndBySource);
  if (maxEnd < minEnd) return null;

  let edge = Math.round(params.edgeTimelineMs);
  if (params.snap) {
    edge = snapTimelineMs(edge, params.snap, {
      minMs: minEnd,
      maxMs: maxEnd,
    });
  } else {
    edge = clampInteger(edge, minEnd, maxEnd);
  }

  if (edge > clipEndMs(clip) && sourceDurationMs == null) {
    return null;
  }

  const nextDuration = edge - clip.timelineStartMs;
  if (nextDuration < STUDIO_CLIP_MIN_DURATION_MS) return null;
  if (
    sourceDurationMs != null &&
    clip.sourceOffsetMs + nextDuration > sourceDurationMs
  ) {
    return null;
  }

  const next: StudioClipGeometry = {
    timelineStartMs: clip.timelineStartMs,
    durationMs: nextDuration,
    sourceOffsetMs: clip.sourceOffsetMs,
  };
  try {
    assertClipPlacement({ ...next, timelineLengthMs });
  } catch {
    return null;
  }
  return clipGeometryEqual(clip, next) ? null : next;
}

/** Preview MOVE — sourceOffset unchanged. */
export function previewMoveClipStartMs(params: {
  clip: StudioClipGeometry;
  timelineStartMs: number;
  timelineLengthMs: number;
  snap?: StudioSnapConfig;
}): StudioClipGeometry | null {
  const { clip, timelineLengthMs } = params;
  const maxStart = Math.max(0, timelineLengthMs - clip.durationMs);
  let start = Math.round(params.timelineStartMs);
  if (params.snap) {
    start = snapTimelineMs(start, params.snap, { minMs: 0, maxMs: maxStart });
  } else {
    start = clampInteger(start, 0, maxStart);
  }
  const next: StudioClipGeometry = {
    timelineStartMs: start,
    durationMs: clip.durationMs,
    sourceOffsetMs: clip.sourceOffsetMs,
  };
  return clipGeometryEqual(clip, next) ? null : next;
}

/** Expected split geometry (mirrors splitClipGeometry contract). */
export function previewSplitAtPlayhead(params: {
  clip: StudioClipGeometry;
  playheadMs: number;
  timelineLengthMs: number;
}): { left: StudioClipGeometry; right: StudioClipGeometry } | null {
  const { clip, playheadMs, timelineLengthMs } = params;
  assertIntegerMs(playheadMs, "playheadMs");
  const end = clipEndMs(clip);
  if (playheadMs <= clip.timelineStartMs || playheadMs >= end) return null;
  const leftDuration = playheadMs - clip.timelineStartMs;
  const rightDuration = end - playheadMs;
  if (
    leftDuration < STUDIO_CLIP_MIN_DURATION_MS ||
    rightDuration < STUDIO_CLIP_MIN_DURATION_MS
  ) {
    return null;
  }
  const left: StudioClipGeometry = {
    timelineStartMs: clip.timelineStartMs,
    durationMs: leftDuration,
    sourceOffsetMs: clip.sourceOffsetMs,
  };
  const right: StudioClipGeometry = {
    timelineStartMs: playheadMs,
    durationMs: rightDuration,
    sourceOffsetMs: clip.sourceOffsetMs + leftDuration,
  };
  try {
    assertClipPlacement({ ...left, timelineLengthMs });
    assertClipPlacement({ ...right, timelineLengthMs });
  } catch {
    return null;
  }
  return { left, right };
}

export function formatClipEditDeltaMs(deltaMs: number): string {
  assertIntegerMs(deltaMs, "deltaMs");
  const sign = deltaMs > 0 ? "+" : deltaMs < 0 ? "−" : "±";
  const abs = Math.abs(deltaMs);
  if (abs >= 1000 && abs % 1000 === 0) {
    return `${sign}${(abs / 1000).toFixed(0)}.000 s`;
  }
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(3)} s`;
  }
  return `${sign}${abs} ms`;
}
