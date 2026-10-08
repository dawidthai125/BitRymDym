/**
 * P5.4 / Phase 2 — Timeline presentation helpers (zoom / snap / selection / mapping).
 * Persistence SSOT remains integer ms on Clip geometry. Zoom is view-only.
 */

import { assertIntegerMs } from "@/lib/studio/studio-time";

/** Default density when project fits ~a phone-width content lane. */
export const STUDIO_TIMELINE_DEFAULT_PX_PER_MS = 0.01; // 10 px / second
export const STUDIO_TIMELINE_MIN_PX_PER_MS = 0.002;
/** Phase 2 precision ceiling — ≥ 1.0 px/ms (1 px ≈ 1 ms). */
export const STUDIO_TIMELINE_MAX_PX_PER_MS = 1;
export const STUDIO_TIMELINE_ZOOM_STEP = 1.35;
/** Minimum rendered timeline content width (px) before fit. */
export const STUDIO_TIMELINE_MIN_CONTENT_WIDTH_PX = 320;

/** Simple grid interval for P5.4 (extensible toward BPM later). */
export const STUDIO_SNAP_DEFAULT_GRID_MS = 1000;

/** Phase 2 snap grid presets (integer ms). */
export const STUDIO_SNAP_INTERVALS_MS = [20, 100, 1000] as const;
export type StudioSnapIntervalMs = (typeof STUDIO_SNAP_INTERVALS_MS)[number];

export type StudioSnapPreset = "off" | "20" | "100" | "1000";

export const STUDIO_SNAP_PRESET_ORDER: readonly StudioSnapPreset[] = [
  "off",
  "20",
  "100",
  "1000",
] as const;

/** Keyboard nudge deltas (integer ms). */
export const STUDIO_NUDGE_FINE_MS = 1;
export const STUDIO_NUDGE_MEDIUM_MS = 10;
export const STUDIO_NUDGE_COARSE_MS = 20;

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

export function snapConfigFromPreset(
  preset: StudioSnapPreset,
): StudioSnapConfig {
  switch (preset) {
    case "off":
      return createDefaultSnapConfig({ mode: "off" });
    case "20":
      return createDefaultSnapConfig({ mode: "grid", gridIntervalMs: 20 });
    case "100":
      return createDefaultSnapConfig({ mode: "grid", gridIntervalMs: 100 });
    case "1000":
      return createDefaultSnapConfig({ mode: "grid", gridIntervalMs: 1000 });
  }
}

export function snapPresetFromConfig(
  config: StudioSnapConfig,
): StudioSnapPreset {
  if (config.mode === "off") return "off";
  if (config.gridIntervalMs === 20) return "20";
  if (config.gridIntervalMs === 100) return "100";
  if (config.gridIntervalMs === 1000) return "1000";
  return "off";
}

export function cycleStudioSnapConfig(
  config: StudioSnapConfig,
): StudioSnapConfig {
  const current = snapPresetFromConfig(config);
  const idx = STUDIO_SNAP_PRESET_ORDER.indexOf(current);
  const next =
    STUDIO_SNAP_PRESET_ORDER[(idx + 1) % STUDIO_SNAP_PRESET_ORDER.length] ??
    "off";
  return snapConfigFromPreset(next);
}

export function studioSnapPresetLabel(preset: StudioSnapPreset): string {
  switch (preset) {
    case "off":
      return "OFF";
    case "20":
      return "20 ms";
    case "100":
      return "100 ms";
    case "1000":
      return "1 s";
  }
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

/**
 * Zoom while keeping `anchorMs` under the same viewport X offset.
 * Returns clamped density + scrollLeft so the cursor/time point stays put.
 */
export function zoomAroundAnchorMs(params: {
  currentPxPerMs: number;
  nextPxPerMs: number;
  anchorMs: number;
  viewportOffsetPx: number;
}): { pxPerMs: number; scrollLeft: number; anchorMs: number } {
  // currentPxPerMs validated for callers that mirror density before/after.
  clampPxPerMs(params.currentPxPerMs);
  const next = clampPxPerMs(params.nextPxPerMs);
  const anchorMs = Math.round(params.anchorMs);
  assertIntegerMs(anchorMs, "anchorMs");
  if (!Number.isFinite(params.viewportOffsetPx)) {
    throw new Error("viewportOffsetPx must be finite.");
  }
  const contentX = msToPx(anchorMs, next);
  const scrollLeft = Math.max(0, contentX - params.viewportOffsetPx);
  return { pxPerMs: next, scrollLeft, anchorMs };
}

/** Resolve timeline ms under a viewport X given current scroll + density. */
export function timelineMsAtViewportX(params: {
  scrollLeft: number;
  viewportOffsetPx: number;
  pxPerMs: number;
}): number {
  if (!Number.isFinite(params.scrollLeft) || !Number.isFinite(params.viewportOffsetPx)) {
    throw new Error("scroll/viewport offsets must be finite.");
  }
  return pxToMs(params.scrollLeft + params.viewportOffsetPx, params.pxPerMs);
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

/**
 * Resolve nudge delta from modifier keys.
 * Alt/Option → ±20 · Shift → ±10 · plain → ±1 (sign applied by caller).
 */
export function resolveNudgeStepMs(modifiers: {
  shiftKey: boolean;
  altKey: boolean;
}): number {
  if (modifiers.altKey) return STUDIO_NUDGE_COARSE_MS;
  if (modifiers.shiftKey) return STUDIO_NUDGE_MEDIUM_MS;
  return STUDIO_NUDGE_FINE_MS;
}

/**
 * Compute next clip timelineStartMs after a keyboard nudge.
 * Integer ms only; does NOT apply snap (precision micro-timing).
 */
export function nudgeClipTimelineStartMs(params: {
  timelineStartMs: number;
  durationMs: number;
  timelineLengthMs: number;
  deltaMs: number;
}): number {
  assertIntegerMs(params.timelineStartMs, "timelineStartMs");
  assertIntegerMs(params.durationMs, "durationMs");
  assertIntegerMs(params.timelineLengthMs, "timelineLengthMs");
  assertIntegerMs(params.deltaMs, "deltaMs");
  const maxStart = Math.max(0, params.timelineLengthMs - params.durationMs);
  return Math.min(
    maxStart,
    Math.max(0, params.timelineStartMs + params.deltaMs),
  );
}

/**
 * Phase 3 prep — edge geometry already available for trim handles.
 * No model change: left/right edges + sourceOffset + duration.
 */
export function clipEdgeGeometryMs(clip: {
  timelineStartMs: number;
  durationMs: number;
  sourceOffsetMs: number;
}): {
  leftMs: number;
  rightMs: number;
  sourceOffsetMs: number;
  durationMs: number;
} {
  assertIntegerMs(clip.timelineStartMs, "timelineStartMs");
  assertIntegerMs(clip.durationMs, "durationMs");
  assertIntegerMs(clip.sourceOffsetMs, "sourceOffsetMs");
  return {
    leftMs: clip.timelineStartMs,
    rightMs: clip.timelineStartMs + clip.durationMs,
    sourceOffsetMs: clip.sourceOffsetMs,
    durationMs: clip.durationMs,
  };
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
 * Phase 2: includes sub-100 ms steps for high zoom (≥ 1 px/ms).
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
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000,
    60_000, 120_000,
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
