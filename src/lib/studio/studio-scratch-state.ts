/**
 * Scratch DJ v1 — approved + live parameter domain.
 * Persist/CAS columns and offline encode are OUT of this slice.
 * One StudioAudioEngine remains the audible path (linked rate+pitch).
 */

export const SCRATCH_RATE_MIN = 0.25;
export const SCRATCH_RATE_MAX = 4;
export const SCRATCH_DEFAULT_RATE = 1;
export const SCRATCH_JOG_RATE_PER_PX = 0.02;

export const SCRATCH_EXPORT_UNSUPPORTED = "SCRATCH_EXPORT_UNSUPPORTED" as const;

export const SCRATCH_EXPORT_UNSUPPORTED_PL =
  "Eksport nie może pominąć zatwierdzonego reverse albo tempa Scratch. Ten parametr nie jest jeszcze w offline render.";

export type StudioScratchApprovedState = {
  cueMs: number;
  reverse: boolean;
  rate: number;
};

export type StudioScratchLiveState = StudioScratchApprovedState & {
  jogging: boolean;
};

export function defaultScratchApprovedState(): StudioScratchApprovedState {
  return {
    cueMs: 0,
    reverse: false,
    rate: SCRATCH_DEFAULT_RATE,
  };
}

export function defaultScratchLiveState(): StudioScratchLiveState {
  return {
    ...defaultScratchApprovedState(),
    jogging: false,
  };
}

export function clampScratchRate(rate: number): number {
  if (!Number.isFinite(rate)) return SCRATCH_DEFAULT_RATE;
  return Math.min(SCRATCH_RATE_MAX, Math.max(SCRATCH_RATE_MIN, rate));
}

export function clampScratchCueMs(
  cueMs: number,
  sourceDurationMs: number,
): number {
  if (!Number.isFinite(cueMs) || cueMs < 0) return 0;
  if (!Number.isFinite(sourceDurationMs) || sourceDurationMs < 1) return 0;
  return Math.min(Math.floor(cueMs), sourceDurationMs - 1);
}

export function applyScratchJogDelta(
  live: StudioScratchLiveState,
  deltaPx: number,
): StudioScratchLiveState {
  const delta = Number.isFinite(deltaPx) ? deltaPx : 0;
  return {
    ...live,
    jogging: true,
    rate: clampScratchRate(live.rate + delta * SCRATCH_JOG_RATE_PER_PX),
  };
}

export function releaseScratchJog(
  _live: StudioScratchLiveState,
  approved: StudioScratchApprovedState,
): StudioScratchLiveState {
  return {
    ...approved,
    jogging: false,
  };
}

export function approveScratchLive(
  live: StudioScratchLiveState,
): StudioScratchApprovedState {
  return {
    cueMs: live.cueMs,
    reverse: live.reverse,
    rate: clampScratchRate(live.rate),
  };
}

export function setScratchCue(
  live: StudioScratchLiveState,
  cueMs: number,
  sourceDurationMs: number,
): StudioScratchLiveState {
  return {
    ...live,
    cueMs: clampScratchCueMs(cueMs, sourceDurationMs),
  };
}

export function toggleScratchReverse(
  live: StudioScratchLiveState,
): StudioScratchLiveState {
  return {
    ...live,
    reverse: !live.reverse,
  };
}

export function setScratchRate(
  live: StudioScratchLiveState,
  rate: number,
): StudioScratchLiveState {
  return {
    ...live,
    rate: clampScratchRate(rate),
  };
}

/**
 * HTMLMediaElement cannot play backwards. Live apply uses |rate| only.
 * Export must fail closed when approved reverse or non-unity rate is set.
 */
export function studioScratchLivePlaybackRate(
  live: StudioScratchLiveState,
): number {
  return clampScratchRate(live.rate);
}

export function assertScratchExportEncodable(approved: StudioScratchApprovedState): {
  ok: true;
} | {
  ok: false;
  error: typeof SCRATCH_EXPORT_UNSUPPORTED;
  message: string;
} {
  const rate = clampScratchRate(approved.rate);
  if (approved.reverse || rate !== SCRATCH_DEFAULT_RATE) {
    return {
      ok: false,
      error: SCRATCH_EXPORT_UNSUPPORTED,
      message: SCRATCH_EXPORT_UNSUPPORTED_PL,
    };
  }
  return { ok: true };
}
