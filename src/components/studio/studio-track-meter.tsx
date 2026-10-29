"use client";

import { useTranslations } from "next-intl";

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
  const t = useTranslations("studio.studioTrackMeter");
  return (
    <StudioPeakMeter
      snapshot={snapshot}
      title={t("miernikSciezki")}
      ariaLabel={t("poziomSciezkiSamplePeak", { v0: trackName })}
      testIdPrefix="studio-track-meter"
    />
  );
}
