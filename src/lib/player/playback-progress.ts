/**
 * Playback progress presentation helpers — pure, no DOM.
 * Waveform bars remain visual data; this ratio is the only progress SSOT input.
 */

/** Clamp audio position into a 0..1 progress ratio for an active track. */
export function playbackProgressRatio(
  currentTime: number,
  duration: number,
  isActiveTrack: boolean,
): number {
  if (!isActiveTrack || !(duration > 0) || !Number.isFinite(currentTime)) {
    return 0;
  }
  return Math.min(1, Math.max(0, currentTime / duration));
}

/** Map pointer X within a waveform bounding box to a seek ratio. */
export function seekRatioFromClientX(
  clientX: number,
  left: number,
  width: number,
): number {
  if (!(width > 0) || !Number.isFinite(clientX) || !Number.isFinite(left)) {
    return 0;
  }
  return Math.max(0, Math.min(1, (clientX - left) / width));
}

/** True when playback has reached (or passed) the end and should restart at 0 on Play. */
export function shouldRestartFromStart(
  currentTime: number,
  duration: number,
  ended: boolean,
): boolean {
  if (ended) return true;
  if (!(duration > 0) || !Number.isFinite(currentTime)) return false;
  return currentTime >= duration - 0.05;
}
