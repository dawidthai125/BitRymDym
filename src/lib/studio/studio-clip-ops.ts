/**
 * Pure Clip / source XOR helpers for P5.1.
 */

import type { StudioClipSourceKind } from "@/config/studio";
import { assertIntegerMs, clipEndMs } from "@/lib/studio/studio-time";

export type StudioClipSourceInput = {
  sourceKind: StudioClipSourceKind;
  sourceTakeId?: string | null;
  sourceBeatId?: string | null;
  sourceArtifactId?: string | null;
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
  if (params.durationMs < 1) {
    throw new Error("durationMs must be >= 1.");
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
