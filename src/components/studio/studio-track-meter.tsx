"use client";

import { StudioPeakMeter } from "@/components/studio/studio-peak-meter";
import type { StudioMeterSnapshot } from "@/lib/studio/studio-meter";

type StudioTrackMeterProps = {
  snapshot: StudioMeterSnapshot;
  trackName: string;
};

/**
 * P6.6.2 selected-Track Peak meter — shared presentation with Master.
 * On-demand only; parent renders when a Mix track is selected.
 * Snapshot-only — no Web Audio nodes or rAF loops in UI.
 */
export function StudioTrackMeter({
  snapshot,
  trackName,
}: StudioTrackMeterProps) {
  return (
    <StudioPeakMeter
      snapshot={snapshot}
      title="Miernik ścieżki"
      ariaLabel={`Poziom ścieżki ${trackName} (sample peak)`}
      testIdPrefix="studio-track-meter"
    />
  );
}
