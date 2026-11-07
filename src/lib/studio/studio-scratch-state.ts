/**
 * Scratch DJ v1 — approved + live parameter domain.
 * Live reverse uses BufferSource inside StudioAudioEngine (not a second engine).
 * Persist goes through existing studio_cas_* (approved cue/reverse/rate).
 * Offline STUDIO_EXPORT bake applies the same approved CAS fields
 * (cue + reverse + rate) in studio-offline-render — not a second engine.
 */

export const SCRATCH_RATE_MIN = 0.25;
export const SCRATCH_RATE_MAX = 4;
export const SCRATCH_DEFAULT_RATE = 1;
/** Desktop pointer: rate change per CSS pixel of horizontal drag. */
export const SCRATCH_JOG_RATE_PER_PX = 0.02;
/**
 * Pad-normalized jog: drag across the full jog width ≈ this many rate units
 * (before clamp). Mobile thumbs get stable feel across viewport widths.
 */
export const SCRATCH_JOG_RATE_PER_FULL_WIDTH = 2;

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

/**
 * Convert horizontal pad movement into a rate delta.
 * Prefer pad width (mobile-stable). Fall back to px sensitivity when width unknown.
 */
export function scratchJogRateDeltaFromMove(
  deltaPx: number,
  padWidthPx: number,
): number {
  const delta = Number.isFinite(deltaPx) ? deltaPx : 0;
  if (Number.isFinite(padWidthPx) && padWidthPx >= 8) {
    return (delta / padWidthPx) * SCRATCH_JOG_RATE_PER_FULL_WIDTH;
  }
  return delta * SCRATCH_JOG_RATE_PER_PX;
}

export function applyScratchJogDelta(
  live: StudioScratchLiveState,
  deltaPx: number,
  padWidthPx = 0,
): StudioScratchLiveState {
  return {
    ...live,
    jogging: true,
    rate: clampScratchRate(
      live.rate + scratchJogRateDeltaFromMove(deltaPx, padWidthPx),
    ),
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

/** Live jog is driving this clip, so persisted reverse must not start a second buffer. */
export function scratchJogOwnsClip(input: {
  clipId: string;
  liveClipId: string | null;
  liveReverse: boolean;
  liveRate: number;
}): boolean {
  const driving = input.liveReverse || input.liveRate !== 1;
  if (!driving) return false;
  if (!input.liveClipId) return true;
  return input.liveClipId === input.clipId;
}

/** Source second heard at this clip position. Same map the export bake uses. */
export function persistedReverseHeardSec(input: {
  sourceOffsetMs: number;
  localMs: number;
  cueMs: number;
  rate: number;
  sourceDurationMs: number;
}): number {
  return (
    resolveScratchSourceMs({
      sourceOffsetMs: input.sourceOffsetMs,
      localMs: input.localMs,
      approved: {
        cueMs: input.cueMs,
        reverse: true,
        rate: input.rate,
      },
      sourceDurationMs: input.sourceDurationMs,
    }) / 1000
  );
}

/** How far a reversed buffer has walked since it started. */
export function persistedReverseCoastSec(input: {
  anchorHeardSec: number;
  elapsedSec: number;
  rate: number;
}): number {
  const elapsed = Number.isFinite(input.elapsedSec) ? Math.max(0, input.elapsedSec) : 0;
  return input.anchorHeardSec - elapsed * clampScratchRate(input.rate);
}

/** Restart only when the playhead left the buffer. A normal tick stays inside this window. */
export const PERSISTED_REVERSE_COAST_SEC = 0.08;

export function persistedReverseShouldRestart(input: {
  bufferRunning: boolean;
  coastHeardSec: number;
  targetHeardSec: number;
  toleranceSec?: number;
}): boolean {
  if (!input.bufferRunning) return true;
  if (!Number.isFinite(input.coastHeardSec) || !Number.isFinite(input.targetHeardSec)) return true;
  const tolerance = input.toleranceSec ?? PERSISTED_REVERSE_COAST_SEC;
  return Math.abs(input.coastHeardSec - input.targetHeardSec) > tolerance;
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
 * Linked live rate magnitude. Direction is a separate `reverse` flag
 * applied by BufferSource inside StudioAudioEngine.
 */
export function studioScratchLivePlaybackRate(
  live: StudioScratchLiveState,
): number {
  return clampScratchRate(live.rate);
}

export function parseScratchApprovedForWrite(input: {
  cueMs: unknown;
  reverse: unknown;
  rate: unknown;
}): StudioScratchApprovedState {
  if (typeof input.reverse !== "boolean") {
    throw new Error("reverse Scratch musi być wartością logiczną.");
  }
  if (!Number.isFinite(input.cueMs) || Number(input.cueMs) < 0) {
    throw new Error("cue Scratch musi być nieujemną liczbą.");
  }
  if (!Number.isFinite(input.rate)) {
    throw new Error("tempo Scratch musi być liczbą.");
  }
  return {
    cueMs: Math.floor(Number(input.cueMs)),
    reverse: input.reverse,
    rate: clampScratchRate(Number(input.rate)),
  };
}

/**
 * Map approved Scratch CAS fields onto source time for STUDIO_EXPORT bake.
 * Rate is linked pitch+speed (no independent time-stretch). Reverse reads
 * backward through the same source window. Jog automation is OUT of v1.
 */
export function resolveScratchSourceMs(params: {
  sourceOffsetMs: number;
  localMs: number;
  approved: StudioScratchApprovedState;
  sourceDurationMs: number;
}): number {
  const rate = clampScratchRate(params.approved.rate);
  const cueMs = Number.isFinite(params.approved.cueMs)
    ? Math.max(0, params.approved.cueMs)
    : 0;
  const localMs = Number.isFinite(params.localMs) ? params.localMs : 0;
  const sourceOffsetMs = Number.isFinite(params.sourceOffsetMs)
    ? params.sourceOffsetMs
    : 0;
  const forwardMs = sourceOffsetMs + cueMs + localMs * rate;
  if (!params.approved.reverse) return forwardMs;
  const duration = Number.isFinite(params.sourceDurationMs)
    ? params.sourceDurationMs
    : 0;
  if (duration < 1) return forwardMs;
  // Exclusive duration maps to frame == frames; step back so t=0 hits the last sample.
  return duration - 1e-6 - forwardMs;
}

export function assertScratchExportEncodable(approved: StudioScratchApprovedState): {
  ok: true;
} | {
  ok: false;
  error: typeof SCRATCH_EXPORT_UNSUPPORTED;
  message: string;
} {
  if (typeof approved.reverse !== "boolean") {
    return {
      ok: false,
      error: SCRATCH_EXPORT_UNSUPPORTED,
      message: SCRATCH_EXPORT_UNSUPPORTED_PL,
    };
  }
  if (!Number.isFinite(approved.cueMs) || approved.cueMs < 0) {
    return {
      ok: false,
      error: SCRATCH_EXPORT_UNSUPPORTED,
      message: SCRATCH_EXPORT_UNSUPPORTED_PL,
    };
  }
  if (!Number.isFinite(approved.rate)) {
    return {
      ok: false,
      error: SCRATCH_EXPORT_UNSUPPORTED,
      message: SCRATCH_EXPORT_UNSUPPORTED_PL,
    };
  }
  return { ok: true };
}
