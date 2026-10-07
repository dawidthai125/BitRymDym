"use client";

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
  return (
    <StudioPeakMeter
      snapshot={snapshot}
      title="Miernik Master"
      ariaLabel="Poziom Master (sample peak)"
      testIdPrefix="studio-master-meter"
    />
  );
}
