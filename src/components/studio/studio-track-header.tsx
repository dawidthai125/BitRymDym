"use client";

/**
 * Track header strip (name, M/S/R, role, reorder, menu, volume, pan, meter) — moved out of
 * studio-editor.tsx (audit 2026-11-21). Presentation only; state and persistence stay in the editor.
 */

import type { Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";

import {
  formatStudioPanShort,
  STUDIO_DAW_CHIP_CLASS,
  STUDIO_DAW_LANE_HEIGHT_PX,
  STUDIO_TRACK_EDGE,
  STUDIO_TRACK_GAIN_DB_MAX,
  STUDIO_TRACK_GAIN_DB_MIN,
} from "@/components/studio/studio-daw-layout";
import { StudioGlyph } from "@/components/studio/studio-glyphs";
import { StudioMixControl } from "@/components/studio/studio-mix-control";
import { StudioToggleChip } from "@/components/studio/studio-toggle-chip";
import { StudioTrackLevelMeter } from "@/components/studio/studio-track-level-meter";
import { Button } from "@/components/ui/button";
import { isStudioTrackRole, STUDIO_TRACK_ROLES } from "@/config/studio";
import { useLibText } from "@/i18n/use-lib-text";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import type { StudioProjectDocument, StudioTrackDto } from "@/lib/studio/studio-types";
import { labelStudioTrackType } from "@/lib/ui/labels";

type PatchTrack = (trackId: string, patch: Record<string, unknown>) => void;

export function StudioTrackHeader({
  track,
  index,
  isSelected,
  doc,
  beatTitle,
  timelineLengthMs,
  recordSimple,
  pending,
  recordingLocked,
  menuOpen,
  onSelect,
  onToggleMenu,
  patchTrack,
  onToggleFlag,
  reorder,
  setDoc,
}: {
  track: StudioTrackDto;
  index: number;
  isSelected: boolean;
  doc: StudioProjectDocument;
  beatTitle: string | null;
  timelineLengthMs: number;
  recordSimple: boolean;
  pending: boolean;
  recordingLocked: boolean;
  menuOpen: boolean;
  onSelect: (trackId: string | null) => void;
  onToggleMenu: () => void;
  patchTrack: PatchTrack;
  /** M / S / R: shown at once, then saved. */
  onToggleFlag: (trackId: string, flag: "muted" | "solo" | "recordArmed") => void;
  reorder: (trackId: string, direction: "up" | "down") => void;
  setDoc: Dispatch<SetStateAction<StudioProjectDocument>>;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const trRole = useTranslations("studio.trackRole");
  const isBeat = track.trackType === "BEAT";
  const typeLabel = labelStudioTrackType(track.trackType);
  return (
      <div
              data-testid="studio-track-header"
        data-track-id={track.id}
        data-track-type={track.trackType}
        data-track-role={track.trackRole}
        data-selected={isSelected ? "true" : "false"}
        className="studio-track-strip flex items-stretch gap-1 border py-1 pl-1.5 pr-1 max-sm:pr-14"
        style={{
          height: STUDIO_DAW_LANE_HEIGHT_PX,
          borderColor: isBeat ? "#b9761e" : STUDIO_TRACK_EDGE[Math.max(0, index - 1) % STUDIO_TRACK_EDGE.length],
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {/*
          Phone header is full width, so row 2 can be 44px.
          Do not put name + M/S/R + ↑↓⋮ on one row (6×44).
          Row1 = name + M/S/R; row2 = role + reorder/menu;
          row3 = Vol / Pan, value on the label row.
        */}
        <div className="flex min-h-11 items-center gap-0.5">
          <button
            type="button"
            className="min-h-11 min-w-[4.5rem] flex-1 overflow-hidden rounded-sm px-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brd-green)]"
            aria-pressed={isSelected}
            aria-label={
              tl(isSelected
                ? tr("odznaczSciezke", { v0: track.name })
                : tr("wybierzSciezke", { v0: track.name }))
            }
            data-testid="studio-track-header-select"
            title={track.name}
            onClick={() => onSelect(isSelected ? null : track.id)}
          >
            <span
              className="studio-track-name line-clamp-2 break-words text-[13px] font-medium leading-tight text-[var(--brd-ink)]"
              data-testid="studio-track-name"
            >
              {isBeat ? "BIT" : tl(track.name)}
            </span>
          </button>
          <StudioToggleChip
            active={track.muted}
            label="M"
            title={`${tr("wycisz")} · ${tl(track.name)}`}
            tone="mute"
            className={STUDIO_DAW_CHIP_CLASS}
            onClick={() => onToggleFlag(track.id, "muted")}
          />
          <StudioToggleChip
            active={track.solo}
            label="S"
            title={`${tr("solo")} · ${tl(track.name)}`}
            tone="solo"
            className={STUDIO_DAW_CHIP_CLASS}
            onClick={() => onToggleFlag(track.id, "solo")}
          />
          {isBeat ? null : (
          <StudioToggleChip
            active={track.recordArmed}
            label="R"
            title={`${tr("uzbrojenieNagrywania")} · ${tl(track.name)}`}
            tone="record"
            className={STUDIO_DAW_CHIP_CLASS}
            onClick={() => onToggleFlag(track.id, "recordArmed")}
          />
          )}
          {!isBeat ? (
            <span
              aria-hidden
              className="studio-track-swatch"
              style={{
                background: STUDIO_TRACK_EDGE[Math.max(0, index - 1) % STUDIO_TRACK_EDGE.length],
              }}
            />
          ) : null}
        </div>
        {isBeat ? (
          <p className="truncate px-1 text-[11px] leading-tight text-[var(--brd-ink-soft)]">
            {tl(beatTitle ?? track.name)} · {doc.project.tempoBpm} BPM ·{" "}
            {tl(
              formatStudioTimeMs(
                doc.clips
                  .filter((c) => c.trackId === track.id)
                  .reduce((end, c) => Math.max(end, c.timelineStartMs + c.durationMs), 0) || timelineLengthMs,
              ),
            )}
          </p>
        ) : null}
        {!recordSimple ? (
        <>
        <div className="flex min-h-11 min-w-0 items-center gap-0.5">
          <label
            className="studio-track-role relative flex h-11 min-w-0 flex-1 items-center"
            title={`${typeLabel} · ${trRole(track.trackRole)}`}
          >
            <span className="sr-only">
              {tr("rolaSciezki", { v0: track.name })}
            </span>
            <select
              className="studio-track-role-select h-11 w-full min-w-0 max-w-[11rem] cursor-pointer truncate rounded-sm text-[11px] font-semibold"
              value={track.trackRole}
              disabled={pending || recordingLocked}
              data-testid="studio-track-role"
              data-track-id={track.id}
              aria-label={tr("rolaSciezki", { v0: track.name })}
              onChange={(event) => {
                const next = event.target.value;
                if (!isStudioTrackRole(next) || next === track.trackRole) return;
                patchTrack(track.id, { trackRole: next });
              }}
            >
              {STUDIO_TRACK_ROLES.map((role) => (
                <option key={role} value={role}>
                  {trRole(role)}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-11 min-h-11 min-w-11 shrink-0 px-0 sm:w-7 sm:min-w-7"
            disabled={pending || index === 0}
            title={tr("przeniesWGore")}
            aria-label={tr("przeniesSciezkeWGore")}
            onClick={() => {
              reorder(track.id, "up");
            }}
          >
            <StudioGlyph name="up" className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-11 min-h-11 min-w-11 shrink-0 px-0 sm:w-7 sm:min-w-7"
            disabled={pending || index === doc.tracks.length - 1}
            title={tr("przeniesWDol")}
            aria-label={tr("przeniesSciezkeWDol")}
            onClick={() => {
              reorder(track.id, "down");
            }}
          >
            <StudioGlyph name="down" className="size-3.5" />
          </Button>
          {!isBeat ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-11 min-h-11 min-w-11 shrink-0 px-0 sm:w-7 sm:min-w-7"
              data-testid="studio-track-menu"
              data-track-id={track.id}
              disabled={recordingLocked || pending}
              title={tr("menuSciezki")}
              aria-label={tr("menuSciezki2", { v0: track.name })}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={onToggleMenu}
            >
              <StudioGlyph name="more" className="size-3.5" />
            </Button>
          ) : null}
        </div>
        <div className="flex min-h-0 items-center">
          <div
            className="grid min-w-0 flex-1 grid-cols-2 gap-2 pr-0.5"
            data-testid="studio-track-header-mix"
          >
          <StudioMixControl
            label={tr("dbEtykieta")}
            ariaLabel={tr("glosnoscSciezki", { v0: track.name })}
            value={track.gainDb}
            display={`${track.gainDb > 0 ? "+" : ""}${track.gainDb.toFixed(1)} dB`}
            min={STUDIO_TRACK_GAIN_DB_MIN}
            max={STUDIO_TRACK_GAIN_DB_MAX}
            step={0.5}
            stacked
            disabled={pending}
            onLocalChange={(gainDb) =>
              setDoc((prev) => ({
                ...prev,
                tracks: prev.tracks.map((t) =>
                  t.id === track.id ? { ...t, gainDb } : t,
                ),
              }))
            }
            onCommit={(gainDb) => {
              patchTrack(track.id, { gainDb });
            }}
          />
          <StudioMixControl
            label={tr("panEtykieta")}
            ariaLabel={tr("panoramaSciezki", { v0: track.name })}
            value={track.pan}
            display={formatStudioPanShort(track.pan, { center: tr("panSrodekKrotko"), left: tr("panLewoKrotko"), right: tr("panPrawoKrotko") })}
            min={-1}
            max={1}
            step={0.01}
            stacked
            disabled={pending}
            onLocalChange={(pan) =>
              setDoc((prev) => ({
                ...prev,
                tracks: prev.tracks.map((t) =>
                  t.id === track.id ? { ...t, pan } : t,
                ),
              }))
            }
            onCommit={(pan) => {
              patchTrack(track.id, { pan });
            }}
          />
          </div>
        </div>
        </>
        ) : null}
        </div>
        <StudioTrackLevelMeter trackId={track.id} />
      </div>
  );
}
