"use client";

import { useEffect } from "react";

import { publishPocketMarkers } from "@/lib/studio/mix-analysis/pocket-worklet";

type Marker = { kind: string; positionMs: number };

/**
 * Verse / hook points for the live rap pocket. The timeline and the Mix step both publish them, so
 * every step plays what the WAV export writes. Nothing is cleared on unmount: the next step publishes
 * its own list, also an empty one.
 */
export function usePocketMarkers(markers: readonly Marker[] | null | undefined): void {
  useEffect(() => {
    try {
      publishPocketMarkers(markers ?? []);
    } catch {
      /* a marker must not break the step */
    }
  }, [markers]);
}
