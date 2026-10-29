"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BitekApplyProposal } from "@/components/studio/studio-bitek-chat";
import { StudioBitekPanel } from "@/components/studio/studio-bitek-panel";
import { buildBitekClientContext } from "@/lib/studio/bitek/chat/client-context";
import { Button } from "@/components/ui/button";
import type { BitekAction, BitekAnalysisState } from "@/lib/studio/bitek/bitek-guide";
import {
  runStudioMixAnalysis,
  type MixAnalysisFailure,
} from "@/lib/studio/mix-analysis/client";
import type { MixMetrics } from "@/lib/studio/mix-analysis/metrics";
import type { MixCard, MixCardStatus, MixVerdict } from "@/lib/studio/mix-analysis/verdict";
import type { StudioClipDto, StudioProjectDocument } from "@/lib/studio/studio-types";

const STATUS_RAIL: Record<MixCardStatus, string> = {
  green: "border-l-[var(--brd-green)]",
  yellow: "border-l-[var(--brd-amber)]",
  red: "border-l-[var(--brd-rec)]",
  na: "border-l-[var(--brd-line)]",
};
const STATUS_DOT: Record<MixCardStatus, string> = {
  green: "bg-[var(--brd-green)]",
  yellow: "bg-[var(--brd-amber)]",
  red: "bg-[var(--brd-rec)]",
  na: "bg-[var(--brd-line)]",
};

/** Mix-relevant document signature — analysis goes stale when it changes. */
export function studioMixSignature(doc: StudioProjectDocument): string {
  return JSON.stringify([
    doc.project.masterGainDb,
    doc.project.masterPan,
    doc.tracks.map((t) => [t.id, t.gainDb, t.pan, t.muted, t.solo, t.trackRole]),
    doc.clips.map((c) => [c.id, c.trackId, c.timelineStartMs, c.durationMs, c.sourceOffsetMs, c.gainDb, c.muted, c.fadeInMs, c.fadeOutMs]),
  ]);
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "−∞");

type Result = { metrics: MixMetrics; verdict: MixVerdict; signature: string; elapsedMs: number };

export function StudioMixStep({
  doc,
  resolveClipSourceUrl,
  onBack,
  bitekBase,
  onApplyProposal,
}: {
  doc: StudioProjectDocument;
  resolveClipSourceUrl: (clip: StudioClipDto) => Promise<string | null>;
  onBack: () => void;
  bitekBase: { hasBeat: boolean; vocalTrackCount: number; vocalClipCount: number };
  onApplyProposal: BitekApplyProposal;
}) {
  const locale = useLocale();
  const t = useTranslations("studio.mixStep");
  const tRole = useTranslations("studio.trackRole");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<MixAnalysisFailure | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [masterInfoOpen, setMasterInfoOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const signature = useMemo(() => studioMixSignature(doc), [doc]);
  const stale = Boolean(result && result.signature !== signature);

  useEffect(() => () => abortRef.current?.abort(), []);

  const analyze = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setFailure(null);
    setProgress(0);
    setMasterInfoOpen(false);
    const sig = signature;
    const outcome = await runStudioMixAnalysis({
      doc,
      resolveSourceUrl: resolveClipSourceUrl,
      onProgress: setProgress,
      signal: controller.signal,
    });
    if (abortRef.current !== controller) return;
    setRunning(false);
    if (outcome.ok) {
      setResult({ metrics: outcome.metrics, verdict: outcome.verdict, signature: sig, elapsedMs: outcome.elapsedMs });
    } else {
      setFailure(outcome.reason);
    }
  }, [doc, resolveClipSourceUrl, signature]);

  const analysisState: BitekAnalysisState = running
    ? { status: "running", progress }
    : failure
      ? { status: "failed", reason: failure }
      : result
        ? { status: "done", verdict: result.verdict, stale }
        : { status: "idle" };

  const onBitekAction = (action: BitekAction) => {
    if (action === "analyze") void analyze();
    if (action === "goRecord") onBack();
  };

  const latest = useRef({ doc, result, stale });
  useEffect(() => {
    latest.current = { doc, result, stale };
  });
  const getChatContext = useCallback(() => {
    const cur = latest.current;
    return buildBitekClientContext({
      doc: cur.doc,
      lang: locale === "en" ? "en" : "pl",
      step: "mix",
      analysis: cur.result ? { verdict: cur.result.verdict, metrics: cur.result.metrics, stale: cur.stale } : null,
    });
  }, [locale]);

  const verdict = result?.verdict ?? null;
  const canMaster = Boolean(verdict?.canMaster) && !stale && !running;

  return (
    <div data-testid="studio-mix-step" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="min-h-9" onClick={onBack} data-testid="studio-mix-back">
          ← {t("wrocDoNagrania")}
        </Button>
        <h2 className="brd-display text-2xl leading-none tracking-tight">{t("tytul")}</h2>
      </div>
      <p className="max-w-[70ch] text-sm text-[var(--brd-mute)]">{t("opis")}</p>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="lg"
              className="min-h-11 px-4"
              disabled={running}
              onClick={() => void analyze()}
              data-testid="studio-mix-analyze"
            >
              {result ? t("analizujPonownie") : t("analizuj")}
            </Button>
            {running ? (
              <>
                <progress
                  data-testid="studio-mix-progress"
                  className="h-2 w-40 accent-[var(--brd-amber)]"
                  max={100}
                  value={Math.round(progress * 100)}
                  aria-label={t("analizaTrwa", { pct: Math.round(progress * 100) })}
                />
                <span className="font-mono text-xs" aria-live="polite">
                  {t("analizaTrwa", { pct: Math.round(progress * 100) })}
                </span>
                <Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={() => abortRef.current?.abort()}>
                  {t("anuluj")}
                </Button>
              </>
            ) : null}
            {result && !running ? (
              <span className="font-mono text-xs text-[var(--brd-mute)]">
                {t("czasAnalizy", { s: (result.elapsedMs / 1000).toFixed(1) })}
              </span>
            ) : null}
          </div>

          {failure && !running ? (
            <p role="alert" data-testid="studio-mix-error" className="border-l-2 border-l-[var(--brd-rec)] pl-2 text-sm">
              {t(`blad.${failure}`)}
            </p>
          ) : null}

          {stale ? (
            <p role="status" data-testid="studio-mix-stale" className="border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm">
              {t("nieaktualne")}
            </p>
          ) : null}

          {verdict ? (
            <div
              role="status"
              data-testid="studio-mix-verdict"
              data-verdict={verdict.overall}
              className={`flex flex-wrap items-center gap-3 rounded-[2px] border border-[var(--brd-line)] border-l-4 bg-[var(--brd-paper)] p-3 ${STATUS_RAIL[verdict.overall]}`}
            >
              <span aria-hidden className={`size-3 shrink-0 rounded-full ${STATUS_DOT[verdict.overall]}`} />
              <p className="brd-display min-w-0 flex-1 text-lg leading-tight">{t(`werdykt.${verdict.overall}`)}</p>
              <span className="font-mono text-xs text-[var(--brd-mute)]">
                {t("werdyktLicznik", { red: verdict.redCount, yellow: verdict.yellowCount })}
              </span>
            </div>
          ) : null}

          {verdict ? (
            <ul data-testid="studio-mix-cards" className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {verdict.cards.map((card) => (
                <MixCardItem key={card.id} card={card} />
              ))}
            </ul>
          ) : null}

          {result ? (
            <section aria-labelledby="studio-mix-table-title" className="overflow-x-auto">
              <h3 id="studio-mix-table-title" className="brd-display mb-1 text-base">
                {t("tabelaTytul")}
              </h3>
              <table data-testid="studio-mix-loudness-table" className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-xs text-[var(--brd-mute)]">
                  <tr>
                    <th scope="col" className="py-1 pr-2 font-normal">{t("tabelaSciezka")}</th>
                    <th scope="col" className="py-1 pr-2 font-normal">{t("tabelaRola")}</th>
                    <th scope="col" className="py-1 pr-2 text-right font-normal">{t("tabelaLufs")}</th>
                    <th scope="col" className="py-1 pr-2 text-right font-normal">{t("tabelaSt")}</th>
                    <th scope="col" className="py-1 text-right font-normal">{t("tabelaSzczyt")}</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.metrics.tracks.filter((tr) => tr.hasAudio).map((tr) => (
                    <tr key={tr.trackId} className="border-t border-[var(--brd-line)]">
                      <th scope="row" className="max-w-[12rem] truncate py-1 pr-2 text-left font-sans font-normal">{tr.name}</th>
                      <td className="py-1 pr-2 font-sans">{tRole(tr.role)}</td>
                      <td className="py-1 pr-2 text-right">{fmt(tr.integratedLufs)}</td>
                      <td className="py-1 pr-2 text-right">{fmt(tr.shortTermMaxLufs)}</td>
                      <td className="py-1 text-right">{fmt(tr.samplePeakDbfs)} dBFS</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[var(--brd-line)]">
                    <th scope="row" className="py-1 pr-2 text-left font-sans font-semibold">{t("tabelaSuma")}</th>
                    <td />
                    <td className="py-1 pr-2 text-right">{fmt(result.metrics.master.integratedLufs)}</td>
                    <td className="py-1 pr-2 text-right">{fmt(result.metrics.master.shortTermMaxLufs)}</td>
                    <td className="py-1 text-right">{fmt(result.metrics.master.truePeakDbtp)} dBTP</td>
                  </tr>
                </tbody>
              </table>
            </section>
          ) : null}

          <div className="flex flex-col gap-1 border-t border-[var(--brd-line)] pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="lg"
                className="min-h-11 px-4"
                disabled={!canMaster}
                aria-describedby="studio-mix-master-hint"
                data-testid="studio-mix-go-master"
                onClick={() => setMasterInfoOpen(true)}
              >
                {t("przejdzDoMasteringu")} →
              </Button>
              <p id="studio-mix-master-hint" className="text-xs text-[var(--brd-mute)]">
                {verdict && !verdict.canMaster ? t("masteringZablokowany") : t("masteringTytul")}
              </p>
            </div>
            {masterInfoOpen ? (
              <p role="status" data-testid="studio-mix-master-soon" className="border-l-2 border-l-[var(--brd-green)] pl-2 text-sm">
                {t("masteringWkrotce")}
              </p>
            ) : null}
          </div>
        </div>

        <div className="w-full shrink-0 xl:w-[320px]">
          <StudioBitekPanel
            state={{ step: "mix", recording: false, ...bitekBase, analysis: analysisState }}
            onAction={onBitekAction}
            chat={{ projectId: doc.project.id, getContext: getChatContext, onApplyProposal, disabled: running }}
          />
        </div>
      </div>
    </div>
  );
}

function MixCardItem({ card }: { card: MixCard }) {
  const t = useTranslations("studio.mixStep");
  const hintId = `studio-mix-fix-hint-${card.id}`;
  return (
    <li
      data-testid="studio-mix-card"
      data-card-id={card.id}
      data-status={card.status}
      className={`flex flex-col gap-1.5 rounded-[2px] border border-[var(--brd-line)] border-l-4 bg-[var(--brd-paper)] p-3 ${STATUS_RAIL[card.status]}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${STATUS_DOT[card.status]}`} />
        <h3 className="min-w-0 flex-1 text-sm font-semibold">{t(`cards.${card.id}.title`)}</h3>
        <span className="text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">{t(`status.${card.status}`)}</span>
      </div>
      {card.value ? <p className="font-mono text-lg leading-none">{card.value}</p> : null}
      <p className="text-sm">{t(`cards.${card.id}.${card.messageKey}`, card.params)}</p>
      {card.status === "red" || card.status === "yellow" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled aria-describedby={hintId} className="min-h-9">
            {t("popraw")}
          </Button>
          <span id={hintId} className="text-xs text-[var(--brd-mute)]">{t("poprawWkrotce")}</span>
        </div>
      ) : null}
    </li>
  );
}
