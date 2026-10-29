"use client";


import { useTranslations } from "next-intl";

import { StudioPeakMeter } from "@/components/studio/studio-peak-meter";
import type { StudioMeterSnapshot } from "@/lib/studio/studio-meter";

type StudioMasterMeterProps = {
  snapshot: StudioMeterSnapshot;
};

/**
 * P6.5 Master Peak meter — thin wrapper over shared StudioPeakMeter.
 * Receives runtime snapshots; never touches AnalyserNode.
 */
export function StudioMasterMeter({ snapshot }: StudioMasterMeterProps) {
  const t = useTranslations("studio.studioMasterMeter");
  return (
    <StudioPeakMeter
      snapshot={snapshot}
      title={t("miernikMaster")}
      ariaLabel={t("poziomMasterSamplePeak")}
      testIdPrefix="studio-master-meter"
    />
  );
}
