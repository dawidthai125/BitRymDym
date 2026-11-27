/**
 * Presentational Studio timeline toolbar (hit-area ≥44×44 via min-h-11 min-w-11).
 * Only what works on the timeline itself: the edit toggle (off = tapping moves the playhead) and zoom. Everything else lives in the five groups.
 */
"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { STUDIO_SNAP_PRESET_ORDER, studioSnapPresetLabel, type StudioSnapPreset } from "@/lib/studio/studio-timeline-view";

export type StudioEditToolbarTimelineMode = "seek" | "edit";

export type StudioEditToolbarProps = {
  timelineMode: StudioEditToolbarTimelineMode;
  recordingLocked: boolean;
  onSeekMode: () => void;
  onEditMode: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  snapPreset?: StudioSnapPreset;
  onSnapPreset?: (preset: StudioSnapPreset) => void;
  lowTracks?: boolean;
  onToggleTrackHeight?: () => void;
  mixerOpen?: boolean;
  onToggleMixer?: () => void;
};

export function StudioEditToolbar(props: StudioEditToolbarProps) {
  const t = useTranslations("studio.studioEditToolbar");

  return (
    <div
      className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1"
      role="toolbar"
      aria-label={t("edycjaOsiCzasu")}
      data-testid="studio-edit-toolbar"
    >
      {props.onSnapPreset ? (
        <label className="flex min-h-11 items-center gap-1 text-[11px] text-[var(--brd-mute)]" title={t("siatkaOpis")}>
          <span className="sr-only">{t("siatka")}</span>
          <select
            className="min-h-11 rounded-sm border border-[var(--brd-line)] bg-[var(--brd-paper)] px-1 text-xs font-semibold text-[var(--brd-ink)]"
            value={props.snapPreset ?? "off"}
            data-testid="studio-toolbar-snap"
            onChange={(event) => {
              props.onSnapPreset!(event.target.value as StudioSnapPreset);
              event.target.blur();
            }}
          >
            {STUDIO_SNAP_PRESET_ORDER.map((preset) => (
              <option key={preset} value={preset}>
                {preset === "off"
                  ? t("siatkaWyl")
                  : preset === "beat"
                    ? t("siatkaUderzenie")
                    : preset === "bar"
                      ? t("siatkaTakt")
                      : studioSnapPresetLabel(preset)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {props.onToggleTrackHeight ? (
        <Button
          type="button"
          size="sm"
          variant={props.lowTracks ? "default" : "outline"}
          className="min-h-11 min-w-11 px-0 text-base"
          aria-pressed={Boolean(props.lowTracks)}
          aria-label={t("niskieSciezki")}
          title={t("niskieSciezkiOpis")}
          data-testid="studio-toolbar-track-height"
          onClick={props.onToggleTrackHeight}
        >
          <span aria-hidden="true">↕</span>
        </Button>
      ) : null}
      {props.onToggleMixer ? (
        <Button
          type="button"
          size="sm"
          variant={props.mixerOpen ? "default" : "outline"}
          className="min-h-11 min-w-11 px-2"
          aria-pressed={Boolean(props.mixerOpen)}
          title={t("mikserOpis")}
          data-testid="studio-toolbar-mixer"
          onClick={props.onToggleMixer}
        >
          {t("mikser")}
        </Button>
      ) : null}
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
