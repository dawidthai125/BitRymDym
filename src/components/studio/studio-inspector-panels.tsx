"use client";

/**
 * Inspector panels for the Studio editor: track panel, clip edit panel and live meters
 * (moved out of studio-editor.tsx, audit 2026-11-21). Presentation only — state lives in the editor.
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { StudioMasterMeter } from "@/components/studio/studio-master-meter";
import { StudioMixControl } from "@/components/studio/studio-mix-control";
import { StudioToggleChip } from "@/components/studio/studio-toggle-chip";
import { StudioTrackMeter } from "@/components/studio/studio-track-meter";
import {
  useStudioTransportMeters,
  useStudioTransportPlayhead,
} from "@/components/studio/studio-transport-provider";
import { Button } from "@/components/ui/button";
import { STUDIO_TRACK_NAME_MAX_LENGTH } from "@/config/studio";
import { useLibText } from "@/i18n/use-lib-text";
import { studioClipFadesOverlapHint } from "@/lib/studio/studio-clip-fade";
import { STUDIO_CLIP_GAIN_DB_MAX, STUDIO_CLIP_GAIN_DB_MIN } from "@/lib/studio/studio-clip-mix";
import { studioFxEntryLabel } from "@/lib/studio/studio-fx-chain";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import { formatStudioTrackCapacityLabel } from "@/lib/studio/studio-track-capacity";
import type { StudioClipDto, StudioTrackDto } from "@/lib/studio/studio-types";
import { labelStudioTrackType } from "@/lib/ui/labels";

/** Track name: saved on Enter or when the field loses focus, Escape brings the old name back. */
export function TrackNameField({
  name,
  disabled = false,
  onRename,
}: {
  name: string;
  disabled?: boolean;
  onRename: (name: string) => void;
}) {
  const tr = useTranslations("studio.studioEditor");
  const [draft, setDraft] = useState(name);
  const cancelledRef = useRef(false);
  return (
    <input
      type="text"
      value={draft}
      maxLength={STUDIO_TRACK_NAME_MAX_LENGTH}
      disabled={disabled}
      aria-label={tr("nazwaSciezki")}
      data-testid="studio-track-name-field"
      className="min-h-11 w-full min-w-0 rounded border border-[var(--brd-line)] px-2 text-sm font-medium"
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelledRef.current = true;
          setDraft(name);
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (cancelledRef.current) {
          cancelledRef.current = false;
          return;
        }
        const next = draft.trim();
        if (next && next !== name) onRename(next);
        else setDraft(name);
      }}
    />
  );
}

export function TrackInspectorPanel({
  track,
  trackCount,
  maxTracks,
  onOpenEffects,
  onOpenRecord,
  onRename,
  disabled = false,
}: {
  track: StudioTrackDto;
  trackCount: number;
  maxTracks: number;
  onOpenEffects: () => void;
  onOpenRecord: () => void;
  onRename?: (name: string) => void;
  disabled?: boolean;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const isBeat = track.trackType === "BEAT";
  return (
    <div className="space-y-3" data-testid="studio-inspector-track">
      <div className="space-y-1">
        {isBeat || !onRename ? (
          <p className="text-sm font-medium text-[var(--brd-ink)]">{tl(track.name)}</p>
        ) : (
          <TrackNameField key={`${track.id}:${track.name}`} name={track.name} disabled={disabled} onRename={onRename} />
        )}
        <p className="text-xs text-[var(--brd-mute)]">
          {tl(labelStudioTrackType(track.trackType))}
          {tl(isBeat ? tr("bitProjektuChroniony") : "")}
        </p>
        <p className="font-mono text-xs tabular-nums text-[var(--brd-mute)]">
          {tl(formatStudioTrackCapacityLabel(trackCount, maxTracks))}
        </p>
      </div>

      <div
        className="space-y-1 rounded border border-[var(--brd-line)] p-2 text-xs text-[var(--brd-mute)]"
        aria-label={tr("stanSciezkiSkrot")}
      >
        <p>
          M: {tl(track.muted ? "wyciszona" : "otwarta")} · S:{" "}
          {tl(track.solo ? "solo" : "—")} · R:{" "}
          {tl(track.recordArmed ? "uzbrojona" : "—")}
        </p>
        <p className="font-mono tabular-nums">
          {tr("gain")}{" "}{tl(track.gainDb.toFixed(1))} {tr("dbPan")}{" "}{tl(track.pan.toFixed(2))}
        </p>
        <p>
          {tr("mSRVol")}
        </p>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 w-full"
        aria-label={tr("efektySciezki", { v0: track.name })}
        data-testid="studio-inspector-track-fx"
        onClick={onOpenEffects}
      >
        {tl(studioFxEntryLabel(track.effectsChain))}
      </Button>

      {!isBeat ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 w-full"
          onClick={onOpenRecord}
        >
          {tr("nagrajNaTejSciezce")}
        </Button>
      ) : null}
    </div>
  );
}

const START_COMMIT_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

export function ClipEditPanel({
  clip,
  playheadMs,
  timelineLengthMs,
  pending,
  confirmDelete,
  onConfirmDeleteChange,
  onClearSelection,
  onSaveFades,
  onSaveGain,
  onFlushPersist,
  onMarkDirty,
  onClearDirty,
  onSaveMute,
  onMove,
  onTrimLeftToPlayhead,
  onTrimRightToPlayhead,
  onSplit,
  onDuplicate,
  onDelete,
}: {
  clip: StudioClipDto | null;
  playheadMs: number;
  timelineLengthMs: number;
  pending: boolean;
  confirmDelete: boolean;
  onConfirmDeleteChange: (next: boolean) => void;
  onClearSelection: () => void;
  onSaveFades: (fadeInMs: number, fadeOutMs: number) => void;
  onSaveGain: (gainDb: number) => void;
  onFlushPersist: () => void;
  onMarkDirty: () => void;
  /** The slider came back to the saved value: nothing to save. */
  onClearDirty?: () => void;
  onSaveMute: (muted: boolean) => void;
  onMove: (timelineStartMs: number) => void;
  onTrimLeftToPlayhead: () => void;
  onTrimRightToPlayhead: () => void;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const [draftStartOf, setDraftStartOf] = useState<{ clipId: string; ms: number } | null>(null);
  const draftStart = draftStartOf && draftStartOf.clipId === clip?.id ? draftStartOf.ms : null;
  const fadeBaselineKey = clip
    ? `${clip.id}:${clip.fadeInMs}:${clip.fadeOutMs}`
    : "";
  const [fadeEdit, setFadeEdit] = useState<{
    baselineKey: string;
    fadeInMs: number;
    fadeOutMs: number;
  } | null>(null);
  const gainBaselineKey = clip ? `${clip.id}:${clip.gainDb}` : "";
  const [gainEdit, setGainEdit] = useState<{
    baselineKey: string;
    gainDb: number;
  } | null>(null);
  const maxStart = clip
    ? Math.max(0, timelineLengthMs - clip.durationMs)
    : 0;
  const startValue = clip
    ? (draftStart ?? Math.min(clip.timelineStartMs, maxStart))
    : 0;
  const activeFadeEdit =
    fadeEdit && fadeEdit.baselineKey === fadeBaselineKey ? fadeEdit : null;
  const draftFadeIn = activeFadeEdit?.fadeInMs ?? clip?.fadeInMs ?? 0;
  const draftFadeOut = activeFadeEdit?.fadeOutMs ?? clip?.fadeOutMs ?? 0;
  const activeGainEdit =
    gainEdit && gainEdit.baselineKey === gainBaselineKey ? gainEdit : null;
  const draftGainDb = activeGainEdit?.gainDb ?? clip?.gainDb ?? 0;

  if (!clip) {
    return (
      <div className="rounded border border-dashed border-[var(--brd-line)] p-3 text-sm text-[var(--brd-mute)]">
        {tr("wybierzKlipAbyEdytowac")}
      </div>
    );
  }

  const fadeMax = Math.max(0, clip.durationMs);
  const fadeDirty =
    draftFadeIn !== clip.fadeInMs || draftFadeOut !== clip.fadeOutMs;
  const gainDirty = draftGainDb !== clip.gainDb;
  const fadeOverlapHint = studioClipFadesOverlapHint(
    draftFadeIn,
    draftFadeOut,
    clip.durationMs,
  );

  function commitStart() {
    if (!clip || draftStart === null) return;
    setDraftStartOf(null);
    if (draftStart !== clip.timelineStartMs) onMove(draftStart);
  }

  function setDraftFadeIn(next: number) {
    setFadeEdit({
      baselineKey: fadeBaselineKey,
      fadeInMs: next,
      fadeOutMs: draftFadeOut,
    });
  }

  function setDraftFadeOut(next: number) {
    setFadeEdit({
      baselineKey: fadeBaselineKey,
      fadeInMs: draftFadeIn,
      fadeOutMs: next,
    });
  }

  function setDraftGainDb(next: number) {
    setGainEdit({
      baselineKey: gainBaselineKey,
      gainDb: next,
    });
  }

  return (
    <div
      className="min-w-0 space-y-3 rounded border border-[var(--brd-line)] bg-[var(--brd-bg)] p-3"
      data-testid="studio-inspector-clip"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--brd-ink)]">
            {tr("zaznaczonyKlipStart")}{" "}{tl(formatStudioTimeMs(startValue))} {tr("dlugosc")}{" "}
            {tl(formatStudioTimeMs(clip.durationMs))}
          </p>
          <p className="text-xs text-[var(--brd-mute)]">
            {tr("playhead")}{" "}{tl(formatStudioTimeMs(playheadMs))} {tr("offsetZrodla")}{" "}
            {tl(formatStudioTimeMs(clip.sourceOffsetMs))}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11"
          disabled={pending}
          onClick={onClearSelection}
        >
          {tr("odznacz")}
        </Button>
      </div>

      <div
        className="space-y-1 rounded border border-dashed border-[var(--brd-line)] p-2 text-xs text-[var(--brd-mute)]"
        data-testid="studio-inspector-clip-source"
        aria-label={tr("zrodloPlikuTylkoOdczyt")}
      >
        <p className="font-medium text-[var(--brd-ink)]">{tr("zrodloPlik")}</p>
        <p>{tr("rodzaj")}{" "}{tr(clip.sourceKind === "BEAT_REF" ? "rodzajBit" : "rodzajNagranie")}</p>
        <p className="font-mono tabular-nums">
          {tr("offsetZrodla2")}{" "}{tl(formatStudioTimeMs(clip.sourceOffsetMs))}
        </p>
        <p>{tr("takeBitJestNiemodyfikowalny")}</p>
      </div>

      <div
        className="min-w-0 space-y-2 border-b border-[var(--brd-line)] pb-3"
        aria-label={tr("glosnoscIWyciszenieKlipu")}
      >
        <p className="text-xs font-medium text-[var(--brd-ink)]">
          {tr("glosnoscKlipu")}
        </p>
        <StudioMixControl
          label={tr("gain")}
          ariaLabel={tr("glosnoscKlipu2")}
          value={draftGainDb}
          display={tr("db", { v0: draftGainDb.toFixed(1) })}
          min={STUDIO_CLIP_GAIN_DB_MIN}
          max={STUDIO_CLIP_GAIN_DB_MAX}
          step={0.5}
          disabled={pending}
          onLocalChange={(next) => {
            setDraftGainDb(next);
            onMarkDirty();
          }}
          onCommit={(next) => {
            setDraftGainDb(next);
            if (clip && next !== clip.gainDb) onSaveGain(next);
            else onClearDirty?.();
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 w-full min-w-0 sm:w-auto"
          disabled={pending || !gainDirty}
          onClick={() => {
            onSaveGain(draftGainDb);
            onFlushPersist();
          }}
          aria-label={tr("zapiszTerazGlosnoscKlipu")}
        >
          {tr("zapiszTeraz")}
        </Button>
        <StudioToggleChip
          active={clip.muted}
          label={tr("wyciszKlip")}
          title={tr("wyciszTenKlipTake")}
          disabled={pending}
          onClick={() => onSaveMute(!clip.muted)}
        />
      </div>

      <label className="block min-w-0 text-xs text-[var(--brd-mute)]">
        {tr("przesunPozycjaStartu")}
        <input
          type="range"
          min={0}
          max={maxStart}
          step={1}
          value={startValue}
          className="mt-1 h-11 w-full min-w-0"
          aria-label={tr("przesunKlip")}
          disabled={pending}
          onChange={(e) => setDraftStartOf({ clipId: clip.id, ms: Number(e.target.value) })}
          onPointerUp={commitStart}
          onBlur={commitStart}
          onKeyUp={(e) => {
            if (START_COMMIT_KEYS.has(e.key)) commitStart();
          }}
        />
      </label>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onTrimLeftToPlayhead}
          title={tr("przytnijPoczatekDoPlayhead")}
        >
          {tr("przytnijPoczatek")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onTrimRightToPlayhead}
          title={tr("przytnijKoniecDoPlayhead")}
        >
          {tr("przytnijKoniec")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onSplit}
          title={tr("podzielWPlayhead")}
        >
          {tr("podziel")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onDuplicate}
          title={tr("powielKlipToSamo")}
          aria-label={tr("powielKlip")}
        >
          {tr("powiel")}
        </Button>
        {!confirmDelete ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => onConfirmDeleteChange(true)}
            title={tr("usunKlipZOsi")}
          >
            {tr("usun")}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              onClick={onDelete}
              title={tr("potwierdzUsuniecieKlipu")}
            >
              {tr("potwierdzUsuniecie")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={pending}
              onClick={() => onConfirmDeleteChange(false)}
            >
              {tr("anuluj")}
            </Button>
          </>
        )}
      </div>
      {confirmDelete ? (
        <p className="text-xs text-destructive" role="status">
          {tr("usuniecieDotyczyTylkoKlipu")}
        </p>
      ) : null}

      <div
        className="min-w-0 space-y-2 border-t border-[var(--brd-line)] pt-3"
        aria-label={tr("fadeKlipu")}
      >
        <p className="text-xs font-medium text-[var(--brd-ink)]">{tr("fade")}</p>
        <p className="text-xs text-[var(--brd-mute)]">
          {tr("aktualnieFadeIn")}{" "}{tl(formatStudioTimeMs(clip.fadeInMs))} {tr("fadeOut")}{" "}
          {tl(formatStudioTimeMs(clip.fadeOutMs))}
        </p>
        <StudioMixControl
          label={tr("fadeIn")}
          ariaLabel={tr("fadeIn2")}
          value={draftFadeIn}
          display={formatStudioTimeMs(draftFadeIn)}
          min={0}
          max={fadeMax}
          step={1}
          disabled={pending}
          onLocalChange={(next) => {
            setDraftFadeIn(next);
            onMarkDirty();
          }}
          onCommit={(next) => {
            setDraftFadeIn(next);
            if (clip && (next !== clip.fadeInMs || draftFadeOut !== clip.fadeOutMs)) {
              onSaveFades(next, draftFadeOut);
            } else onClearDirty?.();
          }}
        />
        <StudioMixControl
          label={tr("fadeOut2")}
          ariaLabel={tr("fadeOut3")}
          value={draftFadeOut}
          display={formatStudioTimeMs(draftFadeOut)}
          min={0}
          max={fadeMax}
          step={1}
          disabled={pending}
          onLocalChange={(next) => {
            setDraftFadeOut(next);
            onMarkDirty();
          }}
          onCommit={(next) => {
            setDraftFadeOut(next);
            if (clip && (draftFadeIn !== clip.fadeInMs || next !== clip.fadeOutMs)) {
              onSaveFades(draftFadeIn, next);
            } else onClearDirty?.();
          }}
        />
        {fadeOverlapHint ? (
          <p className="text-xs text-[var(--brd-mute)]" role="status">
            {tr("sumaFadeInI")}
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 w-full min-w-0 sm:w-auto"
          disabled={pending || !fadeDirty}
          onClick={() => {
            onSaveFades(draftFadeIn, draftFadeOut);
            onFlushPersist();
          }}
          aria-label={tr("zapiszTerazFade")}
        >
          {tr("zapiszTeraz")}
        </Button>
      </div>
    </div>
  );
}

/** Phase 7.1.5.1 — meter leaf (avoids Inner subscription to meter ticks). */
export function StudioMasterMeterLive() {
  const { meter } = useStudioTransportMeters();
  return <StudioMasterMeter snapshot={meter} />;
}

export function StudioTrackMeterLive({ trackName }: { trackName: string }) {
  const { trackMeter } = useStudioTransportMeters();
  return <StudioTrackMeter snapshot={trackMeter} trackName={trackName} />;
}

export function ClipEditPanelPlayheadBound(
  props: Omit<Parameters<typeof ClipEditPanel>[0], "playheadMs">,
) {
  const { playheadMs } = useStudioTransportPlayhead();
  return <ClipEditPanel {...props} playheadMs={playheadMs} />;
}
