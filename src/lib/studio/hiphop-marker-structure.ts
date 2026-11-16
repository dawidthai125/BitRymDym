/**
 * Default hip-hop section map → existing verse/hook markers (no new marker kinds).
 * Bars are 4/4; ms = bars * (4 * 60_000 / bpm).
 */

import type { StudioMarkerKind } from "@/lib/studio/studio-markers-state";
import { STUDIO_MARKERS_MAX } from "@/lib/studio/studio-markers-state";

export type HipHopStructureSection = {
  /** Display label for UI (Intro / Zwrotka / …). */
  label: string;
  kind: StudioMarkerKind;
  bars: number;
};

/** Producent: Intro 8 · Verse 16 · Hook 8 · Verse 16 · Hook 8 · Outro 8 @ 90 BPM. */
export const HIPHOP_STRUCTURE_SECTIONS: readonly HipHopStructureSection[] = [
  { label: "Intro", kind: "verse", bars: 8 },
  { label: "Zwrotka 1", kind: "verse", bars: 16 },
  { label: "Refren 1", kind: "hook", bars: 8 },
  { label: "Zwrotka 2", kind: "verse", bars: 16 },
  { label: "Refren 2", kind: "hook", bars: 8 },
  { label: "Outro", kind: "verse", bars: 8 },
] as const;

export type HipHopStructureMarker = {
  kind: StudioMarkerKind;
  positionMs: number;
  label: string;
};

export function barDurationMs(bpm: number): number {
  const safe = Number.isFinite(bpm) && bpm >= 40 && bpm <= 300 ? bpm : 90;
  return (4 * 60_000) / safe;
}

export function planHipHopStructureMarkers(params: {
  bpm: number;
  startMs?: number;
  sections?: readonly HipHopStructureSection[];
  maxMarkers?: number;
}): HipHopStructureMarker[] {
  const start = Math.max(0, Math.floor(params.startMs ?? 0));
  const sections = params.sections ?? HIPHOP_STRUCTURE_SECTIONS;
  const max = Math.min(
    STUDIO_MARKERS_MAX,
    Math.max(1, params.maxMarkers ?? STUDIO_MARKERS_MAX),
  );
  const barMs = barDurationMs(params.bpm);
  const out: HipHopStructureMarker[] = [];
  let cursorBars = 0;
  for (const section of sections) {
    if (out.length >= max) break;
    const positionMs = Math.round(start + cursorBars * barMs);
    out.push({
      kind: section.kind,
      positionMs,
      label: section.label,
    });
    cursorBars += section.bars;
  }
  return out;
}
