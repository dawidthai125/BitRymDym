/**
 * Shared Studio DAW-lite clock math: count-in, punch, loop wrap, metronome clicks.
 * Reuses integer-ms transport SSOT. Does not own AudioContext or Take eligibility.
 */

export const STUDIO_DEFAULT_TEMPO_BPM = 120;
export const STUDIO_COUNT_IN_BARS = [0, 1, 2, 4] as const;

export type StudioCountInBars = (typeof STUDIO_COUNT_IN_BARS)[number];

export function clampStudioTempoBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return STUDIO_DEFAULT_TEMPO_BPM;
  return Math.min(400, Math.max(20, bpm));
}

export function beatDurationMs(
  bpm: number,
  timeSignatureDen = 4,
): number {
  const tempo = clampStudioTempoBpm(bpm);
  const den = timeSignatureDen > 0 ? timeSignatureDen : 4;
  return Math.round((60_000 / tempo) * (4 / den));
}

export function barDurationMs(
  bpm: number,
  timeSignatureNum = 4,
  timeSignatureDen = 4,
): number {
  const beats = timeSignatureNum > 0 ? timeSignatureNum : 4;
  return beatDurationMs(bpm, timeSignatureDen) * beats;
}

export function countInDurationMs(
  bpm: number,
  bars: StudioCountInBars,
  timeSignatureNum = 4,
  timeSignatureDen = 4,
): number {
  if (bars === 0) return 0;
  return barDurationMs(bpm, timeSignatureNum, timeSignatureDen) * bars;
}

export function countInSeekMs(
  punchInMs: number,
  countInMs: number,
): number {
  return Math.max(0, punchInMs - countInMs);
}

export function normalizePunchWindow(input: {
  punchInMs: number;
  punchOutMs: number;
  timelineLengthMs: number;
}): { punchInMs: number; punchOutMs: number } | null {
  const inMs = Math.round(input.punchInMs);
  const outMs = Math.round(input.punchOutMs);
  const len = Math.round(input.timelineLengthMs);
  if (inMs < 0 || outMs <= inMs || outMs > len || inMs >= len) return null;
  return { punchInMs: inMs, punchOutMs: outMs };
}

export function shouldAutoStopPunch(
  playheadMs: number,
  punchOutMs: number | null,
): boolean {
  if (punchOutMs == null) return false;
  return playheadMs >= punchOutMs;
}

export function wrapLoopPlayhead(
  playheadMs: number,
  loopStartMs: number,
  loopEndMs: number,
): number {
  const start = Math.round(loopStartMs);
  const end = Math.round(loopEndMs);
  if (end <= start) return playheadMs;
  if (playheadMs < end) return playheadMs;
  const span = end - start;
  return start + ((playheadMs - start) % span);
}

export function loopRegionOrNull(input: {
  enabled: boolean;
  startMs: number;
  endMs: number;
  timelineLengthMs: number;
}): { startMs: number; endMs: number } | null {
  if (!input.enabled) return null;
  const start = Math.max(0, Math.round(input.startMs));
  const end = Math.min(
    Math.round(input.timelineLengthMs),
    Math.round(input.endMs),
  );
  if (end - start < 50) return null;
  return { startMs: start, endMs: end };
}

/** Beat times in [fromMs, toMs) for metronome scheduling. */
export function clickTimesMs(input: {
  fromMs: number;
  toMs: number;
  bpm: number;
  timeSignatureNum?: number;
  timeSignatureDen?: number;
}): { timeMs: number; accent: boolean }[] {
  const beatMs = beatDurationMs(input.bpm, input.timeSignatureDen ?? 4);
  const beatsPerBar = (input.timeSignatureNum ?? 4) > 0
    ? (input.timeSignatureNum ?? 4)
    : 4;
  if (beatMs < 1 || input.toMs <= input.fromMs) return [];
  const startBeat = Math.ceil(input.fromMs / beatMs);
  const out: { timeMs: number; accent: boolean }[] = [];
  for (let i = startBeat; i * beatMs < input.toMs; i += 1) {
    out.push({
      timeMs: i * beatMs,
      accent: i % beatsPerBar === 0,
    });
  }
  return out;
}

/** Short decaying click — BufferSource, not a second oscillator engine. */
export function renderClickPcm(
  sampleRate: number,
  accent: boolean,
): Float32Array {
  const rate = sampleRate > 0 ? sampleRate : 44_100;
  const n = Math.max(32, Math.floor(rate * 0.012));
  const pcm = new Float32Array(n);
  const freq = accent ? 1250 : 880;
  const amp = accent ? 0.32 : 0.2;
  for (let i = 0; i < n; i += 1) {
    const env = 1 - i / n;
    pcm[i] = Math.sin((2 * Math.PI * freq * i) / rate) * env * amp;
  }
  return pcm;
}

type ClickContext = {
  sampleRate: number;
  currentTime: number;
  destination: unknown;
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): { getChannelData(channel: number): Float32Array };
  createBufferSource?(): {
    buffer: unknown;
    connect(dest: unknown): void;
    start(when?: number): void;
  };
};

export function fireStudioClick(ctx: ClickContext, accent: boolean): boolean {
  if (!ctx.createBufferSource) return false;
  const pcm = renderClickPcm(ctx.sampleRate, accent);
  const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
  buffer.getChannelData(0).set(pcm);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(ctx.currentTime);
  return true;
}

export function findOverlappingTakeClip<
  T extends {
    trackId: string;
    sourceKind: string;
    timelineStartMs: number;
    durationMs: number;
  },
>(
  clips: readonly T[],
  params: { trackId: string; startMs: number; durationMs: number },
): T | undefined {
  const start = params.startMs;
  const end = params.startMs + params.durationMs;
  return clips.find((clip) => {
    if (clip.trackId !== params.trackId || clip.sourceKind !== "TAKE") {
      return false;
    }
    const clipEnd = clip.timelineStartMs + clip.durationMs;
    return clip.timelineStartMs < end && clipEnd > start;
  });
}
