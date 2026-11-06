/**
 * P5.10 multi-source schedule — overlap = mix (not first-wins).
 * Kind-agnostic: adapters resolve media; this module only plans voices.
 */

import type { StudioClipSourceKind } from "@/config/studio";
import { sourceOffsetSecondsAtPlayhead } from "@/lib/studio/studio-audio-clock";
import { isTrackAudible, normalizePan } from "@/lib/studio/studio-track-ops";
import {
  beatRefMatchesProjectSsot,
  gainDbToLinearVolume,
} from "@/lib/studio/studio-beat-audio";

import { automationLane, trackParamAt, type StudioAutomationV1 } from "@/lib/studio/studio-automation";
import type { StudioMidiV1 } from "@/lib/studio/studio-midi";

export type StudioEngineTrack = {
  id: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  effectsChain?: unknown;
  /** Silver/Gold gain / pan envelopes (see studio-automation.ts). */
  automation?: StudioAutomationV1;
  /** Timeline notes rendered by studio-midi.ts. Absent/empty = silence. */
  midi?: StudioMidiV1;
};

export type StudioEngineClip = {
  id: string;
  trackId: string;
  sourceKind: StudioClipSourceKind;
  sourceTakeId: string | null;
  sourceBeatId: string | null;
  sourceOffsetMs: number;
  timelineStartMs: number;
  durationMs: number;
  gainDb: number;
  muted: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  /** Approved Scratch DJ v1 (CAS). Optional on older documents / fixtures. */
  scratchCueMs?: number;
  scratchReverse?: boolean;
  scratchRate?: number;
};

export type StudioEngineDocument = {
  timelineLengthMs: number;
  masterGainDb: number;
  masterPan: number;
  /** P6.3 — Master FX chain (pre–Master Gain/Pan). Optional for P5.10 callers. */
  masterFxChain?: unknown;
  /**
   * AUD-01 SSOT for project beat. When set (including null), BEAT_REF clips
   * whose sourceBeatId does not match are never scheduled.
   * Omit (`undefined`) only for legacy unit fixtures that predate the guard.
   */
  projectBeatId?: string | null;
  tracks: readonly StudioEngineTrack[];
  clips: readonly StudioEngineClip[];
  isTrackPlayable?: (trackId: string) => boolean;
};

export type StudioVoicePlan = {
  clipId: string;
  trackId: string;
  sourceKind: StudioClipSourceKind;
  sourceOffsetSeconds: number;
  remainingMs: number;
};

export function planVoicesAtPlayhead(
  document: StudioEngineDocument,
  playheadMs: number,
): StudioVoicePlan[] {
  const anySolo = document.tracks.some((t) => t.solo);
  const tracks = new Map(document.tracks.map((t) => [t.id, t]));
  const plans: StudioVoicePlan[] = [];

  for (const clip of document.clips) {
    if (clip.muted) continue;
    if (clip.durationMs < 1) continue;
    // AUD-01: stale BEAT_REF must not become audible when SSOT is known.
    if (
      clip.sourceKind === "BEAT_REF" &&
      document.projectBeatId !== undefined &&
      !beatRefMatchesProjectSsot({
        projectBeatId: document.projectBeatId,
        sourceBeatId: clip.sourceBeatId,
      })
    ) {
      continue;
    }
    if (
      playheadMs < clip.timelineStartMs ||
      playheadMs >= clip.timelineStartMs + clip.durationMs
    ) {
      continue;
    }
    const track = tracks.get(clip.trackId);
    if (!track) continue;
    if (document.isTrackPlayable && !document.isTrackPlayable(track.id)) {
      continue;
    }
    if (
      !isTrackAudible({
        muted: track.muted,
        solo: track.solo,
        anySolo,
      })
    ) {
      continue;
    }
    const sourceOffsetSeconds = sourceOffsetSecondsAtPlayhead({
      playheadMs,
      timelineStartMs: clip.timelineStartMs,
      sourceOffsetMs: clip.sourceOffsetMs,
      durationMs: clip.durationMs,
    });
    if (sourceOffsetSeconds == null) continue;
    plans.push({
      clipId: clip.id,
      trackId: clip.trackId,
      sourceKind: clip.sourceKind,
      sourceOffsetSeconds,
      remainingMs: clip.timelineStartMs + clip.durationMs - playheadMs,
    });
  }

  return plans;
}

export function trackGraphParams(
  track: StudioEngineTrack,
  anySolo: boolean,
): { gain: number; pan: number } {
  const audible = isTrackAudible({
    muted: track.muted,
    solo: track.solo,
    anySolo,
  });
  const linear = gainDbToLinearVolume(track.gainDb);
  return {
    gain: audible ? linear : 0,
    pan: normalizePan(track.pan),
  };
}

export function clipGraphGain(clip: Pick<StudioEngineClip, "gainDb" | "muted">): number {
  if (clip.muted) return 0;
  return gainDbToLinearVolume(clip.gainDb);
}

export function masterGraphParams(document: Pick<
  StudioEngineDocument,
  "masterGainDb" | "masterPan"
>): { gain: number; pan: number } {
  return {
    gain: gainDbToLinearVolume(document.masterGainDb),
    pan: normalizePan(document.masterPan),
  };
}

export type TrackParamSchedule = {
  /** Value at `playheadMs` (now). */
  start: number;
  /** Ramp targets after now: `atMs` from now, then linear ramp to `value`. */
  events: { atMs: number; value: number }[];
};

/**
 * Silver/Gold automation as Web Audio events, from the playhead on. Pure (no AudioParam), so the schedule can be
 * unit-tested and compared with the offline renderers. Gain is sampled densely inside a segment because the
 * envelope is linear in dB while a Web Audio ramp is linear in amplitude; pan is linear in both, so its points are enough.
 * Mute / solo keep winning: an inaudible track is a flat 0.
 */
export function trackAutomationSchedule(
  track: StudioEngineTrack,
  anySolo: boolean,
  playheadMs: number,
  opts: { stepMs?: number; maxEvents?: number } = {},
): { gain: TrackParamSchedule | null; pan: TrackParamSchedule | null } {
  const stepMs = Math.max(10, opts.stepMs ?? 50);
  const maxEvents = Math.max(16, opts.maxEvents ?? 3000);
  const auto = track.automation;
  const gainLane = automationLane(auto, "gainDb");
  const panLane = automationLane(auto, "pan");
  const audible = isTrackAudible({ muted: track.muted, solo: track.solo, anySolo });

  const build = (
    lane: { points: readonly { t: number; v: number }[] },
    param: "gainDb" | "pan",
    staticValue: number,
    convert: (v: number) => number,
    subdivide: boolean,
  ): TrackParamSchedule => {
    const value = (t: number) => convert(trackParamAt(auto, param, t, staticValue));
    const start = value(playheadMs);
    const events: { atMs: number; value: number }[] = [];
    let prev = playheadMs;
    const future = lane.points.filter((p) => p.t > playheadMs);
    const segments = Math.max(1, future.length);
    const perSegment = Math.max(1, Math.floor(maxEvents / segments));
    for (const p of future) {
      if (subdivide && Math.abs(value(p.t) - value(prev)) > 1e-4) {
        const span = p.t - prev;
        const steps = Math.min(perSegment, Math.max(1, Math.ceil(span / stepMs)));
        for (let k = 1; k < steps; k++) {
          const t = prev + (span * k) / steps;
          events.push({ atMs: t - playheadMs, value: value(t) });
        }
      }
      events.push({ atMs: p.t - playheadMs, value: value(p.t) });
      prev = p.t;
    }
    return { start, events };
  };

  return {
    gain: gainLane
      ? audible
        ? build(gainLane, "gainDb", track.gainDb, gainDbToLinearVolume, true)
        : { start: 0, events: [] }
      : null,
    pan: panLane ? build(panLane, "pan", track.pan, normalizePan, false) : null,
  };
}
