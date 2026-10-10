/**
 * Shared StudioProjectDocument → StudioEngineDocument mapping (SFM bake + live).
 * Mirrors studio-editor engineDocument construction — single interpretation SSOT.
 */

import { beatRefMatchesProjectSsot } from "@/lib/studio/studio-beat-audio";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

/**
 * Map persisted Studio project document to offline/live engine document shape.
 * Stale BEAT_REF clips (≠ project beat SSOT) are dropped before schedule.
 */
export function studioEngineDocumentFromProject(
  doc: StudioProjectDocument,
): StudioEngineDocument {
  return {
    timelineLengthMs: doc.project.timelineLengthMs,
    masterGainDb: doc.project.masterGainDb,
    masterPan: doc.project.masterPan,
    masterFxChain: doc.project.masterFxChain,
    projectBeatId: doc.project.beatId,
    tracks: doc.tracks.map((t) => ({
      id: t.id,
      gainDb: t.gainDb,
      pan: t.pan,
      muted: t.muted,
      solo: t.solo,
      effectsChain: t.effectsChain,
    })),
    clips: doc.clips
      .filter((c) => {
        if (c.sourceKind !== "BEAT_REF") return true;
        return beatRefMatchesProjectSsot({
          projectBeatId: doc.project.beatId,
          sourceBeatId: c.sourceBeatId,
        });
      })
      .map((c) => ({
        id: c.id,
        trackId: c.trackId,
        sourceKind: c.sourceKind,
        sourceTakeId: c.sourceTakeId,
        sourceBeatId: c.sourceBeatId,
        sourceOffsetMs: c.sourceOffsetMs,
        timelineStartMs: c.timelineStartMs,
        durationMs: c.durationMs || doc.project.timelineLengthMs,
        gainDb: c.gainDb,
        muted: c.muted,
        fadeInMs: c.fadeInMs,
        fadeOutMs: c.fadeOutMs,
      })),
  };
}
