"use client";

/**
 * Studio transport bar (moved out of studio-editor.tsx, audit 2026-11-21).
 * Row 1: |◀ Play Stop Rec, keyboard mode, undo/redo, pause, loop, metronome, beat, clock, master,
 * save status, mix history, export — wraps, never scrolls. Row 2: selection + clip tools while something
 * is selected. Phones: the bar is not sticky; a mini transport docks above the bottom nav instead.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { StudioExportControl } from "@/components/studio/studio-export-control";
import { StudioFragmentTools } from "@/components/studio/studio-fragment-tools";
import { StudioGlyph, StudioRecLamp } from "@/components/studio/studio-glyphs";
import { StudioMixControl } from "@/components/studio/studio-mix-control";
import { StudioMixRevisionHistoryControl } from "@/components/studio/studio-mix-revision-history-control";
import {
  useStudioTransportControls,
  useStudioTransportPlayhead,
} from "@/components/studio/studio-transport-provider";
import { useLibText } from "@/i18n/use-lib-text";
import {
  STUDIO_MASTER_GAIN_DB_MAX,
  STUDIO_MASTER_GAIN_DB_MIN,
} from "@/lib/studio/studio-master-mix";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import type { StudioTransportKeyboardMode } from "@/lib/studio/transport-keyboard-mode";

/** Transport keys: 44px hit area on phones, Button size=sm (h-8) from sm. */
const STUDIO_TRANSPORT_KEY = "min-h-11 min-w-11 px-2 sm:min-h-8 sm:min-w-8";
const STUDIO_TRANSPORT_KEY_WIDE = "min-h-11 px-2 sm:min-h-8";

/** Song length in the clock: mm:ss is enough next to the running mm:ss.mmm. */
function clockTotal(ms: number): string {
  return formatStudioTimeMs(ms).split(".")[0]!;
}

/** Clock leaf: the only part of the bar that renders on every playback frame. */
function TransportClock({ durationMs }: { durationMs: number }) {
  const tl = useLibText();
  const { timeLabel } = useStudioTransportPlayhead();
  return (
    <span className="studio-counter-time text-sm font-medium tracking-tight">
      {tl(timeLabel)}
      <span className="studio-counter-dim"> / </span>
      {tl(clockTotal(durationMs))}
    </span>
  );
}

function MiniTransportClock() {
  const tl = useLibText();
  const { timeLabel } = useStudioTransportPlayhead();
  return (
    <span className="studio-counter-time min-w-0 truncate px-1 font-mono text-xs tabular-nums">{tl(timeLabel)}</span>
  );
}

/** The first Play of a new beat waits for this account's own copy (about 10 s): say so instead of a dead button. */
function SlowBeatNote() {
  const tr = useTranslations("studio.studioEditor");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <p className="mt-0.5 text-xs text-[var(--brd-mute)]" role="status" data-testid="studio-transport-slow-beat">
      {tr("przygotowujeBit")}
    </p>
  );
}

export function StudioTransportBar({
  projectId,
  trackNames,
  tipDocumentVersion,
  getExpectedDocumentVersion,
  onDocumentRefreshed,
  onChooseBeat,
  onRecord,
  transportKeyboardMode,
  onTransportKeyboardModeChange,
  tempoBpm,
  timeSignatureNum,
  timeSignatureDen,
  durationMs,
  masterGainDb,
  pending,
  saveStatusLabel,
  saveIsError,
  conflictActive,
  onMasterGainLocal,
  onMasterGainCommit,
  canUndo,
  canRedo,
  showFragmentTools,
  fragmentEnabled,
  fragmentConfirmDelete,
  onFragmentSplit,
  onFragmentTrimStart,
  onFragmentTrimEnd,
  onFragmentNudge,
  onFragmentDuplicate,
  onFragmentFade,
  fragmentReverseOn,
  onFragmentReverse,
  fragmentStretch,
  fragmentPitchCents,
  fragmentPitchLocked,
  onFragmentPlayback,
  fragmentGainDb,
  onFragmentGain,
  onFragmentAskDelete,
  onFragmentDelete,
  onFragmentCancelDelete,
  onUndo,
  onRedo,
  selectionStartMs,
  selectionEndMs,
  simple = false,
  exportLocked = false,
  fragmentClipId = null,
  onRetrySave = null,
  onFlushPersist,
  recordState = "idle",
  onRecordStop,
}: {
  /** The plan has no WAV export: the button shows a padlock. */
  exportLocked?: boolean;
  /** Selected clip: local slider drafts never move to another clip. */
  fragmentClipId?: string | null;
  /** Set while a failed save waits for another try. */
  onRetrySave?: (() => void) | null;
  /** Finishes the save queue before a mix restore; false = something could not be saved. */
  onFlushPersist?: () => Promise<boolean>;
  /** recording: REC and Stop end the take, playback keys are off. busy: the take is being saved. */
  recordState?: "idle" | "recording" | "busy";
  onRecordStop?: () => void;
  /** Simple record view: start, play/pause, stop, record, undo, metronome, clock. The rest is hidden. */
  simple?: boolean;
  projectId: string;
  trackNames: Record<string, string>;
  tipDocumentVersion: number;
  getExpectedDocumentVersion: () => number;
  onDocumentRefreshed: (document: StudioProjectDocument) => void;
  onChooseBeat: () => void;
  onRecord: () => void;
  transportKeyboardMode: StudioTransportKeyboardMode;
  onTransportKeyboardModeChange: (mode: StudioTransportKeyboardMode) => void;
  tempoBpm: number;
  timeSignatureNum: number;
  timeSignatureDen: number;
  durationMs: number;
  masterGainDb: number;
  pending: boolean;
  saveStatusLabel: string;
  saveIsError: boolean;
  conflictActive: boolean;
  onMasterGainLocal: (gainDb: number) => void;
  onMasterGainCommit: (gainDb: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  showFragmentTools: boolean;
  fragmentEnabled: boolean;
  fragmentConfirmDelete: boolean;
  onFragmentSplit: () => void;
  onFragmentTrimStart: () => void;
  onFragmentTrimEnd: () => void;
  onFragmentNudge: (direction: -1 | 1) => void;
  onFragmentDuplicate: () => void;
  onFragmentFade: (edge: "in" | "out") => void;
  fragmentReverseOn: boolean;
  onFragmentReverse: () => void;
  fragmentStretch: number;
  fragmentPitchCents: number;
  fragmentPitchLocked: boolean;
  onFragmentPlayback: (next: { stretch: number; pitchCents: number }) => void;
  fragmentGainDb: number;
  onFragmentGain: (gainDb: number) => void;
  onFragmentAskDelete: () => void;
  onFragmentDelete: () => void;
  onFragmentCancelDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  selectionStartMs: number | null;
  selectionEndMs: number | null;
}) {
  const tl = useLibText();
  const tr = useTranslations("studio.studioEditor");
  const {
    phase,
    play,
    pause,
    stop,
    seek,
    audioState,
    error,
    hasBeat,
    hasTimelineAudio,
    metronomeEnabled,
    setMetronomeEnabled,
    loopEnabled,
    setLoop,
    tuneBakePendingTrackIds,
  } = useStudioTransportControls();
  const [moreOpen, setMoreOpen] = useState(false);
  const busy = audioState === "loading";
  const noBeat = !hasBeat;
  /** Nothing to hear at all: no beat, no recording, no notes. */
  const noAudio = !hasTimelineAudio;
  const recording = recordState === "recording";
  const statusLabel =
    audioState === "loading"
      ? tr("ladowanieBitu")
      : audioState === "idle"
        ? tr("bitWProjekcie")
        : audioState === "no_beat"
          ? tr("nieMaszJeszczeWybranego")
          : audioState === "error"
            ? tr("bladOdtwarzania")
            : audioState === "playing"
              ? tr("stanOdtwarzanie")
              : audioState === "paused"
                ? tr("pauza")
                : audioState === "ready"
                  ? tr("stanGotowy")
                  : hasBeat
                    ? tr("bitOczekujeNaZaladowanie")
                    : tr("nieMaszJeszczeWybranego");

  const beatControlsDisabled = noAudio || busy || recording;
  const saveProblem = saveIsError || conflictActive;
  const extraKeys = simple || moreOpen ? "" : "max-sm:hidden";
  /** Phones: the transport is not sticky (too tall when wrapped) — a mini transport docks once it scrolls away. */
  const transportRef = useRef<HTMLDivElement | null>(null);
  const [transportOffscreen, setTransportOffscreen] = useState(false);
  useEffect(() => {
    const el = transportRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setTransportOffscreen(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  /** Sticky offset = height of the sticky site header (it varies by breakpoint; the bar hid under it). */
  const [siteHeaderH, setSiteHeaderH] = useState(0);
  useEffect(() => {
    const header = document.querySelector("body header");
    if (!header || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSiteHeaderH(Math.round(header.getBoundingClientRect().height)));
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  const hasSelection = selectionStartMs != null || selectionEndMs != null;
  const toolsShown = hasSelection || (showFragmentTools && (fragmentEnabled || fragmentConfirmDelete));
  /** Clip tools appear above the timeline: scroll by the same amount, so the clicked clip stays under the pointer. */
  const toolsLayoutRef = useRef<{ shown: boolean; height: number } | null>(null);
  useLayoutEffect(() => {
    const height = transportRef.current?.offsetHeight ?? 0;
    const prev = toolsLayoutRef.current;
    toolsLayoutRef.current = { shown: toolsShown, height };
    if (prev && prev.shown !== toolsShown && prev.height !== height) window.scrollBy(0, height - prev.height);
  });

  return (
    <div
      ref={transportRef}
      style={siteHeaderH > 0 ? { top: siteHeaderH + 4 } : undefined}
      className="studio-transport z-20 shrink-0 px-1 py-0 sm:sticky sm:top-2 sm:px-1.5"
      role="region"
      aria-label={tr("transportStudio")}
      data-testid="studio-transport"
      data-studio-transport-empty={noBeat ? "true" : "false"}
    >
      {/* Audit 2026-11-21: row 1 = transport, clock, master, save, history, export (wraps, never scrolls —
          a scrolled strip hid Play). Row 2 = selection + clip tools, only while something is selected. */}
      <div className="flex flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1" data-testid="studio-transport-row-main">
          <div
            className="flex min-w-0 max-w-full flex-wrap items-center gap-0.5 sm:shrink-0 sm:flex-nowrap"
            data-testid="studio-transport-ops"
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`studio-key ${STUDIO_TRANSPORT_KEY}`}
              onClick={() => seek(0)}
              disabled={noAudio || recording}
              title={tr("poczatek")}
              aria-label={tr("poczatek")}
            >
              <span className="font-mono text-[13px] font-semibold">|◀</span>
            </Button>
            <Button
              type="button"
              size="sm"
              className={`studio-key studio-key-play ${STUDIO_TRANSPORT_KEY}`}
              onClick={play}
              disabled={beatControlsDisabled || phase === "playing"}
              title={tl(noAudio ? tr("odtworzNajpierwWybierzBit") : tr("odtworz"))}
              aria-label={tl(noAudio ? tr("odtworzWymagaBitu") : tr("odtworz"))}
            >
              {busy ? "…" : (
                <>
                  <StudioGlyph name="play" />
                  <span className="font-mono text-[11px] font-semibold tracking-[0.08em]">{tr("graj")}</span>
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`studio-key ${STUDIO_TRANSPORT_KEY}`}
              onClick={recording && onRecordStop ? onRecordStop : stop}
              disabled={noAudio && !recording}
              title={recording ? tr("zatrzymajNagrywanie") : tr("stop")}
              aria-label={recording ? tr("zatrzymajNagrywanie") : tr("stop")}
            >
              <StudioGlyph name="stop" />
              <span className="font-mono text-[11px] font-semibold tracking-[0.08em]">{tr("stop")}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="studio-rec-button min-h-11 min-w-11 gap-1.5 px-2.5 sm:min-h-8 sm:min-w-8 sm:gap-1 sm:px-2"
              onClick={recording && onRecordStop ? onRecordStop : onRecord}
              disabled={(noBeat && !recording) || recordState === "busy"}
              aria-pressed={recording}
              data-record-state={recordState}
              title={
                tl(recording
                  ? tr("zatrzymajNagrywanie")
                  : noBeat
                    ? tr("nagrajNajpierwWybierzBit")
                    : tr("nagrajOtwieraIstniejacyKontekst"))
              }
              aria-label={
                tl(recording
                  ? tr("zatrzymajNagrywanie")
                  : noBeat
                    ? tr("nagrajWymagaBitu")
                    : tr("nagrajOtwieraPanelNagrywania"))
              }
              data-testid="studio-transport-record"
            >
              <StudioRecLamp />
              <span className="font-mono text-[11px] font-semibold tracking-[0.08em]">
                {recording ? tr("stop") : tr("nagraj")}
              </span>
            </Button>
            {!simple ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`studio-key ${STUDIO_TRANSPORT_KEY_WIDE} ${extraKeys}`}
              data-testid="studio-transport-keyboard-mode"
              title={
                transportKeyboardMode === "quick_rec"
                  ? tr("trybKlawiaturySzybkiRecOpis")
                  : tr("trybKlawiaturyDawOpis")
              }
              aria-label={
                transportKeyboardMode === "quick_rec"
                  ? tr("trybKlawiaturySzybkiRec")
                  : tr("trybKlawiaturyDaw")
              }
              onClick={() =>
                onTransportKeyboardModeChange(
                  transportKeyboardMode === "quick_rec"
                    ? "standard_daw"
                    : "quick_rec",
                )
              }
            >
              <span className="font-mono text-[10px] font-semibold tracking-[0.06em]">
                {transportKeyboardMode === "quick_rec"
                  ? tr("trybKlawiaturySzybkiRecKrotki")
                  : tr("trybKlawiaturyDawKrotki")}
              </span>
            </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`studio-key ${STUDIO_TRANSPORT_KEY}`}
              onClick={onUndo}
              disabled={!canUndo || pending}
              title={tr("cofnijSkrot")}
              aria-label={tr("cofnij")}
              data-testid="studio-transport-undo"
            >
              <span className="font-mono text-[11px] font-semibold tracking-[0.08em]">{tr("cofnij")}</span>
            </Button>
            {!simple ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`studio-key ${STUDIO_TRANSPORT_KEY} ${extraKeys}`}
              onClick={onRedo}
              disabled={!canRedo || pending}
              title={tr("ponowSkrot")}
              aria-label={tr("ponow")}
              data-testid="studio-transport-redo"
            >
              <StudioGlyph name="redo" />
            </Button>
            ) : null}
            {simple && phase !== "playing" ? null : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`studio-key ${STUDIO_TRANSPORT_KEY} ${extraKeys}`}
              onClick={pause}
              disabled={noAudio || phase !== "playing" || recording}
              title={tr("pauza")}
              aria-label={tr("pauza")}
            >
              <StudioGlyph name="pause" />
            </Button>
            )}
            {!simple ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={
                loopEnabled
                  ? `studio-key studio-key-on ${STUDIO_TRANSPORT_KEY} ${extraKeys}`
                  : `studio-key ${STUDIO_TRANSPORT_KEY} ${extraKeys}`
              }
              disabled={noAudio || recording}
              aria-pressed={loopEnabled}
              title={tl(loopEnabled ? tr("loopWlaczony") : tr("loopRegionu"))}
              aria-label={tl(loopEnabled ? tr("loopWlaczony") : tr("wlaczLoopRegionu"))}
              data-testid="studio-transport-loop"
              onClick={() =>
                setLoop({
                  enabled: !loopEnabled,
                  // The selected clip, or the whole song (not the 6:00 canvas).
                  startMs: selectionStartMs ?? 0,
                  endMs: selectionEndMs ?? durationMs,
                })
              }
            >
              <StudioGlyph name="loop" />
            </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={
                metronomeEnabled
                  ? `studio-key studio-key-on ${STUDIO_TRANSPORT_KEY} ${extraKeys}`
                  : `studio-key ${STUDIO_TRANSPORT_KEY} ${extraKeys}`
              }
              disabled={noAudio || recording}
              aria-pressed={metronomeEnabled}
              title={
                tl(metronomeEnabled ? tr("metronomWlaczony") : tr("metronomKlikRuntime"))
              }
              aria-label={
                tl(metronomeEnabled ? tr("metronomWlaczony") : tr("wlaczMetronom"))
              }
              data-testid="studio-transport-metronome"
              onClick={() => setMetronomeEnabled(!metronomeEnabled)}
            >
              <StudioGlyph name="metronome" />
            </Button>
            {!simple || noBeat ? (
            <Button
              type="button"
              size="sm"
              className={
                noBeat
                  ? `border-[var(--brd-green)] bg-[var(--brd-green)] text-[var(--brd-paper)] hover:opacity-90 ${STUDIO_TRANSPORT_KEY_WIDE}`
                  : `studio-key ${STUDIO_TRANSPORT_KEY_WIDE}`
              }
              variant={noBeat ? "default" : "outline"}
              onClick={onChooseBeat}
              disabled={recordState !== "idle"}
              title={tl(noBeat ? tr("wybierzBit") : tr("zmienBit"))}
              aria-label={tl(noBeat ? tr("wybierzBit") : tr("zmienBit"))}
              data-testid="studio-transport-choose-beat"
            >
              {tl(noBeat ? tr("wybierzBit2") : tr("beatButton"))}
            </Button>
            ) : null}
            {simple ? null : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`studio-key ${STUDIO_TRANSPORT_KEY_WIDE} sm:hidden`}
              aria-expanded={moreOpen}
              data-testid="studio-transport-more"
              onClick={() => setMoreOpen((v) => !v)}
            >
              {moreOpen ? tr("mniej") : tr("wiecej")}
            </Button>
            )}
          </div>

          <div
            className="studio-counter flex min-h-11 min-w-0 max-w-full flex-wrap items-center gap-1.5 px-2 sm:shrink-0 sm:flex-nowrap font-mono text-xs tabular-nums sm:min-h-8 sm:gap-1 sm:px-1.5"
            data-testid="studio-transport-meta"
          >
            <TransportClock durationMs={durationMs} />
            <span className={`studio-counter-dim ${extraKeys}`} aria-label={tr("tempo")}>
              {tempoBpm} {tr("bpm")}
            </span>
            <span className={`studio-counter-dim ${extraKeys}`} aria-label={tr("metrum")}>
              {timeSignatureNum}/{timeSignatureDen}
            </span>
            {tuneBakePendingTrackIds.length > 0 ? (
              <span
                role="status"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--tape-amber)]/40 px-2 py-0.5 font-sans text-[11px] text-[var(--tape-amber)]"
                title={tr("przeliczamStrojenieTytul")}
                data-testid="studio-transport-tune-bake"
              >
                <span aria-hidden className="inline-block size-1.5 animate-pulse rounded-full bg-[var(--tape-amber)]" />
                {tr("przeliczamStrojenie")}
              </span>
            ) : null}
          </div>

          {simple ? null : (
          <div
            className={`flex w-[8.5rem] shrink-0 items-center gap-2 sm:ml-auto ${extraKeys} [&_label]:!text-[11px] [&_label]:!text-[var(--tape-cream-soft)] [&_label_span_span]:!text-[var(--tape-amber)]`}
            data-testid="studio-transport-master"
          >
            <StudioMixControl
              label={tr("master")}
              ariaLabel={tr("glosnoscMaster")}
              value={masterGainDb}
              display={tr("db", { v0: masterGainDb.toFixed(1) })}
              min={STUDIO_MASTER_GAIN_DB_MIN}
              max={STUDIO_MASTER_GAIN_DB_MAX}
              step={0.5}
              stacked
              disabled={pending}
              onLocalChange={onMasterGainLocal}
              onCommit={onMasterGainCommit}
            />
          </div>
          )}

          {/* A problem gets its own full row: the whole text and the way out must be visible. */}
          <div
            className={`flex min-w-0 items-center gap-2 ${
              saveProblem ? "order-last basis-full flex-wrap" : "max-w-[16rem]"
            } ${simple && !saveProblem ? "ml-auto" : ""}`}
            data-testid="studio-transport-save-row"
          >
            <p
              title={tl(saveStatusLabel)}
              className={`min-w-0 text-xs ${
                saveProblem
                  ? "py-1 leading-snug text-[var(--brd-warn)]"
                  : "truncate leading-8 text-[var(--brd-mute)]"
              }`}
              role={saveProblem ? "alert" : "status"}
              data-testid="studio-transport-save"
            >
              {tl(saveStatusLabel)}
            </p>
            {conflictActive ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="studio-key min-h-11 sm:min-h-8"
                data-testid="studio-transport-reload"
                onClick={() => window.location.reload()}
              >
                {tr("odswiez")}
              </Button>
            ) : onRetrySave ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="studio-key min-h-11 sm:min-h-8"
                data-testid="studio-transport-retry-save"
                onClick={onRetrySave}
              >
                {tr("sprobujPonownie")}
              </Button>
            ) : null}
          </div>

          {simple ? null : (
          <div className="flex shrink-0 items-center gap-1 max-sm:w-full sm:ml-auto">
          <StudioMixRevisionHistoryControl
            projectId={projectId}
            tipDocumentVersion={tipDocumentVersion}
            getExpectedDocumentVersion={getExpectedDocumentVersion}
            onDocumentRefreshed={onDocumentRefreshed}
            trackNames={trackNames}
            onBeforeRestore={onFlushPersist}
            disabled={pending}
          />
          <StudioExportControl
            projectId={projectId}
            getExpectedDocumentVersion={getExpectedDocumentVersion}
            planLocked={exportLocked}
          />
          </div>
          )}
        </div>
        {toolsShown ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1" data-testid="studio-transport-row-tools">
          {hasSelection ? (
          <div className="flex shrink-0 flex-nowrap gap-0.5 max-sm:grid max-sm:w-full max-sm:grid-cols-3" data-testid="studio-selection-readout">
            {(
              [
                ["poczatek", selectionStartMs],
                ["koniec", selectionEndMs],
                [
                  "dlugoscKrotko",
                  selectionStartMs != null && selectionEndMs != null
                    ? Math.max(0, selectionEndMs - selectionStartMs)
                    : null,
                ],
              ] as const
            ).map(([key, ms]) => (
              <span key={key} className="studio-sel-cell">
                <span className="studio-sel-caption">{tr(key)}</span>
                <span className="studio-sel-value">
                  {ms == null ? "—" : tl(formatStudioTimeMs(ms))}
                </span>
              </span>
            ))}
          </div>
          ) : null}
          {showFragmentTools ? (
            <StudioFragmentTools
              key={fragmentClipId ?? "none"}
              enabled={fragmentEnabled}
              pending={pending}
              confirmDelete={fragmentConfirmDelete}
              onSplit={onFragmentSplit}
              onTrimStart={onFragmentTrimStart}
              onTrimEnd={onFragmentTrimEnd}
              onNudgeLeft={() => onFragmentNudge(-1)}
              onNudgeRight={() => onFragmentNudge(1)}
              onDuplicate={onFragmentDuplicate}
              onFadeIn={() => onFragmentFade("in")}
              onFadeOut={() => onFragmentFade("out")}
              reverseOn={fragmentReverseOn}
              onReverse={onFragmentReverse}
              stretch={fragmentStretch}
              pitchCents={fragmentPitchCents}
              pitchLocked={fragmentPitchLocked}
              onPlayback={onFragmentPlayback}
              gainDb={fragmentGainDb}
              onGain={onFragmentGain}
              onAskDelete={onFragmentAskDelete}
              onDelete={onFragmentDelete}
              onCancelDelete={onFragmentCancelDelete}
            />
          ) : null}
        </div>
        ) : showFragmentTools && !simple ? (
          <p className="px-1 text-[11px] text-[var(--brd-mute)]" data-testid="studio-transport-select-hint">
            {tr("zaznaczFragment")}
          </p>
        ) : null}
      </div>
      {transportOffscreen && (!noAudio || recording) ? (
        <div
          role="group"
          aria-label={tr("transportStudio")}
          data-testid="studio-mobile-mini-transport"
          className="studio-transport fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-2 right-[4.75rem] z-30 flex items-center gap-1 rounded-[2px] border border-[var(--brd-line)] p-1 shadow-lg sm:hidden"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={`studio-key ${STUDIO_TRANSPORT_KEY}`}
            onClick={() => seek(0)}
            disabled={recording}
            aria-label={tr("poczatek")}
          >
            <span className="font-mono text-[13px] font-semibold">|◀</span>
          </Button>
          {phase === "playing" && !recording ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`studio-key ${STUDIO_TRANSPORT_KEY}`}
              onClick={pause}
              aria-label={tr("pauza")}
            >
              <StudioGlyph name="pause" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className={`studio-key studio-key-play ${STUDIO_TRANSPORT_KEY}`}
              onClick={play}
              disabled={beatControlsDisabled}
              aria-label={tl(tr("odtworz"))}
            >
              <StudioGlyph name="play" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={`studio-key ${STUDIO_TRANSPORT_KEY}`}
            onClick={recording && onRecordStop ? onRecordStop : stop}
            aria-label={recording ? tr("zatrzymajNagrywanie") : tr("stop")}
          >
            <StudioGlyph name="stop" />
          </Button>
          <MiniTransportClock />
        </div>
      ) : null}
      {noBeat ? (
        <p
          className="mt-0.5 text-[11px] text-[var(--brd-mute)]"
          role="status"
          data-testid="studio-transport-nobeat-status"
        >
          {tl(statusLabel)} {tr("wybierzBitAbyOdblokowac")}
        </p>
      ) : (
        <p className="sr-only" role="status">
          {tl(statusLabel)}
        </p>
      )}
      {busy && hasBeat ? <SlowBeatNote /> : null}
      {error ? (
        <p className="mt-0.5 text-xs text-[var(--brd-warn)]" role="alert">
          {tl(error)}
        </p>
      ) : null}
    </div>
  );
}
