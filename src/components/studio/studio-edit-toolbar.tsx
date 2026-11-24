/**
 * Presentational Studio timeline edit toolbar (hit-area ≥44×44 via min-h-11 min-w-11).
 * No audio, persist, transport, or data fetching — callbacks + display props only.
 */
"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/ui/app-link";

import { LockedAction } from "@/components/plans/locked-action";
import { useStoreApp } from "@/components/site/store-app-context";
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

/** Plan that raises the recording-track limit (lock bubble). */
const NEXT_TIER: Record<PremiumTier, PremiumTier> = {
  FREE: "BRONZE",
  BRONZE: "SILVER",
  SILVER: "GOLD",
  GOLD: "GOLD",
};

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
  /**
   * When false, hide Podziel/Usuń here — record step already has them on the fragment strip.
   * Mix/Master keep them (default true).
   */
  showClipMutations?: boolean;
  onAddTrack: () => void;
  onToggleInspector: () => void;
  onToggleMixer: () => void;
  onSnapCycle: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
};

export function StudioEditToolbar(props: StudioEditToolbarProps) {
  const tl = useLibText();
  const t = useTranslations("studio.studioEditToolbar");
  // Store app: no "change plan" link.
  const storeApp = useStoreApp();
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
      className="flex flex-wrap items-center gap-1 border-b border-[var(--brd-line)] bg-[var(--brd-paper)] px-0.5 py-1 max-sm:gap-0.5 max-sm:[&_button]:px-1.5 max-sm:[&_button]:text-[11px] max-[389px]:[&_button]:px-1 max-[389px]:[&_button]:text-[10px]"
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
      {props.showClipMutations !== false ? (
        <>
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
            className="min-h-11 min-w-11 studio-tool-danger"
            disabled={props.recordingLocked || !props.hasSelectedClip}
            title={t("usunKlip")}
            onClick={props.onDeleteClip}
          >
            {t("usun")}
          </Button>
        </>
      ) : null}
      {props.atTrackCapacity && props.premiumTier !== "GOLD" ? (
        // Plan lock with a bubble (hover/focus/tap) → plans; server enforces too.
        <LockedAction
          reason="plan"
          action="track"
          minTier={NEXT_TIER[props.premiumTier]}
          testId="studio-add-track"
          buttonClassName="px-3"
          dataAttrs={{ "data-capacity": "full" }}
        >
          <span className="max-sm:hidden">{t("dodajSciezke")}</span>
          <span className="sm:hidden">{t("dodajSciezkeKrotko")}</span>
        </LockedAction>
      ) : (
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
          tl(props.atTrackCapacity
            ? t("osiagnietoLimitSciezek")
            : t("dodajSciezkeWokalna"))
        }
        onClick={props.onAddTrack}
      >
        <span className="max-sm:hidden">{t("dodajSciezke")}</span>
        <span className="sm:hidden">{t("dodajSciezkeKrotko")}</span>
      </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 min-w-11 xl:hidden max-sm:data-[more=false]:hidden"
        data-more={toolbarMoreOpen}
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
            {tl(formatStudioTrackCapacityLabel(props.trackCount, props.maxTracks))}
          </span>
          <span className="sm:hidden">
            {tl(formatStudioTrackCapacityLabelCompact(
              props.trackCount,
              props.maxTracks,
            ))}
          </span>
        </span>
        {props.showUpgradeCta && !storeApp ? (
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
          {t("snap")}{" "}{tl((props.snapPreset === "off" ? t("snapOff") : studioSnapPresetLabel(props.snapPreset)))}
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
