/**
 * SSOT list of synthetic BPM values for fixture generation + docs.
 * Tooling only — do not import from app runtime / client bundles.
 */

export const SYNTHETIC_BPM_MATRIX = [
  70, 72, 75, 80, 85, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 100, 101,
  103, 105, 108, 110, 112, 115, 120, 130, 135, 138, 140, 142, 145, 148, 150,
  155, 160, 170, 180,
] as const;

export type SyntheticBpm = (typeof SYNTHETIC_BPM_MATRIX)[number];

export const SYNTHETIC_FIXTURE_SAMPLE_RATE = 44100;
export const SYNTHETIC_FIXTURE_DURATION_SECONDS = 30;

export function syntheticFixtureFilename(bpm: number): string {
  return `bpm-${bpm}-steady.wav`;
}

/** Rap-zone subset for report focus (still synthetic). */
export const RAP_ZONE_BPM = [
  87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 100, 101, 103, 105,
] as const;

/** Pairs for half/double focus reporting. */
export const HALF_DOUBLE_FOCUS = [
  { low: 70, high: 140 },
  { low: 72, high: 144 },
  { low: 75, high: 150 },
  { low: 80, high: 160 },
  { low: 85, high: 170 },
  { low: 90, high: 180 },
] as const;
