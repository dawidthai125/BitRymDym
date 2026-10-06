/**
 * P6.5 — Master meter pure helpers (sample peak + clip latch).
 * Runtime-only; never persisted.
 */

export const STUDIO_METER_FFT_SIZE = 256;
/** UI emit rate — within Design Freeze 10–15 Hz. */
export const STUDIO_METER_HZ = 12;
export const STUDIO_METER_INTERVAL_MS = 1000 / STUDIO_METER_HZ;
export const STUDIO_METER_CLIP_LATCH_MS = 1500;
/** Peak floor for dBFS display (avoid -Infinity). */
export const STUDIO_METER_DB_FLOOR = -100;

export type StudioMeterSnapshot = {
  /** Linear sample peak 0…1 */
  peak: number;
  /** Latched sample-peak clipping indication */
  clipping: boolean;
  /** Host clock ms when snapshot was produced */
  timestamp: number;
};

export const STUDIO_METER_NEUTRAL: StudioMeterSnapshot = {
  peak: 0,
  clipping: false,
  timestamp: 0,
};

export function samplePeakFromTimeDomain(buffer: ArrayLike<number>): number {
  let peak = 0;
  const n = buffer.length;
  for (let i = 0; i < n; i += 1) {
    const v = Math.abs(buffer[i]!);
    if (v > peak) peak = v;
  }
  if (peak > 1) return 1;
  return peak;
}

export function peakToDbFs(peak: number): string {
  if (!(peak > 0) || peak <= 1e-5) {
    return `${STUDIO_METER_DB_FLOOR.toFixed(0)} dB`;
  }
  const db = 20 * Math.log10(peak);
  const clamped = Math.max(STUDIO_METER_DB_FLOOR, db);
  return `${clamped.toFixed(1)} dB`;
}

export type StudioClipLatchState = {
  clippingUntilMs: number;
};

export function createClipLatchState(): StudioClipLatchState {
  return { clippingUntilMs: 0 };
}

/**
 * Sample-peak clip detection + latch.
 * peak >= 1.0 extends latch by STUDIO_METER_CLIP_LATCH_MS from now.
 */
export function updateClipLatch(
  state: StudioClipLatchState,
  peak: number,
  nowMs: number,
): boolean {
  if (peak >= 1) {
    state.clippingUntilMs = nowMs + STUDIO_METER_CLIP_LATCH_MS;
  }
  return nowMs < state.clippingUntilMs;
}

export function clearClipLatch(state: StudioClipLatchState): void {
  state.clippingUntilMs = 0;
}

export function buildMeterSnapshot(params: {
  peak: number;
  clipping: boolean;
  timestamp: number;
}): StudioMeterSnapshot {
  const peak =
    Number.isFinite(params.peak) && params.peak > 0
      ? Math.min(1, params.peak)
      : 0;
  return {
    peak,
    clipping: params.clipping,
    timestamp: params.timestamp,
  };
}
