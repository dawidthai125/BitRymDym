/**
 * Pure Track ops for P5.1 (no I/O). Type-agnostic — no vocal-only branches.
 */

import type { StudioTrackType } from "@/config/studio";

export type StudioTrackControls = {
  id: string;
  name: string;
  trackType: StudioTrackType;
  sortOrder: number;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  recordArmed: boolean;
};

export function reorderTrackIds(params: {
  orderedIds: string[];
  trackId: string;
  direction: "up" | "down";
}): string[] {
  const ids = [...params.orderedIds];
  const idx = ids.indexOf(params.trackId);
  if (idx < 0) {
    throw new Error("Track not found in order list.");
  }
  const swapWith = params.direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= ids.length) {
    return ids;
  }
  const tmp = ids[idx]!;
  ids[idx] = ids[swapWith]!;
  ids[swapWith] = tmp;
  return ids;
}

export function applySortOrders(
  orderedIds: string[],
): Array<{ id: string; sortOrder: number }> {
  return orderedIds.map((id, sortOrder) => ({ id, sortOrder }));
}

/** Solo semantics: if any track is solo, only solo tracks are audible. */
export function isTrackAudible(params: {
  muted: boolean;
  solo: boolean;
  anySolo: boolean;
}): boolean {
  if (params.muted) return false;
  if (params.anySolo) return params.solo;
  return true;
}

export function normalizePan(pan: number): number {
  if (!Number.isFinite(pan)) throw new Error("pan must be finite.");
  return Math.min(1, Math.max(-1, pan));
}

export function defaultTrackName(trackType: StudioTrackType): string {
  switch (trackType) {
    case "BEAT":
      return "Bit";
    case "VOCAL":
      return "Wokal";
    case "SAMPLE":
      return "Sample";
    case "SCRATCH":
      return "Scratch";
    case "INSTRUMENT":
      return "Instrument";
    case "GUITAR":
      return "Gitara";
    case "FX":
      return "FX";
    case "BUS":
      return "Bus";
    default:
      return "Ścieżka";
  }
}
