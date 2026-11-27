/**
 * Presentational Studio timeline toolbar (hit-area ≥44×44 via min-h-11 min-w-11).
 * Only what works on the timeline itself: the edit toggle (off = tapping moves the playhead) and zoom. Everything else lives in the five groups.
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
      className="ml-auto flex shrink-0 items-center gap-1"
      role="toolbar"
      aria-label={t("edycjaOsiCzasu")}
      data-testid="studio-edit-toolbar"
    >
      <Button
        type="button"
        size="sm"
        variant={props.timelineMode === "edit" ? "default" : "outline"}
        className="min-h-11 min-w-11"
        aria-pressed={props.timelineMode === "edit"}
        disabled={props.recordingLocked}
        title={t("edycjaOpis")}
        onClick={props.timelineMode === "edit" ? props.onSeekMode : props.onEditMode}
      >
        {t("edycja")}
      </Button>
      <div className="flex shrink-0 items-center gap-1" data-testid="studio-toolbar-zoom">
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
