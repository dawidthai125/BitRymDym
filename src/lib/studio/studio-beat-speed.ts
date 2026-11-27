/**
 * "Tempo bitu": the Bit played faster like a tape, so its pitch rises with it. Stored as the
 * clip's existing stretch and pitch pair; this exact pair is rendered as a plain resample.
 */

export const BEAT_SPEED_MAX = 1.25;
/** Stored cents are whole numbers, so the tape pair matches within one cent. */
const CENTS_TOLERANCE = 1;

export type BeatSpeedPlayback = { stretch: number; pitchCents: number };

type SpeedClip = { sourceKind: string; stretchRatio?: number | null; pitchCents?: number | null };

/** The pitch a tape gains when its length is multiplied by `stretch`. */
export function tapeCents(stretch: number): number {
  return Math.round(-1200 * Math.log2(stretch)) || 0;
}

export function isTapePlayback(playback: BeatSpeedPlayback): boolean {
  return playback.stretch > 0 && playback.stretch !== 1 && Math.abs(playback.pitchCents - tapeCents(playback.stretch)) <= CENTS_TOLERANCE;
}

/** What "Tempo bitu" may write on every plan: normal speed, or a tape speed-up to +25%. */
export function isBeatSpeedUp(playback: BeatSpeedPlayback): boolean {
  if (playback.stretch === 1) return playback.pitchCents === 0;
  return playback.stretch < 1 && playback.stretch >= 1 / BEAT_SPEED_MAX - 1e-4 && isTapePlayback(playback);
}

export function beatSpeedPlayback(baseBpm: number, targetBpm: number): BeatSpeedPlayback {
  const speed = Math.min(BEAT_SPEED_MAX, Math.max(1, targetBpm / baseBpm));
  const stretch = Math.round((1 / speed) * 10_000) / 10_000;
  return { stretch, pitchCents: tapeCents(stretch) };
}

export function maxBeatBpm(baseBpm: number): number {
  return Math.floor(baseBpm * BEAT_SPEED_MAX + 1e-9);
}

/** The one tape pair that every Bit clip shares; null = normal speed or an arrangement by hand. */
function sharedTape(clips: readonly SpeedClip[]): BeatSpeedPlayback | null {
  let shared: BeatSpeedPlayback | null = null;
  for (const clip of clips) {
    if (clip.sourceKind !== "BEAT_REF") continue;
    const next = { stretch: clip.stretchRatio ?? 1, pitchCents: clip.pitchCents ?? 0 };
    if (!isTapePlayback(next) || (shared && shared.stretch !== next.stretch)) return null;
    shared = next;
  }
  return shared;
}

/** The tempo the singer hears: the grid, metronome and count-in follow it. */
export function studioHeardBpm(projectBpm: number, clips: readonly SpeedClip[]): number {
  const tape = sharedTape(clips);
  return tape ? Math.round((projectBpm / tape.stretch) * 100) / 100 : projectBpm;
}

export function studioBeatPitchCents(clips: readonly SpeedClip[]): number {
  return sharedTape(clips)?.pitchCents ?? 0;
}

/** The key the singer hears. Null when the Bit lands between two keys, where tuning would be wrong. */
export function shiftKeyByCents<K extends { keyRoot: number }>(key: K | null, cents: number): K | null {
  if (!key || cents === 0) return key;
  const semitones = Math.round(cents / 100);
  if (Math.abs(cents - semitones * 100) > 15) return null;
  return { ...key, keyRoot: (((key.keyRoot + semitones) % 12) + 12) % 12 };
}

/** Plain resample with a 4-point curve. No grains, so the rhythm cannot drift. */
export function tapeResample(input: Float32Array, outputLength: number): Float32Array {
  const out = new Float32Array(Math.max(1, outputLength));
  const last = input.length - 1;
  if (last < 0) return out;
  const step = input.length / out.length;
  for (let i = 0; i < out.length; i++) {
    const pos = i * step;
    const i1 = Math.min(last, Math.floor(pos));
    const f = pos - i1;
    const a = input[Math.max(0, i1 - 1)]!;
    const b = input[i1]!;
    const c = input[Math.min(last, i1 + 1)]!;
    const d = input[Math.min(last, i1 + 2)]!;
    out[i] = b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  }
  return out;
}
