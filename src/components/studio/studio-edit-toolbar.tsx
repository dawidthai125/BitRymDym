/**
 * Presentational Studio timeline edit toolbar (hit-area ≥44×44 via min-h-11 min-w-11).
 * No audio, persist, transport, or data fetching — callbacks + display props only.
 */
"use client";

import { useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  formatStudioTrackCapacityLabel,
  formatStudioTrackCapacityLabelCompact,
  STUDIO_TRACK_UPGRADE_HREF,
} from "@/lib/studio/studio-track-capacity";
import {
  studioSnapPresetLabel,
  type StudioSnapPreset,
} from "@/lib/studio/studio-timeline-view";
import type { PremiumTier } from "@/types/premium";

export type StudioEditToolbarTimelineMode = "seek" | "edit";

export type StudioEditToolbarProps = {
  timelineMode: StudioEditToolbarTimelineMode;
  recordingLocked: boolean;
  pending: boolean;
  hasSelectedClip: boolean;
  atTrackCapacity: boolean;
  showUpgradeCta: boolean;
  trackCount: number;
  maxTracks: number;
  premiumTier: PremiumTier;
  inspectorOverlayOpen: boolean;
  inspectorPanelId: string;
  mixerOpen: boolean;
  mixerPanelId: string;
  snapPreset: StudioSnapPreset;
  onSeekMode: () => void;
  onEditMode: () => void;
  onSplit: () => void;
  onDeleteClip: () => void;
  onAddTrack: () => void;
  onToggleInspector: () => void;
  onToggleMixer: () => void;
  onSnapCycle: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
};

export function StudioEditToolbar(props: StudioEditToolbarProps) {
  const t = useTranslations("studio.studioEditToolbar");
  const [toolbarMoreOpen, setToolbarMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!toolbarMoreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setToolbarMoreOpen(false);
      moreButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toolbarMoreOpen]);

  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b border-[var(--brd-line)] bg-[var(--brd-paper)] px-0.5 py-1"
      role="toolbar"
      aria-label={t("edycjaOsiCzasu")}
      data-testid="studio-edit-toolbar"
    >
      <Button
        type="button"
        size="sm"
        variant={props.timelineMode === "seek" ? "default" : "outline"}
        className="min-h-11 min-w-11"
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
        disabled={props.recordingLocked}
        onClick={props.onEditMode}
      >
        {t("edycja")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 min-w-11"
        disabled={
          props.recordingLocked || props.pending || !props.hasSelectedClip
        }
        title={t("podzielWPlayhead")}
        onClick={props.onSplit}
      >
        {t("podziel")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 min-w-11"
        disabled={props.recordingLocked || !props.hasSelectedClip}
        title={t("usunKlip")}
        onClick={props.onDeleteClip}
      >
        {t("usun")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 min-w-11"
        data-testid="studio-add-track"
        disabled={
          props.recordingLocked || props.pending || props.atTrackCapacity
        }
        title={
          props.atTrackCapacity
            ? t("osiagnietoLimitSciezek")
            : t("dodajSciezkeWokalna")
        }
        onClick={props.onAddTrack}
      >
        {t("dodajSciezke")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 min-w-11 xl:hidden"
        aria-expanded={props.inspectorOverlayOpen}
        aria-controls={props.inspectorPanelId}
        onClick={props.onToggleInspector}
      >
        {t("inspector")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={props.mixerOpen ? "default" : "outline"}
        className="min-h-11 min-w-11"
        aria-pressed={props.mixerOpen}
        aria-expanded={props.mixerOpen}
        aria-controls={props.mixerPanelId}
        onClick={props.onToggleMixer}
      >
        {t("mixer")}
      </Button>
      <Button
        ref={moreButtonRef}
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 min-w-11 md:hidden"
        data-testid="studio-toolbar-more"
        aria-expanded={toolbarMoreOpen}
        aria-controls="studio-toolbar-overflow"
        onClick={() => setToolbarMoreOpen((v) => !v)}
      >
        {t("wiecej")}
      </Button>
      <div
        id="studio-toolbar-overflow"
        data-testid="studio-toolbar-overflow"
        className={`flex flex-wrap items-center gap-2 ${
          toolbarMoreOpen ? "flex w-full" : "hidden"
        } md:contents`}
      >
        <span
          data-testid="studio-track-capacity"
          data-track-count={props.trackCount}
          data-max-tracks={props.maxTracks}
          data-premium-tier={props.premiumTier}
          className="inline-flex min-h-11 items-center gap-1 px-1 font-mono text-xs text-[var(--brd-ink)]"
          title={t("sciezkiBitLiczonyMaster", { v0: formatStudioTrackCapacityLabel(props.trackCount, props.maxTracks) })}
        >
          <span className="hidden sm:inline">
            {formatStudioTrackCapacityLabel(props.trackCount, props.maxTracks)}
          </span>
          <span className="sm:hidden">
            {formatStudioTrackCapacityLabelCompact(
              props.trackCount,
              props.maxTracks,
            )}
          </span>
        </span>
        {props.showUpgradeCta ? (
          <Link
            href={STUDIO_TRACK_UPGRADE_HREF}
            data-testid="studio-track-upgrade-cta"
            className="inline-flex min-h-11 min-w-11 items-center rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 text-xs font-medium text-[var(--brd-green)] hover:bg-[var(--brd-bg)]"
          >
            {t("zmienPakiet")}
          </Link>
        ) : null}
        {props.atTrackCapacity && props.premiumTier === "GOLD" ? (
          <span
            data-testid="studio-track-capacity-max"
            className="text-[10px] text-[var(--brd-mute)]"
          >
            {t("maksymalnyLimitSciezek")}
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={props.snapPreset === "off" ? "outline" : "default"}
          className="min-h-11 min-w-11"
          aria-pressed={props.snapPreset !== "off"}
          title={t("snapKliknijAbyZmienic", { v0: (props.snapPreset === "off" ? t("snapOff") : studioSnapPresetLabel(props.snapPreset)) })}
          onClick={props.onSnapCycle}
        >
          {t("snap")}{" "}{(props.snapPreset === "off" ? t("snapOff") : studioSnapPresetLabel(props.snapPreset))}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 min-w-11"
          title={t("pomniejszOsCzasu")}
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
