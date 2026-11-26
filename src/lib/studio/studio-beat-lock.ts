/**
 * The Bit is locked against accidental edits (owner video from a tablet, 2026-11-26: a finger
 * moved the Bit and cut it from 2:30 to 0:32). Pure rules; the editor applies them.
 */
import type { StudioClipDto } from "@/lib/studio/studio-types";

/** Rounding between the catalogue length and a clip is not a change. */
const SAME_MS = 50;

export function isBeatClip(clip: Pick<StudioClipDto, "sourceKind"> | null | undefined): boolean {
  return clip?.sourceKind === "BEAT_REF";
}

/** May a user action move, cut, copy, stretch or delete this clip? */
export function isClipLocked(clip: Pick<StudioClipDto, "sourceKind"> | null | undefined, beatUnlocked: boolean): boolean {
  return !beatUnlocked && isBeatClip(clip);
}

export type BeatRestore = { clipId: string; timelineStartMs: 0; sourceOffsetMs: 0; durationMs: number };

/**
 * "Put the Bit back at the start": only for one Bit clip that was moved or cut. A Bit split or
 * copied into several pieces is an arrangement and is left alone (undo handles that), and so is a
 * Bit with changed tempo.
 */
export function beatRestorePlan(clips: readonly StudioClipDto[], fullBeatMs: number | null): BeatRestore | null {
  if (fullBeatMs == null || !Number.isFinite(fullBeatMs) || fullBeatMs < 1000) return null;
  const beat = clips.filter(isBeatClip);
  if (beat.length !== 1) return null;
  const clip = beat[0];
  if ((clip.stretchRatio ?? 1) !== 1) return null;
  const untouched =
    clip.timelineStartMs === 0 && clip.sourceOffsetMs === 0 && Math.abs(clip.durationMs - fullBeatMs) <= SAME_MS;
  return untouched ? null : { clipId: clip.id, timelineStartMs: 0, sourceOffsetMs: 0, durationMs: Math.round(fullBeatMs) };
}
