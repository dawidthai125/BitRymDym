/**
 * Pure Clip helpers — source XOR, placement, MOVE / TRIM / SPLIT (P5.3).
 * Source Take / Beat / Artifact objects are never mutated here.
 */

import { STUDIO_CLIP_MIN_DURATION_MS } from "@/config/studio";
import type { StudioClipSourceKind } from "@/config/studio";
import { assertIntegerMs, clipEndMs } from "@/lib/studio/studio-time";

export type StudioClipSourceInput = {
  sourceKind: StudioClipSourceKind;
  sourceTakeId?: string | null;
  sourceBeatId?: string | null;
  sourceArtifactId?: string | null;
};

export type StudioClipGeometry = {
  timelineStartMs: number;
  durationMs: number;
  sourceOffsetMs: number;
};

export function assertValidClipSource(input: StudioClipSourceInput): void {
  const take = input.sourceTakeId ?? null;
  const beat = input.sourceBeatId ?? null;
  const artifact = input.sourceArtifactId ?? null;

  if (input.sourceKind === "TAKE") {
    if (!take || beat || artifact) {
      throw new Error("TAKE clip requires sourceTakeId only.");
    }
    return;
  }
  if (input.sourceKind === "BEAT_REF") {
    if (!beat || take || artifact) {
      throw new Error("BEAT_REF clip requires sourceBeatId only.");
    }
    return;
  }
  if (input.sourceKind === "ARTIFACT") {
    if (!artifact || take || beat) {
      throw new Error("ARTIFACT clip requires sourceArtifactId only.");
    }
    return;
  }
  throw new Error("Unknown clip sourceKind.");
}

export function assertClipPlacement(params: {
  timelineStartMs: number;
  durationMs: number;
  sourceOffsetMs: number;
  timelineLengthMs: number;
}): void {
  assertIntegerMs(params.timelineStartMs, "timelineStartMs");
  assertIntegerMs(params.durationMs, "durationMs");
  assertIntegerMs(params.sourceOffsetMs, "sourceOffsetMs");
  assertIntegerMs(params.timelineLengthMs, "timelineLengthMs");
  if (params.timelineStartMs < 0) {
    throw new Error("timelineStartMs must be >= 0.");
  }
  if (params.durationMs < STUDIO_CLIP_MIN_DURATION_MS) {
    throw new Error(
      `durationMs must be >= ${STUDIO_CLIP_MIN_DURATION_MS}.`,
    );
  }
  if (params.sourceOffsetMs < 0) {
    throw new Error("sourceOffsetMs must be >= 0.");
  }
  const end = clipEndMs({
    timelineStartMs: params.timelineStartMs,
    durationMs: params.durationMs,
  });
  if (end > params.timelineLengthMs) {
    throw new Error("Clip exceeds project timeline length.");
  }
}

/** MOVE — shift Clip on timeline; duration + source offset unchanged. */
export function moveClipGeometry(params: {
  clip: StudioClipGeometry;
  timelineStartMs: number;
  timelineLengthMs: number;
}): StudioClipGeometry {
  assertIntegerMs(params.timelineStartMs, "timelineStartMs");
  const next: StudioClipGeometry = {
    timelineStartMs: params.timelineStartMs,
    durationMs: params.clip.durationMs,
    sourceOffsetMs: params.clip.sourceOffsetMs,
  };
  assertClipPlacement({ ...next, timelineLengthMs: params.timelineLengthMs });
  return next;
}

/**
 * TRIM left edge inward by `trimMs` (or to absolute left edge via delta).
 * Increases sourceOffset, shortens duration, advances timeline start.
 */
export function trimClipLeft(params: {
  clip: StudioClipGeometry;
  trimMs: number;
  timelineLengthMs: number;
}): StudioClipGeometry {
  assertIntegerMs(params.trimMs, "trimMs");
  if (params.trimMs < 1) {
    throw new Error("trimMs must be >= 1.");
  }
  if (params.clip.durationMs - params.trimMs < STUDIO_CLIP_MIN_DURATION_MS) {
    throw new Error("Przycięcie pozostawiłoby zbyt krótki klip.");
  }
  const next: StudioClipGeometry = {
    timelineStartMs: params.clip.timelineStartMs + params.trimMs,
    durationMs: params.clip.durationMs - params.trimMs,
    sourceOffsetMs: params.clip.sourceOffsetMs + params.trimMs,
  };
  assertClipPlacement({ ...next, timelineLengthMs: params.timelineLengthMs });
  return next;
}

/** TRIM right edge inward by `trimMs`. */
export function trimClipRight(params: {
  clip: StudioClipGeometry;
  trimMs: number;
  timelineLengthMs: number;
}): StudioClipGeometry {
  assertIntegerMs(params.trimMs, "trimMs");
  if (params.trimMs < 1) {
    throw new Error("trimMs must be >= 1.");
  }
  if (params.clip.durationMs - params.trimMs < STUDIO_CLIP_MIN_DURATION_MS) {
    throw new Error("Przycięcie pozostawiłoby zbyt krótki klip.");
  }
  const next: StudioClipGeometry = {
    timelineStartMs: params.clip.timelineStartMs,
    durationMs: params.clip.durationMs - params.trimMs,
    sourceOffsetMs: params.clip.sourceOffsetMs,
  };
  assertClipPlacement({ ...next, timelineLengthMs: params.timelineLengthMs });
  return next;
}

/**
 * TRIM left edge to absolute playhead (must be strictly inside clip).
 */
export function trimClipLeftToPlayhead(params: {
  clip: StudioClipGeometry;
  playheadMs: number;
  timelineLengthMs: number;
}): StudioClipGeometry {
  assertIntegerMs(params.playheadMs, "playheadMs");
  const end = clipEndMs(params.clip);
  if (
    params.playheadMs <= params.clip.timelineStartMs ||
    params.playheadMs >= end
  ) {
    throw new Error("Playhead musi być wewnątrz klipu, aby przyciąć początek.");
  }
  return trimClipLeft({
    clip: params.clip,
    trimMs: params.playheadMs - params.clip.timelineStartMs,
    timelineLengthMs: params.timelineLengthMs,
  });
}

/**
 * TRIM right edge to absolute playhead (must be strictly inside clip).
 */
export function trimClipRightToPlayhead(params: {
  clip: StudioClipGeometry;
  playheadMs: number;
  timelineLengthMs: number;
}): StudioClipGeometry {
  assertIntegerMs(params.playheadMs, "playheadMs");
  const end = clipEndMs(params.clip);
  if (
    params.playheadMs <= params.clip.timelineStartMs ||
    params.playheadMs >= end
  ) {
    throw new Error("Playhead musi być wewnątrz klipu, aby przyciąć koniec.");
  }
  return trimClipRight({
    clip: params.clip,
    trimMs: end - params.playheadMs,
    timelineLengthMs: params.timelineLengthMs,
  });
}

export type SplitClipResult = {
  left: StudioClipGeometry;
  right: StudioClipGeometry;
};

/**
 * SPLIT at absolute timeline position. Same source; right inherits offset.
 * Rejects start/end/outside/zero-length results.
 */
export function splitClipGeometry(params: {
  clip: StudioClipGeometry;
  atTimelineMs: number;
  timelineLengthMs: number;
}): SplitClipResult {
  assertIntegerMs(params.atTimelineMs, "atTimelineMs");
  const end = clipEndMs(params.clip);
  if (
    params.atTimelineMs <= params.clip.timelineStartMs ||
    params.atTimelineMs >= end
  ) {
    throw new Error("Punkt podziału musi być ściśle wewnątrz klipu.");
  }
  const leftDuration = params.atTimelineMs - params.clip.timelineStartMs;
  const rightDuration = end - params.atTimelineMs;
  if (
    leftDuration < STUDIO_CLIP_MIN_DURATION_MS ||
    rightDuration < STUDIO_CLIP_MIN_DURATION_MS
  ) {
    throw new Error("Podział utworzyłby zbyt krótki klip.");
  }
  const left: StudioClipGeometry = {
    timelineStartMs: params.clip.timelineStartMs,
    durationMs: leftDuration,
    sourceOffsetMs: params.clip.sourceOffsetMs,
  };
  const right: StudioClipGeometry = {
    timelineStartMs: params.atTimelineMs,
    durationMs: rightDuration,
    sourceOffsetMs: params.clip.sourceOffsetMs + leftDuration,
  };
  assertClipPlacement({ ...left, timelineLengthMs: params.timelineLengthMs });
  assertClipPlacement({ ...right, timelineLengthMs: params.timelineLengthMs });
  return { left, right };
}
