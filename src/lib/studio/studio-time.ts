/**
 * P5 timeline time helpers — persisted SSOT is integer milliseconds.
 */

export function assertIntegerMs(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value)) {
    throw new Error(`${label} must be an integer number of milliseconds.`);
  }
}

export function clampPlayheadMs(playheadMs: number, timelineLengthMs: number): number {
  assertIntegerMs(playheadMs, "playheadMs");
  assertIntegerMs(timelineLengthMs, "timelineLengthMs");
  if (timelineLengthMs < 1) {
    throw new Error("timelineLengthMs must be >= 1.");
  }
  if (playheadMs < 0) return 0;
  if (playheadMs > timelineLengthMs) return timelineLengthMs;
  return playheadMs;
}

export function clipEndMs(params: {
  timelineStartMs: number;
  durationMs: number;
}): number {
  assertIntegerMs(params.timelineStartMs, "timelineStartMs");
  assertIntegerMs(params.durationMs, "durationMs");
  if (params.durationMs < 1) {
    throw new Error("durationMs must be >= 1.");
  }
  return params.timelineStartMs + params.durationMs;
}

/** Format project time for Polish UI: mm:ss.mmm */
export function formatStudioTimeMs(ms: number): string {
  assertIntegerMs(ms, "ms");
  const clamped = Math.max(0, ms);
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
