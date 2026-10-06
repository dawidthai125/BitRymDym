/**
 * P5.10 multi-source schedule — overlap = mix (not first-wins).
 * Kind-agnostic: adapters resolve media; this module only plans voices.
 */

import type { StudioClipSourceKind } from "@/config/studio";
import { sourceOffsetSecondsAtPlayhead } from "@/lib/studio/studio-audio-clock";
import { isTrackAudible, normalizePan } from "@/lib/studio/studio-track-ops";
import { gainDbToLinearVolume } from "@/lib/studio/studio-beat-audio";

export type StudioEngineTrack = {
  id: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  effectsChain?: unknown;
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
};

export type StudioEngineDocument = {
  timelineLengthMs: number;
  masterGainDb: number;
  masterPan: number;
  /** P6.3 — Master FX chain (pre–Master Gain/Pan). Optional for P5.10 callers. */
  masterFxChain?: unknown;
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
