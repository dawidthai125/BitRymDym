/**
 * P5.2 — BEAT_REF helpers for StudioTransport (pure, no I/O).
 */

import type { StudioClipDto, StudioTrackDto } from "@/lib/studio/studio-types";

export type PrimaryBeatRef = {
  beatId: string;
  clip: StudioClipDto;
  track: StudioTrackDto;
};

/** Find primary BEAT_REF on a BEAT track (first by timeline start). */
export function resolvePrimaryBeatRef(params: {
  tracks: StudioTrackDto[];
  clips: StudioClipDto[];
  projectBeatId?: string | null;
}): PrimaryBeatRef | null {
  const beatClips = params.clips
    .filter((c) => c.sourceKind === "BEAT_REF" && c.sourceBeatId)
    .sort((a, b) => a.timelineStartMs - b.timelineStartMs);

  for (const clip of beatClips) {
    const track = params.tracks.find((t) => t.id === clip.trackId);
    if (!track) continue;
    return {
      beatId: clip.sourceBeatId!,
      clip,
      track,
    };
  }

  if (params.projectBeatId) {
    const beatTrack =
      params.tracks.find((t) => t.trackType === "BEAT") ?? params.tracks[0];
    if (!beatTrack) return null;
    return {
      beatId: params.projectBeatId,
      clip: {
        id: "virtual-beat-ref",
        trackId: beatTrack.id,
        sourceKind: "BEAT_REF",
        sourceTakeId: null,
        sourceBeatId: params.projectBeatId,
        sourceArtifactId: null,
        timelineStartMs: 0,
        durationMs: 0,
        sourceOffsetMs: 0,
        gainDb: 0,
        muted: false,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
      track: beatTrack,
    };
  }

  return null;
}

export function gainDbToLinearVolume(gainDb: number): number {
  if (!Number.isFinite(gainDb)) return 1;
  const linear = Math.pow(10, gainDb / 20);
  return Math.min(1, Math.max(0, linear));
}

export function msToSeconds(ms: number): number {
  return ms / 1000;
}

export function secondsToMs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.round(seconds * 1000);
}

/** Map project playhead to source time inside a BEAT_REF clip. */
export function projectPlayheadToSourceSeconds(params: {
  playheadMs: number;
  clipTimelineStartMs: number;
  clipSourceOffsetMs: number;
  clipDurationMs: number;
}): number | null {
  const rel = params.playheadMs - params.clipTimelineStartMs;
  if (rel < 0 || rel >= params.clipDurationMs) return null;
  return msToSeconds(params.clipSourceOffsetMs + rel);
}

export function sourceSecondsToProjectPlayheadMs(params: {
  sourceSeconds: number;
  clipTimelineStartMs: number;
  clipSourceOffsetMs: number;
}): number {
  const sourceMs = secondsToMs(params.sourceSeconds);
  const rel = sourceMs - params.clipSourceOffsetMs;
  return params.clipTimelineStartMs + Math.max(0, rel);
}
