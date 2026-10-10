/**
 * SFM-1 / SFM-1.1 — Studio Final Mix shared session interpretation (pure).
 *
 * Thin composition over existing schedule / fade / mixer / FX-read helpers.
 * Does NOT reimplement timeline rules. Does NOT render audio.
 * Typed FX via readStudioFxChain is NOT proof that a future renderer applies DSP.
 *
 * Live playback continues to own realization via StudioAudioEngine;
 * future Studio Final Mix renderer MUST consume this (or the same helpers).
 */

import { sourceOffsetMsAtPlayhead } from "@/lib/studio/studio-audio-clock";
import {
  clipGraphGain,
  masterGraphParams,
  planVoicesAtPlayhead,
  trackGraphParams,
  type StudioEngineClip,
  type StudioEngineDocument,
  type StudioEngineTrack,
  type StudioVoicePlan,
} from "@/lib/studio/studio-audio-schedule";
import {
  clipLocalMs,
  effectiveClipGain,
  fadeEnvelopeAt,
  normalizeFades,
} from "@/lib/studio/studio-clip-fade";
import {
  readStudioFxChain,
  type StudioFxChainRole,
  type StudioFxChainV1,
} from "@/lib/studio/studio-fx-chain";

export type StudioSessionInterpretedVoice = StudioVoicePlan & {
  /** Integer ms into source media at playhead (same geometry as schedule). */
  sourceOffsetMs: number;
  /** Local clip time t = playhead − timelineStart (ms). */
  localMs: number;
  /** Normalized fade lengths used for envelope at this duration. */
  fadeInMs: number;
  fadeOutMs: number;
  /** fadeEnvelopeAt(localMs, …) ∈ [0, 1]. */
  fadeEnvelope: number;
  /** clipGraphGain / baseClipGain (mute → 0). */
  baseClipGain: number;
  /** baseClipGain × fadeEnvelope (effectiveClipGain). */
  effectiveClipGain: number;
  /** trackGraphParams.gain at this document solo state. */
  trackGain: number;
  /** trackGraphParams.pan. */
  trackPan: number;
  /**
   * Track FX chain after readStudioFxChain (null raw → null; invalid → empty v1).
   * Passthrough/normalized contract only — not renderer DSP support.
   */
  trackEffectsChain: StudioFxChainV1 | null;
  /** Copied from clip document fields (no guessing / no ARTIFACT resolve). */
  sourceTakeId: string | null;
  sourceBeatId: string | null;
  timelineStartMs: number;
  durationMs: number;
  clipGainDb: number;
  clipMuted: boolean;
};

export type StudioSessionInterpretation = {
  playheadMs: number;
  timelineLengthMs: number;
  anySolo: boolean;
  master: { gain: number; pan: number };
  /**
   * Master FX after readStudioFxChain (null raw → null; invalid → empty v1).
   * Not renderer DSP support.
   */
  masterFxChain: StudioFxChainV1 | null;
  voices: StudioSessionInterpretedVoice[];
};

/**
 * Read-path FX contract: absent → null; present but unusable → empty v1
 * (same never-throw normalization as readStudioFxChain for non-null raw).
 */
export function interpretFxChainField(
  raw: unknown,
  role: StudioFxChainRole,
): StudioFxChainV1 | null {
  if (raw == null) return null;
  return readStudioFxChain(raw, role);
}

function clipById(
  document: StudioEngineDocument,
  clipId: string,
): StudioEngineClip | undefined {
  return document.clips.find((c) => c.id === clipId);
}

function trackById(
  document: StudioEngineDocument,
  trackId: string,
): StudioEngineTrack | undefined {
  return document.tracks.find((t) => t.id === trackId);
}

/**
 * Interpret an engine document at a single playhead (integer ms SSOT).
 * Reuses planVoicesAtPlayhead + effectiveClipGain + track/master graph params.
 */
export function interpretStudioSessionAtPlayhead(
  document: StudioEngineDocument,
  playheadMs: number,
): StudioSessionInterpretation {
  const anySolo = document.tracks.some((t) => t.solo);
  const plans = planVoicesAtPlayhead(document, playheadMs);
  const voices: StudioSessionInterpretedVoice[] = [];

  for (const plan of plans) {
    const clip = clipById(document, plan.clipId);
    const track = trackById(document, plan.trackId);
    if (!clip || !track) continue;

    const sourceOffsetMs = sourceOffsetMsAtPlayhead({
      playheadMs,
      timelineStartMs: clip.timelineStartMs,
      sourceOffsetMs: clip.sourceOffsetMs,
      durationMs: clip.durationMs,
    });
    if (sourceOffsetMs == null) continue;

    const localMs = clipLocalMs(playheadMs, clip.timelineStartMs);
    const fades = normalizeFades(
      clip.fadeInMs,
      clip.fadeOutMs,
      clip.durationMs,
    );
    const fadeEnvelope = fadeEnvelopeAt(
      localMs,
      clip.fadeInMs,
      clip.fadeOutMs,
      clip.durationMs,
    );
    const base = clipGraphGain(clip);
    const effective = effectiveClipGain(clip, playheadMs);
    const trackParams = trackGraphParams(track, anySolo);

    voices.push({
      ...plan,
      sourceOffsetMs,
      localMs,
      fadeInMs: fades.fadeInMs,
      fadeOutMs: fades.fadeOutMs,
      fadeEnvelope,
      baseClipGain: base,
      effectiveClipGain: effective,
      trackGain: trackParams.gain,
      trackPan: trackParams.pan,
      trackEffectsChain: interpretFxChainField(track.effectsChain, "track"),
      sourceTakeId: clip.sourceTakeId,
      sourceBeatId: clip.sourceBeatId,
      timelineStartMs: clip.timelineStartMs,
      durationMs: clip.durationMs,
      clipGainDb: clip.gainDb,
      clipMuted: clip.muted,
    });
  }

  return {
    playheadMs,
    timelineLengthMs: document.timelineLengthMs,
    anySolo,
    master: masterGraphParams(document),
    masterFxChain: interpretFxChainField(document.masterFxChain, "master"),
    voices,
  };
}
