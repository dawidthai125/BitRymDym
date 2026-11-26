"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type StudioFragmentToolsProps = {
  enabled: boolean;
  pending: boolean;
  confirmDelete: boolean;
  onSplit: () => void;
  onTrimStart: () => void;
  onTrimEnd: () => void;
  onNudgeLeft: () => void;
  onNudgeRight: () => void;
  onDuplicate: () => void;
  onFadeIn: () => void;
  onFadeOut: () => void;
  reverseOn: boolean;
  onReverse: () => void;
  stretch?: number;
  pitchCents?: number;
  /** Non-zero pitch is Silver+. Tempo and a reset to 0 stay available. */
  pitchLocked?: boolean;
  onPlayback?: (next: { stretch: number; pitchCents: number }) => void;
  /** Clip gain (dB) — ride the selected fragment without opening the inspector. */
  gainDb?: number;
  onGain?: (gainDb: number) => void;
  onAskDelete: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  /** Opens the full clip panel (exact values, spectrogram). */
  onDetails?: () => void;
};

/** The one open row under the five main tools. */
type FragmentPanel = "trim" | "gain" | "more" | null;

const TEMPO_MIN = 0.5;
const TEMPO_MAX = 2;

/** Tempo on the slider (1.25 = faster) to the stored stretch ratio (0.8 = shorter). */
export function stretchFromTempo(tempo: number): number {
  const safe = Number.isFinite(tempo) && tempo > 0 ? tempo : 1;
  return Math.min(2, Math.max(0.5, Math.round((1 / safe) * 10_000) / 10_000));
}

const COMMIT_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/** Save after the mouse, a slider key or leaving the field, so keyboard changes are not lost. */
function commitHandlers(commit: () => void) {
  return {
    onPointerUp: commit,
    onBlur: commit,
    onKeyUp: (event: { key: string }) => {
      if (COMMIT_KEYS.has(event.key)) commit();
    },
  };
}

/**
 * Cut, move and delete the selected timeline fragment.
 * Presentational. The editor owns the clip and the undo.
 */
export function StudioFragmentTools({
  enabled,
  pending,
  confirmDelete,
  onSplit,
  onTrimStart,
  onTrimEnd,
  onNudgeLeft,
  onNudgeRight,
  onDuplicate,
  onFadeIn,
  onFadeOut,
  reverseOn,
  onReverse,
  stretch = 1,
  pitchCents = 0,
  pitchLocked = false,
  onPlayback,
  gainDb = 0,
  onGain,
  onAskDelete,
  onDelete,
  onCancelDelete,
  onDetails,
}: StudioFragmentToolsProps) {
  const t = useTranslations("studio.studioEditor");
  const locked = !enabled || pending;
  const [stretchLocal, setStretchLocal] = useState(stretch);
  const [pitchLocal, setPitchLocal] = useState(pitchCents);
  const [gainLocal, setGainLocal] = useState(gainDb);
  /** Trim, volume and the rarer tools open one at a time, so the tracks keep the room. */
  const [panel, setPanel] = useState<FragmentPanel>(null);
  const togglePanel = (next: FragmentPanel) => setPanel((open) => (open === next ? null : next));
  const [seenStretch, setSeenStretch] = useState(stretch);
  const [seenPitch, setSeenPitch] = useState(pitchCents);
  const [seenGain, setSeenGain] = useState(gainDb);
  if (stretch !== seenStretch) {
    setSeenStretch(stretch);
    setStretchLocal(stretch);
  }
  if (pitchCents !== seenPitch) {
    setSeenPitch(pitchCents);
    setPitchLocal(pitchCents);
  }
  if (gainDb !== seenGain) {
    setSeenGain(gainDb);
    setGainLocal(gainDb);
  }

  /** "Tempo" 2 = twice as fast, the stored stretch is the opposite (2 = twice as long). */
  const tempoLocal = Math.round((1 / stretchLocal) * 100) / 100;
  const commitStretch = (next: number) => {
    if (next !== stretch) onPlayback?.({ stretch: next, pitchCents: pitchLocal });
  };
  const commitPitch = (next: number) => {
    if (next !== pitchCents) onPlayback?.({ stretch: stretchLocal, pitchCents: next });
  };
  const commitGain = (next: number) => {
    if (next !== gainDb) onGain?.(next);
  };

  return (
    <div
      className="contents"
      role="group"
      aria-label={t("fragmentyAria")}
      data-testid="studio-fragment-tools"
      data-fragment-enabled={enabled ? "true" : "false"}
    >
      {confirmDelete ? (
        <>
          <p className="px-1 text-sm text-[var(--brd-ink)]">{t("usunFragmentPytanie")}</p>
          <Button type="button" size="sm" variant="outline" className="min-h-11 px-3" disabled={pending} onClick={onCancelDelete}>
            {t("anuluj")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="min-h-11 px-3 studio-tool-danger"
            data-testid="studio-fragment-delete"
            disabled={locked}
            onClick={onDelete}
          >
            {t("usunFragment")}
          </Button>
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-nowrap gap-1 max-sm:grid max-sm:w-full max-sm:grid-cols-6 max-sm:gap-0.5" data-testid="studio-fragment-strip">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 min-w-0 shrink-0 px-2 max-sm:px-0.5 max-sm:text-[11px]"
              data-testid="studio-fragment-split"
              disabled={locked}
              title={t("podzielWPlayhead")}
              onClick={onSplit}
            >
              {t('podzielFragment')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 min-w-0 shrink-0 px-2 max-sm:px-0.5 max-sm:text-[11px]"
              data-testid="studio-fragment-trim"
              disabled={locked}
              aria-expanded={panel === "trim"}
              onClick={() => togglePanel("trim")}
            >
              {t('przytnij')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 min-w-0 shrink-0 px-2 max-sm:px-0.5 max-sm:text-[11px]"
              data-testid="studio-fragment-duplicate"
              disabled={locked}
              title={t("powielKlip")}
              onClick={onDuplicate}
            >
              {t('powiel')}
            </Button>
            {onGain ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 min-w-0 shrink-0 px-2 max-sm:px-0.5 max-sm:text-[11px]"
                data-testid="studio-fragment-volume"
                disabled={locked}
                aria-expanded={panel === "gain"}
                onClick={() => togglePanel("gain")}
              >
                {t('gainKlipuEtykieta')}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 min-w-0 shrink-0 px-2 max-sm:px-0.5 max-sm:text-[11px] studio-tool-danger"
              data-testid="studio-fragment-delete"
              disabled={locked}
              title={t("usunFragmentOpis")}
              onClick={onAskDelete}
            >
              {t('usun')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 min-w-0 shrink-0 px-2 max-sm:px-0.5 max-sm:text-[11px] min-w-11"
              data-testid="studio-fragment-more"
              disabled={locked}
              aria-label={t("wiecejNarzedziKlipu")}
              aria-expanded={panel === "more"}
              onClick={() => togglePanel("more")}
            >
              ⋯
            </Button>
          </div>
          {panel === "trim" ? (
            <div className="flex w-full min-w-0 flex-wrap items-center gap-1" data-testid="studio-fragment-trim-row">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 shrink-0 px-2"
                data-testid="studio-fragment-trim-start"
                disabled={locked}
                title={t("przytnijPoczatekDoPlayhead")}
                onClick={onTrimStart}
              >
                {t('przytnijPoczatek')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 shrink-0 px-2"
                data-testid="studio-fragment-trim-end"
                disabled={locked}
                title={t("przytnijKoniecDoPlayhead")}
                onClick={onTrimEnd}
              >
                {t('przytnijKoniec')}
              </Button>
            </div>
          ) : null}
          {panel === "gain" ? (
            <div className="flex w-full min-w-0 flex-wrap items-center gap-1" data-testid="studio-fragment-gain-row">
              {onGain ? (
                <label className="inline-flex min-h-11 min-w-0 items-center gap-2 px-1 text-xs">
                  {t("gainKlipuEtykieta")}
                  <input
                    type="range"
                    min={-24}
                    max={12}
                    step={0.5}
                    value={gainLocal}
                    disabled={locked}
                    aria-label={t("gainKlipuAria")}
                    data-testid="studio-fragment-gain"
                    onChange={(event) => setGainLocal(Number(event.target.value))}
                    {...commitHandlers(() => commitGain(gainLocal))}
                  />
                  <span className="tabular-nums text-[var(--brd-mute)]" data-testid="studio-fragment-gain-value">
                    {gainLocal > 0 ? "+" : ""}
                    {gainLocal.toFixed(1)} dB
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}
          {panel === "more" ? (
            <div className="flex w-full min-w-0 flex-wrap items-center gap-1" data-testid="studio-fragment-more-row">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 min-w-11 shrink-0 px-2"
                data-testid="studio-fragment-nudge-left"
                disabled={locked}
                title={t("przesunFragmentLewo")}
                aria-label={t("przesunFragmentLewo")}
                onClick={onNudgeLeft}
              >
                {t('przesunFragmentLewoKrotko')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 min-w-11 shrink-0 px-2"
                data-testid="studio-fragment-nudge-right"
                disabled={locked}
                title={t("przesunFragmentPrawo")}
                aria-label={t("przesunFragmentPrawo")}
                onClick={onNudgeRight}
              >
                {t('przesunFragmentPrawoKrotko')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 shrink-0 px-2"
                data-testid="studio-fragment-fade-in"
                disabled={locked}
                title={t("wejscieOpis")}
                onClick={onFadeIn}
              >
                {t('wejscie')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 shrink-0 px-2"
                data-testid="studio-fragment-fade-out"
                disabled={locked}
                title={t("zejscieOpis")}
                onClick={onFadeOut}
              >
                {t('zejscie')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={`min-h-11 shrink-0 px-2 ${reverseOn ? "border-[var(--brd-ink)] bg-[var(--brd-ink)] text-[var(--brd-paper)]" : ""}`}
                data-testid="studio-fragment-reverse"
                disabled={locked}
                title={t("odwrocFragmentOpis")}
                aria-label={reverseOn ? t("odwrocFragmentWlaczone") : t("odwrocFragment")}
                aria-pressed={reverseOn}
                onClick={onReverse}
              >
                {t('odwrocFragment')}
              </Button>
              {onDetails ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 shrink-0 px-2"
                  data-testid="studio-fragment-details"
                  disabled={!enabled}
                  onClick={onDetails}
                >
                  {t('szczegolyKlipu')}
                </Button>
              ) : null}
              <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3" data-testid="studio-fragment-sliders">
                {onPlayback ? (
                  <>
                    <label className="inline-flex min-h-11 shrink-0 items-center gap-2 px-1 text-xs">
                      {t("tempoKlipuEtykieta")}
                      <input
                        type="range"
                        min={TEMPO_MIN}
                        max={TEMPO_MAX}
                        step={0.05}
                        value={tempoLocal}
                        disabled={locked}
                        aria-label={t("tempoKlipuAria")}
                        aria-valuetext={`${tempoLocal.toFixed(2)}×`}
                        data-testid="studio-fragment-stretch"
                        onChange={(event) => setStretchLocal(stretchFromTempo(Number(event.target.value)))}
                        {...commitHandlers(() => commitStretch(stretchLocal))}
                      />
                      <span className="w-11 tabular-nums text-[var(--brd-mute)]" data-testid="studio-fragment-stretch-value">
                        {tempoLocal.toFixed(2)}×
                      </span>
                    </label>
                    <label className="inline-flex min-h-11 shrink-0 items-center gap-2 px-1 text-xs">
                      {t("wysokoscKlipuEtykieta")}
                      <input
                        type="range"
                        min={-1200}
                        max={1200}
                        step={100}
                        value={pitchLocal}
                        disabled={locked || pitchLocked}
                        aria-label={t("wysokoscKlipuAria")}
                        title={pitchLocked ? t("wysokoscKlipuOdSilver") : undefined}
                        data-testid="studio-fragment-pitch"
                        onChange={(event) => setPitchLocal(Number(event.target.value))}
                        {...commitHandlers(() => commitPitch(pitchLocal))}
                      />
                      <span className="w-16 tabular-nums text-[var(--brd-mute)]" data-testid="studio-fragment-pitch-value">
                        {t("poltony", { v0: `${pitchLocal > 0 ? "+" : ""}${pitchLocal / 100}` })}
                      </span>
                    </label>
                    {pitchLocked && pitchLocal !== 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11 shrink-0 px-2"
                        disabled={locked}
                        data-testid="studio-fragment-pitch-reset"
                        onClick={() => onPlayback({ stretch: stretchLocal, pitchCents: 0 })}
                      >
                        {t("wyzerujWysokosc")}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          <p className="sr-only" data-testid="studio-fragment-hint">
            {enabled ? t("fragmentEdycja") : t("zaznaczFragment")}
          </p>
        </>
      )}
    </div>
  );
}
