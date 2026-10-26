/**
 * Presentational Studio timeline edit toolbar (hit-area ≥44×44 via min-h-11 min-w-11).
 * No audio, persist, transport, or data fetching — callbacks + display props only.
 */
"use client";

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
      aria-label="Edycja osi czasu"
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
        Zaznacz
      </Button>
      <Button
        type="button"
        size="sm"
        variant={props.timelineMode === "edit" ? "default" : "outline"}
        className="min-h-11 min-w-11"
        disabled={props.recordingLocked}
        onClick={props.onEditMode}
      >
        Edycja
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 min-w-11"
        disabled={
          props.recordingLocked || props.pending || !props.hasSelectedClip
        }
        title="Podziel w playhead"
        onClick={props.onSplit}
      >
        Podziel
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 min-w-11"
        disabled={props.recordingLocked || !props.hasSelectedClip}
        title="Usuń klip"
        onClick={props.onDeleteClip}
      >
        Usuń
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
            ? "Osiągnięto limit ścieżek"
            : "Dodaj ścieżkę wokalną"
        }
        onClick={props.onAddTrack}
      >
        + Dodaj ścieżkę
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
        Inspector
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
        Mixer
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
        Więcej
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
          title={`Ścieżki ${formatStudioTrackCapacityLabel(props.trackCount, props.maxTracks)} (Bit liczony, Master nie)`}
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
            Zmień pakiet
          </Link>
        ) : null}
        {props.atTrackCapacity && props.premiumTier === "GOLD" ? (
          <span
            data-testid="studio-track-capacity-max"
            className="text-[10px] text-[var(--brd-mute)]"
          >
            Maksymalny limit ścieżek
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={props.snapPreset === "off" ? "outline" : "default"}
          className="min-h-11 min-w-11"
          aria-pressed={props.snapPreset !== "off"}
          title={`Snap: ${studioSnapPresetLabel(props.snapPreset)} (kliknij aby zmienić: OFF / 20 / 100 / 1000 ms)`}
          onClick={props.onSnapCycle}
        >
          Snap {studioSnapPresetLabel(props.snapPreset)}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 min-w-11"
          title="Pomniejsz oś czasu"
          onClick={props.onZoomOut}
        >
          zoom−
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 min-w-11"
          title="Powiększ oś czasu"
          onClick={props.onZoomIn}
        >
          zoom+
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 min-w-11"
          title="Dopasuj oś czasu do szerokości"
          onClick={props.onFit}
        >
          Fit
        </Button>
      </div>
    </div>
  );
}
