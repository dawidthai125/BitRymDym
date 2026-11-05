/**
 * Live recording coach. Pure: the record panel feeds mic peaks and the
 * playhead, and BITEK speaks only when this returns `speak` or `clear`.
 * Hot (clipping) beats timing, timing beats an uneven level, uneven beats quiet.
 */

export type LiveCoachCue = "hot" | "quiet" | "uneven" | "offbeat";

export type LiveCoachSample = {
  atMs: number;
  peakDb: number;
  /** Timeline position while the beat is running. Null when there is no clock. */
  playheadMs: number | null;
};

export type LiveCoachDecision = {
  cue: LiveCoachCue | null;
  /** The window is long enough to judge. Short windows never clear a previous cue. */
  ready: boolean;
  speak: boolean;
  clear: boolean;
};

const WINDOW_MS = 4_000;
const MIN_SPAN_MS = 1_600;
const MIN_SAMPLES = 8;
const CHANGE_GAP_MS = 1_600;
const REPEAT_MS = 9_000;
const HOT_DB = -1;
const QUIET_DB = -22;
const SILENCE_DB = -42;
const UNEVEN_DB = 14;
const OFFBEAT_RATIO = 0.22;

const IDLE: LiveCoachDecision = { cue: null, ready: false, speak: false, clear: false };

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return -100;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index] ?? -100;
}

function nearestBeatDistance(playheadMs: number, beatMs: number): number {
  const mod = ((playheadMs % beatMs) + beatMs) % beatMs;
  return Math.min(mod, beatMs - mod);
}

function unevenLevel(samples: LiveCoachSample[]): boolean {
  const start = samples[0]?.atMs ?? 0;
  const buckets = new Map<number, number>();
  for (const sample of samples) {
    const key = Math.floor((sample.atMs - start) / 400);
    buckets.set(key, Math.max(buckets.get(key) ?? -100, sample.peakDb));
  }
  const voiced = [...buckets.values()].filter((peak) => peak > -35);
  if (voiced.length < 3) return false;
  return Math.max(...voiced) - Math.min(...voiced) >= UNEVEN_DB;
}

function missingBeat(samples: LiveCoachSample[], bpm: number): boolean {
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) return false;
  const timed = samples.filter((sample) => sample.playheadMs != null && Number.isFinite(sample.playheadMs));
  if (timed.length < MIN_SAMPLES) return false;
  const heads = timed.map((sample) => sample.playheadMs ?? 0);
  if (Math.max(...heads) - Math.min(...heads) < 700) return false;
  const beatMs = 60_000 / bpm;
  const onsets: number[] = [];
  for (let i = 1; i < timed.length; i += 1) {
    const prev = timed[i - 1];
    const cur = timed[i];
    if (!prev || !cur || cur.playheadMs == null) continue;
    if (cur.peakDb > -30 && cur.peakDb - prev.peakDb >= 8) onsets.push(cur.playheadMs);
  }
  if (onsets.length < 4) return false;
  const distances = onsets.map((playhead) => nearestBeatDistance(playhead, beatMs)).sort((a, b) => a - b);
  const mid = distances[Math.floor(distances.length / 2)] ?? 0;
  return mid > beatMs * OFFBEAT_RATIO;
}

export function decideLiveTakeCoach(input: {
  samples: readonly LiveCoachSample[];
  nowMs: number;
  bpm: number;
  lastCue: LiveCoachCue | null;
  lastCueAtMs: number | null;
}): LiveCoachDecision {
  const window = input.samples.filter(
    (sample) => input.nowMs - sample.atMs <= WINDOW_MS && Number.isFinite(sample.peakDb),
  );
  if (window.length < MIN_SAMPLES) return IDLE;
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last || last.atMs - first.atMs < MIN_SPAN_MS) return IDLE;

  const peaks = window.map((sample) => sample.peakDb).sort((a, b) => a - b);
  const max = peaks[peaks.length - 1] ?? -100;
  const p90 = percentile(peaks, 0.9);
  const hotCount = window.filter((sample) => sample.peakDb >= -3).length;

  let cue: LiveCoachCue | null = null;
  if (max >= HOT_DB || hotCount / window.length > 0.2) cue = "hot";
  else if (p90 < SILENCE_DB) cue = null;
  else if (missingBeat(window, input.bpm)) cue = "offbeat";
  else if (unevenLevel(window)) cue = "uneven";
  else if (p90 < QUIET_DB) cue = "quiet";

  if (!cue) return { cue: null, ready: true, speak: false, clear: input.lastCue !== null };

  const changed = cue !== input.lastCue;
  const since = input.lastCueAtMs == null ? Number.POSITIVE_INFINITY : input.nowMs - input.lastCueAtMs;
  const hotInterrupt = cue === "hot" && input.lastCue !== "hot";
  const speak = hotInterrupt || since >= (changed ? CHANGE_GAP_MS : REPEAT_MS);
  return { cue, ready: true, speak, clear: false };
}
