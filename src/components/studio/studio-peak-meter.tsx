"use client";


import { useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";

import {
  peakToDbFs,
  type StudioMeterSnapshot,
} from "@/lib/studio/studio-meter";

/** Throttle screen-reader peak announcements (~1 Hz). */
const A11Y_PEAK_MS = 1000;

export type StudioPeakMeterProps = {
  snapshot: StudioMeterSnapshot;
  /** Visible title above the bar */
  title: string;
  /** Accessible name for the meter role */
  ariaLabel: string;
  /** Prefix for data-testid roots (e.g. studio-master-meter) */
  testIdPrefix: string;
};

/**
 * Shared Peak meter presentation (P6.5 Master / P6.6 Track).
 * DOM/CSS only — receives runtime snapshots; never touches AnalyserNode.
 */
export function StudioPeakMeter({
  snapshot,
  title,
  ariaLabel,
  testIdPrefix,
}: StudioPeakMeterProps) {
  const t = useTranslations("studio.studioPeakMeter");
  const peakPct = Math.round(Math.min(1, Math.max(0, snapshot.peak)) * 100);
  const dbLabel = peakToDbFs(snapshot.peak);
  const [a11yValueText, setA11yValueText] = useState(
    t("samplePeak2", { v0: dbLabel }),
  );
  const lastA11yMs = useRef(0);
  const lastClip = useRef(false);

  useEffect(() => {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const clipEdge = snapshot.clipping !== lastClip.current;
    lastClip.current = snapshot.clipping;
    if (!clipEdge && now - lastA11yMs.current < A11Y_PEAK_MS) return;
    lastA11yMs.current = now;
    setA11yValueText(
      snapshot.clipping
        ? t("samplePeakClipping", { v0: dbLabel })
        : t("samplePeak", { v0: dbLabel }),
    );
  }, [snapshot.peak, snapshot.clipping, dbLabel]);

  return (
    <div className="mt-3 min-w-0 space-y-1.5" data-testid={testIdPrefix}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-[var(--brd-mute)]">{title}</p>
        <p
          className="truncate text-xs tabular-nums text-[var(--brd-ink)]"
          data-testid={`${testIdPrefix}-peak`}
        >
          {dbLabel}
          <span className="ml-1 text-[var(--brd-mute)]">{t("peak")}</span>
        </p>
      </div>
      <div
        role="meter"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={peakPct}
        aria-valuetext={a11yValueText}
        className="studio-vu h-2.5 w-full min-w-0 overflow-hidden"
        data-testid={`${testIdPrefix}-bar`}
        data-clipping={snapshot.clipping ? "true" : "false"}
      >
        <div
          className="studio-vu-fill h-full transition-[clip-path] duration-75 ease-out"
          style={{ clipPath: `inset(0 ${100 - peakPct}% 0 0)` }}
        />
      </div>
      <p
        className={
          snapshot.clipping
            ? "text-xs font-medium text-[var(--brd-ink)]"
            : "text-xs text-[var(--brd-mute)]"
        }
        aria-live="polite"
        data-testid={`${testIdPrefix}-clip`}
        data-clipping={snapshot.clipping ? "true" : "false"}
      >
        {snapshot.clipping ? t("clipping") : t("bezClippingu")}
      </p>
    </div>
  );
}
