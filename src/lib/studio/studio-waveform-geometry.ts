/**
 * Phase 3 — Waveform geometry helpers (pure).
 * Clip integer-ms fields remain SSOT; waveform only visualizes them.
 */

import { assertIntegerMs } from "@/lib/studio/studio-time";
import type { StudioClipDto } from "@/lib/studio/studio-types";

export type StudioWaveformSourceKind = "TAKE" | "BEAT_REF" | "ARTIFACT";

export type StudioWaveformSourceRef = {
  kind: StudioWaveformSourceKind;
  id: string;
};

export type StudioWaveformSourceWindow = {
  sourceStartMs: number;
  sourceEndMs: number;
  durationMs: number;
};

export type StudioWaveformTimelineWindow = {
  timelineStartMs: number;
  timelineEndMs: number;
  durationMs: number;
};

/** Deterministic cache / decode identity — never keyed by clipId alone. */
export function studioWaveformSourceKey(
  clip: Pick<
    StudioClipDto,
    "sourceKind" | "sourceTakeId" | "sourceBeatId" | "sourceArtifactId"
  >,
): string | null {
  if (clip.sourceKind === "TAKE" && clip.sourceTakeId) {
    return `take:${clip.sourceTakeId}`;
  }
  if (clip.sourceKind === "BEAT_REF" && clip.sourceBeatId) {
    return `beat:${clip.sourceBeatId}`;
  }
  if (clip.sourceKind === "ARTIFACT" && clip.sourceArtifactId) {
    return `artifact:${clip.sourceArtifactId}`;
  }
  return null;
}

export function studioWaveformSourceRef(
  clip: Pick<
    StudioClipDto,
    "sourceKind" | "sourceTakeId" | "sourceBeatId" | "sourceArtifactId"
  >,
): StudioWaveformSourceRef | null {
  if (clip.sourceKind === "TAKE" && clip.sourceTakeId) {
    return { kind: "TAKE", id: clip.sourceTakeId };
  }
  if (clip.sourceKind === "BEAT_REF" && clip.sourceBeatId) {
    return { kind: "BEAT_REF", id: clip.sourceBeatId };
  }
  if (clip.sourceKind === "ARTIFACT" && clip.sourceArtifactId) {
    return { kind: "ARTIFACT", id: clip.sourceArtifactId };
  }
  return null;
}

/**
 * Source window visualized by the waveform (Take/Beat sample range).
 * Example: offset 5000 + duration 2000 → 5000..7000.
 */
export function resolveWaveformSourceWindow(
  clip: Pick<StudioClipDto, "sourceOffsetMs" | "durationMs">,
): StudioWaveformSourceWindow {
  assertIntegerMs(clip.sourceOffsetMs, "sourceOffsetMs");
  assertIntegerMs(clip.durationMs, "durationMs");
  if (clip.sourceOffsetMs < 0) {
    throw new Error("sourceOffsetMs must be >= 0.");
  }
  if (clip.durationMs < 1) {
    throw new Error("durationMs must be >= 1.");
  }
  return {
    sourceStartMs: clip.sourceOffsetMs,
    sourceEndMs: clip.sourceOffsetMs + clip.durationMs,
    durationMs: clip.durationMs,
  };
}

export function resolveWaveformTimelineWindow(
  clip: Pick<StudioClipDto, "timelineStartMs" | "durationMs">,
): StudioWaveformTimelineWindow {
  assertIntegerMs(clip.timelineStartMs, "timelineStartMs");
  assertIntegerMs(clip.durationMs, "durationMs");
  if (clip.durationMs < 1) {
    throw new Error("durationMs must be >= 1.");
  }
  return {
    timelineStartMs: clip.timelineStartMs,
    timelineEndMs: clip.timelineStartMs + clip.durationMs,
    durationMs: clip.durationMs,
  };
}

/** Map local X within a clip (0…widthPx) → integer timeline ms. */
export function timelineMsFromClipLocalX(params: {
  timelineStartMs: number;
  durationMs: number;
  localXPx: number;
  widthPx: number;
}): number {
  assertIntegerMs(params.timelineStartMs, "timelineStartMs");
  assertIntegerMs(params.durationMs, "durationMs");
  if (!Number.isFinite(params.localXPx) || !Number.isFinite(params.widthPx)) {
    throw new Error("localXPx/widthPx must be finite.");
  }
  if (params.widthPx <= 0) {
    return params.timelineStartMs;
  }
  const ratio = Math.min(1, Math.max(0, params.localXPx / params.widthPx));
  const localMs = Math.round(ratio * params.durationMs);
  const clampedLocal = Math.min(params.durationMs, Math.max(0, localMs));
  return params.timelineStartMs + clampedLocal;
}

/** Edge hit zones for Phase 3 trim prep (view-only; no write). */
export function resolveWaveformEdgeHit(params: {
  localXPx: number;
  widthPx: number;
  edgePx?: number;
}): "left" | "right" | "body" {
  if (!Number.isFinite(params.localXPx) || !Number.isFinite(params.widthPx)) {
    return "body";
  }
  const edge = Math.max(4, params.edgePx ?? 6);
  if (params.localXPx <= edge) return "left";
  if (params.localXPx >= params.widthPx - edge) return "right";
  return "body";
}
