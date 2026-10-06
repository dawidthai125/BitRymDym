/**
 * P5.4 — Timeline presentation helpers (zoom / snap / selection / mapping).
 * Persistence SSOT remains integer ms on Clip geometry. Zoom is view-only.
 */

import { assertIntegerMs } from "@/lib/studio/studio-time";

/** Default density when project fits ~a phone-width content lane. */
export const STUDIO_TIMELINE_DEFAULT_PX_PER_MS = 0.01; // 10 px / second
export const STUDIO_TIMELINE_MIN_PX_PER_MS = 0.002;
export const STUDIO_TIMELINE_MAX_PX_PER_MS = 0.25;
export const STUDIO_TIMELINE_ZOOM_STEP = 1.35;
/** Minimum rendered timeline content width (px) before fit. */
export const STUDIO_TIMELINE_MIN_CONTENT_WIDTH_PX = 320;

/** Simple grid interval for P5.4 (extensible toward BPM later). */
export const STUDIO_SNAP_DEFAULT_GRID_MS = 1000;

export type StudioSnapMode = "off" | "grid";

/**
 * Snap config — `grid` uses `gridIntervalMs` today.
 * Optional BPM fields are reserved for a future metronome/grid engine;
 * they are ignored until a BPM-aware mode is added.
 */
export type StudioSnapConfig = {
  mode: StudioSnapMode;
  gridIntervalMs: number;
  /** Reserved for future BPM snap (not used in P5.4). */
  bpm?: number;
  /** Reserved for future bar snap. */
  beatsPerBar?: number;
  /** Reserved for future subdivision snap. */
  subdivision?: number;
};

export function createDefaultSnapConfig(
  overrides?: Partial<StudioSnapConfig>,
): StudioSnapConfig {
  return {
    mode: "off",
    gridIntervalMs: STUDIO_SNAP_DEFAULT_GRID_MS,
    ...overrides,
  };
}

export function clampPxPerMs(pxPerMs: number): number {
  if (!Number.isFinite(pxPerMs) || pxPerMs <= 0) {
    return STUDIO_TIMELINE_DEFAULT_PX_PER_MS;
  }
  return Math.min(
    STUDIO_TIMELINE_MAX_PX_PER_MS,
    Math.max(STUDIO_TIMELINE_MIN_PX_PER_MS, pxPerMs),
  );
}

export function msToPx(ms: number, pxPerMs: number): number {
  assertIntegerMs(ms, "ms");
  return ms * clampPxPerMs(pxPerMs);
}

/** Pixel → integer ms (persistence boundary). */
export function pxToMs(px: number, pxPerMs: number): number {
  const density = clampPxPerMs(pxPerMs);
  if (!Number.isFinite(px)) {
    throw new Error("px must be a finite number.");
  }
  return Math.round(px / density);
}

export function contentWidthPx(
  timelineLengthMs: number,
  pxPerMs: number,
): number {
  assertIntegerMs(timelineLengthMs, "timelineLengthMs");
  return Math.max(
    STUDIO_TIMELINE_MIN_CONTENT_WIDTH_PX,
    msToPx(timelineLengthMs, pxPerMs),
  );
}

export function zoomInPxPerMs(pxPerMs: number): number {
  return clampPxPerMs(clampPxPerMs(pxPerMs) * STUDIO_TIMELINE_ZOOM_STEP);
}

export function zoomOutPxPerMs(pxPerMs: number): number {
  return clampPxPerMs(clampPxPerMs(pxPerMs) / STUDIO_TIMELINE_ZOOM_STEP);
}

/** Fit project length into viewport width (with a small padding). */
export function fitPxPerMs(
  timelineLengthMs: number,
  viewportWidthPx: number,
): number {
  assertIntegerMs(timelineLengthMs, "timelineLengthMs");
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx < 1) {
    return STUDIO_TIMELINE_DEFAULT_PX_PER_MS;
  }
  const usable = Math.max(STUDIO_TIMELINE_MIN_CONTENT_WIDTH_PX, viewportWidthPx - 24);
  return clampPxPerMs(usable / timelineLengthMs);
}

/**
 * Snap requested timeline position to integer ms.
 * OFF → round to integer only; ON → nearest gridIntervalMs within bounds.
 */
export function snapTimelineMs(
  requestedMs: number,
  config: StudioSnapConfig,
  bounds?: { minMs?: number; maxMs?: number },
): number {
  if (!Number.isFinite(requestedMs)) {
    throw new Error("requestedMs must be finite.");
  }
  let next = Math.round(requestedMs);

  if (config.mode === "grid") {
    assertIntegerMs(config.gridIntervalMs, "gridIntervalMs");
    if (config.gridIntervalMs < 1) {
      throw new Error("gridIntervalMs must be >= 1.");
    }
    next =
      Math.round(requestedMs / config.gridIntervalMs) * config.gridIntervalMs;
  }

  const min = bounds?.minMs ?? Number.NEGATIVE_INFINITY;
  const max = bounds?.maxMs ?? Number.POSITIVE_INFINITY;
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  return Math.round(next);
}

export function selectClipId(
  _current: string | null,
  clipId: string,
): string {
  if (!clipId) {
    throw new Error("clipId is required.");
  }
  return clipId;
}

export function clearClipSelection(): null {
  return null;
}

export function resolveSelectedClipId(
  selectedClipId: string | null,
  availableClipIds: readonly string[],
): string | null {
  if (selectedClipId == null) return null;
  return availableClipIds.includes(selectedClipId) ? selectedClipId : null;
}

export type StudioRulerTick = {
  ms: number;
  major: boolean;
};

/**
 * Build ruler ticks targeting ~`targetTickPx` spacing.
 * Major ticks every 5 minor steps (or at 0 / end).
 */
export function buildTimelineRulerTicks(params: {
  timelineLengthMs: number;
  pxPerMs: number;
  targetTickPx?: number;
}): StudioRulerTick[] {
  const { timelineLengthMs } = params;
  assertIntegerMs(timelineLengthMs, "timelineLengthMs");
  const density = clampPxPerMs(params.pxPerMs);
  const targetPx = params.targetTickPx ?? 72;
  const rawStepMs = targetPx / density;

  const niceSteps = [
    100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000,
  ];
  let stepMs = niceSteps[niceSteps.length - 1]!;
  for (const candidate of niceSteps) {
    if (candidate >= rawStepMs) {
      stepMs = candidate;
      break;
    }
  }

  const ticks: StudioRulerTick[] = [];
  for (let ms = 0; ms <= timelineLengthMs; ms += stepMs) {
    const major = ms === 0 || ms % (stepMs * 5) === 0 || ms === timelineLengthMs;
    ticks.push({ ms, major });
  }
  if (ticks[ticks.length - 1]?.ms !== timelineLengthMs) {
    ticks.push({ ms: timelineLengthMs, major: true });
  }
  return ticks;
}
