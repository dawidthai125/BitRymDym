/**
 * P5.10 shared clock: persisted/UI playhead = integer ms;
 * runtime = AudioContext.currentTime (seconds).
 */

import { clampPlayheadMs } from "@/lib/studio/studio-time";

/** Diagnostic skew between voices after a shared seek (freeze §13). */
export const MAX_SYNC_SKEW_MS = 40;

export type StudioClockEpoch = {
  epochContextTime: number;
  epochPlayheadMs: number;
};

export function createStudioClockEpoch(params: {
  contextTime: number;
  playheadMs: number;
}): StudioClockEpoch {
  return {
    epochContextTime: params.contextTime,
    epochPlayheadMs: params.playheadMs,
  };
}

/** timeline ms → playhead from AudioContext clock. */
export function playheadMsFromContextClock(params: {
  epoch: StudioClockEpoch;
  contextTime: number;
  timelineLengthMs: number;
}): number {
  const elapsedMs = Math.round(
    (params.contextTime - params.epoch.epochContextTime) * 1000,
  );
  return clampPlayheadMs(
    params.epoch.epochPlayheadMs + elapsedMs,
    params.timelineLengthMs,
  );
}

export function sourceOffsetMsAtPlayhead(params: {
  playheadMs: number;
  timelineStartMs: number;
  sourceOffsetMs: number;
  durationMs: number;
}): number | null {
  const rel = params.playheadMs - params.timelineStartMs;
  if (rel < 0 || rel >= params.durationMs) return null;
  return params.sourceOffsetMs + rel;
}

export function sourceOffsetSecondsAtPlayhead(params: {
  playheadMs: number;
  timelineStartMs: number;
  sourceOffsetMs: number;
  durationMs: number;
}): number | null {
  const ms = sourceOffsetMsAtPlayhead(params);
  if (ms == null) return null;
  return ms / 1000;
}

export function mediaSkewMs(params: {
  expectedSourceSeconds: number;
  actualSourceSeconds: number;
}): number {
  return Math.round(
    Math.abs(params.actualSourceSeconds - params.expectedSourceSeconds) * 1000,
  );
}

export function isVoiceInSync(params: {
  expectedSourceSeconds: number;
  actualSourceSeconds: number;
  maxSkewMs?: number;
}): boolean {
  const skew = mediaSkewMs(params);
  return skew <= (params.maxSkewMs ?? MAX_SYNC_SKEW_MS);
}
