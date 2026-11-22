/**
 * Pure cassette-reel physics for the home tape deck (no DOM, no React).
 *
 * Tape length is conserved: the wound area of both packs is constant, so
 * r² = hub² + share · (full² − hub²). Tape runs at a constant linear speed,
 * so each reel's angular speed is v / r — the thinner pack spins faster.
 */

export type ReelGeometry = {
  /** Radius of the bare hub (empty reel), in SVG units. */
  hub: number;
  /** Radius of a reel holding the whole tape, in SVG units. */
  full: number;
};

/** Matches the deck's 40×40 reel viewBox. */
export const DECK_REEL_GEOMETRY: ReelGeometry = { hub: 9, full: 18 };

/** Angular speed of a bare hub at 1× playback (deg/s) — ~0.7 rev/s like a real deck. */
export const HUB_DEG_PER_SECOND = 252;

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

/** Radius of a pack holding `share` (0..1) of the tape. */
export function packRadius(share: number, geometry: ReelGeometry = DECK_REEL_GEOMETRY): number {
  const s = clampProgress(share);
  const { hub, full } = geometry;
  return Math.sqrt(hub * hub + s * (full * full - hub * hub));
}

/** Supply (left) and take-up (right) pack radii for playback progress 0..1. */
export function reelRadii(
  progress: number,
  geometry: ReelGeometry = DECK_REEL_GEOMETRY,
): { supply: number; takeUp: number } {
  const p = clampProgress(progress);
  return { supply: packRadius(1 - p, geometry), takeUp: packRadius(p, geometry) };
}

/**
 * Angular speeds (deg/s, positive = clockwise from the front) of both reels.
 * Linear tape speed is fixed by the hub reference speed; ω = v / r.
 */
export function reelAngularSpeeds(
  progress: number,
  playbackRate = 1,
  geometry: ReelGeometry = DECK_REEL_GEOMETRY,
): { supply: number; takeUp: number } {
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 0;
  const tapeSpeed = HUB_DEG_PER_SECOND * geometry.hub * rate;
  const { supply, takeUp } = reelRadii(progress, geometry);
  return { supply: tapeSpeed / supply, takeUp: tapeSpeed / takeUp };
}

/**
 * Smooth playback position between coarse `timeupdate` events (~4 Hz):
 * extrapolate from the last reported time, capped so a stall never runs away.
 */
export function estimatePosition(
  reported: number,
  elapsedSeconds: number,
  playbackRate: number,
  total: number,
  maxLeadSeconds = 0.6,
): number {
  const lead = Math.min(Math.max(0, elapsedSeconds), maxLeadSeconds) * Math.max(0, playbackRate);
  const pos = reported + lead;
  return total > 0 ? Math.min(total, pos) : pos;
}

/**
 * Motor spin-up / brake: move the speed factor toward `target` (0 or 1)
 * exponentially with time constant `tauSeconds`.
 */
export function approachSpeed(current: number, target: number, dtSeconds: number, tauSeconds = 0.25): number {
  if (dtSeconds <= 0) return current;
  const k = 1 - Math.exp(-dtSeconds / tauSeconds);
  const next = current + (target - current) * k;
  return Math.abs(next - target) < 0.002 ? target : next;
}
