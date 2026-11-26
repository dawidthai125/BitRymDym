/**
 * Presentational Studio timeline toolbar (hit-area ≥44×44 via min-h-11 min-w-11).
 * Only what works on the timeline itself: mode and zoom. Everything else lives in the five groups.
 */
"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export type StudioEditToolbarTimelineMode = "seek" | "edit";

export type StudioEditToolbarProps = {
  timelineMode: StudioEditToolbarTimelineMode;
  recordingLocked: boolean;
  onSeekMode: () => void;
  onEditMode: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
};

export function StudioEditToolbar(props: StudioEditToolbarProps) {
  const t = useTranslations("studio.studioEditToolbar");

  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b border-[var(--brd-line)] bg-[var(--brd-paper)] px-0.5 py-1 max-sm:gap-0.5 max-sm:[&_button]:px-1.5 max-sm:[&_button]:text-[11px]"
      role="toolbar"
      aria-label={t("edycjaOsiCzasu")}
      data-testid="studio-edit-toolbar"
    >
      <Button
        type="button"
        size="sm"
        variant={props.timelineMode === "seek" ? "default" : "outline"}
        className="min-h-11 min-w-11"
        aria-pressed={props.timelineMode === "seek"}
        disabled={props.recordingLocked}
        onClick={props.onSeekMode}
      >
        {t("zaznacz")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={props.timelineMode === "edit" ? "default" : "outline"}
        className="min-h-11 min-w-11"
        aria-pressed={props.timelineMode === "edit"}
        disabled={props.recordingLocked}
        onClick={props.onEditMode}
      >
        {t("edycja")}
      </Button>
      <div className="ml-auto flex shrink-0 items-center gap-1" data-testid="studio-toolbar-zoom">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 min-w-11"
          title={t("pomniejszOsCzasu")}
          aria-label={t("pomniejszOsCzasu")}
          onClick={props.onZoomOut}
        >
          {t("zoom")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 min-w-11"
          title={t("powiekszOsCzasu")}
          aria-label={t("powiekszOsCzasu")}
          onClick={props.onZoomIn}
        >
          {t("zoom2")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 min-w-11"
          title={t("dopasujOsCzasuDo")}
          onClick={props.onFit}
        >
          {t("fit")}
        </Button>
      </div>
    </div>
  );
}
