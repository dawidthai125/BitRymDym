/** Speeds a listener can check a performance at. Not a download control. */
export const BRD_PLAYBACK_RATES = [0.75, 1, 1.25] as const;

export type BrdPlaybackRate = (typeof BRD_PLAYBACK_RATES)[number];

export function nextBrdPlaybackRate(current: number): BrdPlaybackRate {
  const found = BRD_PLAYBACK_RATES.findIndex((rate) => Math.abs(rate - current) < 0.001);
  const index = found < 0 ? BRD_PLAYBACK_RATES.indexOf(1) : found;
  const next = BRD_PLAYBACK_RATES[(index + 1) % BRD_PLAYBACK_RATES.length];
  return next ?? 1;
}

export function clampPlaybackGain(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
