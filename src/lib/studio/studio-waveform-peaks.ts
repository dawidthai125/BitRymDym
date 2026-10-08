/**
 * Phase 3 / 3.1 — Precision bipolar peaks for StudioClipWaveform.
 * Reuses AudioBuffer channel sampling pattern from peaks-from-buffer
 * (no brand Waveform decorative floor). Decode uses OfflineAudioContext only.
 *
 * Model: DECODE ONCE → CACHE (high-res peaks) → ZOOM aggregates for CSS width.
 * Zoom never re-decodes.
 */

/**
 * Base peak density: 1000 peaks/s = 1 peak / ms.
 * Matches Studio max zoom (1.0 px/ms) so high zoom can show ~1 ms detail
 * without inventing a second time model or per-pixel decode.
 */
export const STUDIO_WAVEFORM_PEAKS_PER_SECOND = 1000;

/**
 * Soft cap for extremely long sources (~10 min @ 1000 pps).
 * Longer Takes keep one decode but lower effective peaks/s so memory stays bounded.
 */
export const STUDIO_WAVEFORM_MAX_PEAKS_PER_SOURCE = 600_000;

export type StudioWaveformPeak = {
  min: number;
  max: number;
};

export type StudioWaveformPeaksPayload = {
  peaks: StudioWaveformPeak[];
  durationMs: number;
  sampleRate: number;
  channels: number;
  peaksPerSecond: number;
};

/** ms covered by one peak column at a given peaks/s. */
export function msPerPeak(peaksPerSecond: number): number {
  if (!Number.isFinite(peaksPerSecond) || peaksPerSecond < 1) {
    throw new Error("peaksPerSecond must be >= 1.");
  }
  return 1000 / peaksPerSecond;
}

/** Effective peaks/s for a source duration (applies long-take soft cap). */
export function resolvePeaksPerSecondForDuration(
  durationMs: number,
  targetPeaksPerSecond: number = STUDIO_WAVEFORM_PEAKS_PER_SECOND,
  maxPeaks: number = STUDIO_WAVEFORM_MAX_PEAKS_PER_SOURCE,
): number {
  if (!Number.isFinite(durationMs) || durationMs < 1) {
    return targetPeaksPerSecond;
  }
  const ideal = Math.round((durationMs / 1000) * targetPeaksPerSecond);
  if (ideal <= maxPeaks) return targetPeaksPerSecond;
  return Math.max(1, Math.floor(maxPeaks / (durationMs / 1000)));
}

export function estimateWaveformPeakCount(
  durationMs: number,
  peaksPerSecond: number = STUDIO_WAVEFORM_PEAKS_PER_SECOND,
): number {
  const pps = resolvePeaksPerSecondForDuration(durationMs, peaksPerSecond);
  return Math.max(1, Math.round((durationMs / 1000) * pps));
}

/**
 * Build bipolar peaks from a single channel (same block scan as peaksFromAudioBuffer,
 * but keeps signed min/max without decorative amplitude floor).
 */
export function studioBipolarPeaksFromChannel(
  channel: Float32Array,
  peakCount: number,
): StudioWaveformPeak[] {
  const count = Math.max(1, Math.floor(peakCount));
  const block = Math.max(1, Math.floor(channel.length / count));
  const peaks: StudioWaveformPeak[] = [];

  for (let i = 0; i < count; i += 1) {
    const start = i * block;
    const end = Math.min(channel.length, start + block);
    let min = 0;
    let max = 0;
    for (let j = start; j < end; j += 1) {
      const v = channel[j]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks.push({
      min: Math.max(-1, Math.min(0, min)),
      max: Math.max(0, Math.min(1, max)),
    });
  }
  return peaks;
}

export function studioPeaksFromAudioBuffer(
  buffer: {
    duration: number;
    sampleRate: number;
    numberOfChannels: number;
    getChannelData: (channel: number) => Float32Array;
  },
  peaksPerSecond: number = STUDIO_WAVEFORM_PEAKS_PER_SECOND,
): StudioWaveformPeaksPayload {
  if (!Number.isFinite(peaksPerSecond) || peaksPerSecond < 1) {
    throw new Error("peaksPerSecond must be >= 1.");
  }
  const durationMs = Math.max(1, Math.round(buffer.duration * 1000));
  const effectivePps = resolvePeaksPerSecondForDuration(
    durationMs,
    peaksPerSecond,
  );
  const peakCount = Math.max(
    1,
    Math.round((durationMs / 1000) * effectivePps),
  );
  const channel = buffer.getChannelData(0);
  return {
    peaks: studioBipolarPeaksFromChannel(channel, peakCount),
    durationMs,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    peaksPerSecond: effectivePps,
  };
}

/**
 * Slice full-source peaks to the clip source window (sourceOffset + duration).
 */
export function sliceStudioPeaksForSourceWindow(params: {
  peaks: readonly StudioWaveformPeak[];
  sourceDurationMs: number;
  sourceOffsetMs: number;
  windowDurationMs: number;
}): StudioWaveformPeak[] {
  const { peaks, sourceDurationMs, sourceOffsetMs, windowDurationMs } = params;
  if (peaks.length === 0) return [];
  if (sourceDurationMs < 1 || windowDurationMs < 1) return [];

  const startRatio = Math.min(
    1,
    Math.max(0, sourceOffsetMs / sourceDurationMs),
  );
  const endRatio = Math.min(
    1,
    Math.max(
      startRatio,
      (sourceOffsetMs + windowDurationMs) / sourceDurationMs,
    ),
  );
  const startIdx = Math.floor(startRatio * peaks.length);
  const endIdx = Math.max(
    startIdx + 1,
    Math.ceil(endRatio * peaks.length),
  );
  return peaks.slice(startIdx, Math.min(peaks.length, endIdx));
}

/**
 * Zoom / viewport projection: aggregate (or leave) peaks to CSS pixel columns.
 * Does not decode. One column = min/max over the peaks that fall into that px.
 */
export function aggregateStudioPeaksForCssWidth(
  peaks: readonly StudioWaveformPeak[],
  cssWidthPx: number,
): StudioWaveformPeak[] {
  const cols = Math.max(1, Math.floor(cssWidthPx));
  if (peaks.length === 0) return [];
  if (peaks.length <= cols) {
    // High zoom / dense peaks: keep native columns (renderer may stretch).
    return peaks.slice();
  }
  const peaksPerCol = peaks.length / cols;
  const out: StudioWaveformPeak[] = [];
  for (let x = 0; x < cols; x += 1) {
    const start = Math.floor(x * peaksPerCol);
    const end = Math.min(peaks.length, Math.ceil((x + 1) * peaksPerCol));
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i += 1) {
      const p = peaks[i]!;
      if (p.min < min) min = p.min;
      if (p.max > max) max = p.max;
    }
    out.push({ min, max });
  }
  return out;
}

/**
 * How many peak samples cover one CSS pixel at a given zoom for a clip window.
 * >1 → aggregation; <1 → peaks denser than pixels (good for precision zoom).
 */
export function peaksPerCssPixel(params: {
  windowDurationMs: number;
  peaksPerSecond: number;
  cssWidthPx: number;
}): number {
  const { windowDurationMs, peaksPerSecond, cssWidthPx } = params;
  if (cssWidthPx < 1 || windowDurationMs < 1) return 0;
  const peakCount = Math.max(
    1,
    Math.round((windowDurationMs / 1000) * peaksPerSecond),
  );
  return peakCount / Math.floor(cssWidthPx);
}

type OfflineDecodeContext = {
  decodeAudioData: (data: ArrayBuffer) => Promise<AudioBuffer>;
  close?: () => Promise<void>;
};

/**
 * Decode once via OfflineAudioContext (not StudioAudioEngine AudioContext).
 * Returns AudioBuffer for peaks generation; caller should drop buffer after peaks.
 */
export async function decodeAudioBufferForStudioPeaks(
  bytes: ArrayBuffer,
  OfflineCtor: typeof OfflineAudioContext = OfflineAudioContext,
): Promise<AudioBuffer> {
  // 1-frame offline context is enough to host decodeAudioData.
  const ctx = new OfflineCtor(1, 1, 44_100) as unknown as OfflineDecodeContext;
  try {
    return await ctx.decodeAudioData(bytes.slice(0));
  } finally {
    await ctx.close?.().catch(() => undefined);
  }
}

export async function studioPeaksFromAudioUrl(
  url: string,
  peaksPerSecond: number = STUDIO_WAVEFORM_PEAKS_PER_SECOND,
  fetchImpl: typeof fetch = fetch,
): Promise<StudioWaveformPeaksPayload> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`WAVEFORM_FETCH_FAILED:${res.status}`);
  }
  const bytes = await res.arrayBuffer();
  const buffer = await decodeAudioBufferForStudioPeaks(bytes);
  return studioPeaksFromAudioBuffer(buffer, peaksPerSecond);
}
