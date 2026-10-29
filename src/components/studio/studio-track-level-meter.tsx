"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { useStudioTransportControls } from "@/components/studio/studio-transport-provider";
import type { StudioTrackLevelSnapshot } from "@/lib/studio/studio-meter";

/**
 * Stage 0 — compact per-track level meter for the track header.
 * Reads the engine's shared meter tick (no own rAF); styles are written via
 * refs so only this leaf updates. Metering is retained only while the meter is
 * on screen (IntersectionObserver) — off-screen headers cost zero analysers.
 */
export function StudioTrackLevelMeter({ trackId }: { trackId: string }) {
  const t = useTranslations("studio.studioTrackMeter");
  const { retainTrackLevels, subscribeTrackLevels } = useStudioTransportControls();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const holdRef = useRef<HTMLDivElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let release: (() => void) | null = null;
    const setVisible = (visible: boolean) => {
      if (visible && !release) release = retainTrackLevels();
      else if (!visible && release) {
        release();
        release = null;
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return () => setVisible(false);
    }
    const io = new IntersectionObserver((entries) => {
      setVisible(entries.some((e) => e.isIntersecting));
    });
    io.observe(el);
    return () => {
      io.disconnect();
      setVisible(false);
    };
  }, [retainTrackLevels]);

  useEffect(() => {
    const paint = (level: StudioTrackLevelSnapshot | undefined) => {
      const peak = level?.peak ?? 0;
      const hold = level?.hold ?? 0;
      const clipping = level?.clipping ?? false;
      if (fillRef.current) fillRef.current.style.height = `${Math.round(peak * 100)}%`;
      if (holdRef.current) {
        holdRef.current.style.bottom = `${Math.round(hold * 100)}%`;
        holdRef.current.style.opacity = hold > 0.001 ? "1" : "0";
      }
      if (clipRef.current) clipRef.current.dataset.clipping = clipping ? "true" : "false";
      rootRef.current?.setAttribute("data-clipping", clipping ? "true" : "false");
    };
    return subscribeTrackLevels((levels) => paint(levels.get(trackId)));
  }, [subscribeTrackLevels, trackId]);

  return (
    <div
      ref={rootRef}
      className="studio-track-level pointer-events-none flex h-full w-1.5 shrink-0 flex-col gap-px"
      role="img"
      aria-label={t("poziomSciezkiNaZywo")}
      data-testid="studio-track-level-meter"
      data-track-id={trackId}
      data-clipping="false"
    >
      <div
        ref={clipRef}
        className="studio-track-level-clip h-1 w-full shrink-0 rounded-[1px]"
        data-clipping="false"
        data-testid="studio-track-level-clip"
      />
      <div className="studio-track-level-well relative w-full flex-1 overflow-hidden rounded-[1px]">
        <div
          ref={fillRef}
          className="studio-track-level-fill absolute inset-x-0 bottom-0"
          style={{ height: "0%" }}
        />
        <div
          ref={holdRef}
          className="studio-track-level-hold absolute inset-x-0 h-px"
          style={{ bottom: "0%", opacity: 0 }}
          data-testid="studio-track-level-hold"
        />
      </div>
    </div>
  );
}
