"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BitekBubble, BitekMood } from "@/components/studio/studio-bitek-dock";
import { buildBitekClientContext, type BitekClientContext } from "@/lib/studio/bitek/chat/client-context";
import { Button } from "@/components/ui/button";
import { bitekRulesGuide, type BitekAction, type BitekAnalysisState } from "@/lib/studio/bitek/bitek-guide";
import {
  runStudioMixAnalysis,
  type MixAnalysisFailure,
} from "@/lib/studio/mix-analysis/client";
import type { MixMetrics } from "@/lib/studio/mix-analysis/metrics";
import type { MixCard, MixCardStatus, MixVerdict } from "@/lib/studio/mix-analysis/verdict";
import type { StudioClipDto, StudioProjectDocument } from "@/lib/studio/studio-types";
import {
  MIX_AUTOFIX_ALL,
  MIX_CARD_FIXES,
  planMixAutofix,
  type MixAutofixId,
  type MixAutofixNote,
} from "@/lib/studio/mix-autofix/plan";
import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";

export type MixAutofixApply = (
  ops: MixWorkingOp[],
  description: string,
) => Promise<{ ok: true; before: StudioProjectDocument } | { ok: false; conflict: boolean }>;

type FixPanel =
  | { kind: "done"; notes: MixAutofixNote[]; after: string | null }
  | { kind: "nothing" }
  | { kind: "error"; conflict: boolean };

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
    doc.project.masterFxChain,
    doc.tracks.map((t) => [t.id, t.gainDb, t.pan, t.muted, t.solo, t.trackRole, t.effectsChain]),
    doc.clips.map((c) => [c.id, c.trackId, c.timelineStartMs, c.durationMs, c.sourceOffsetMs, c.gainDb, c.muted, c.fadeInMs, c.fadeOutMs]),
  ]);
}

/** Decimal comma in PL ("2,5:1"); strings untouched. */
function localizeParams(params: Record<string, string | number>, locale: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = typeof v === "number" ? v.toLocaleString(locale === "en" ? "en-US" : "pl-PL", { maximumFractionDigits: 2 }) : v;
  }
  return out;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "−∞");

type Result = { metrics: MixMetrics; verdict: MixVerdict; signature: string; elapsedMs: number };

export function StudioMixStep({
  doc,
  resolveClipSourceUrl,
  onBack,
  bitekBase,
  onApplyAutofix,
  onAbOverride,
  onBitekBubble,
  onBitekNote,
  chatContextRef,
}: {
  doc: StudioProjectDocument;
  resolveClipSourceUrl: (clip: StudioClipDto) => Promise<string | null>;
  onBack: () => void;
  bitekBase: { hasBeat: boolean; vocalTrackCount: number; vocalClipCount: number };
  onApplyAutofix?: MixAutofixApply;
  onAbOverride?: (before: StudioProjectDocument | null) => void;
  /** Stage 2b — what BITEK says in the floating bubble for the Mix step. */
  onBitekBubble?: (bubble: BitekBubble | null) => void;
  /** Persist a BITEK note (what I did) in the project. */
  onBitekNote?: (content: string, meta: Record<string, unknown>) => void;
  chatContextRef?: { current: (() => BitekClientContext) | null };
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

  // Stage 2 — auto-fix state
  const [fixing, setFixing] = useState<string | null>(null);
  const [panel, setPanel] = useState<FixPanel | null>(null);
  const [fixSeq, setFixSeq] = useState(0);
  const [ab, setAb] = useState<{ before: StudioProjectDocument; afterSig: string | null } | null>(null);
  const [abMode, setAbMode] = useState<"before" | "after">("after");
  const reanalyzeRef = useRef<{ fromSig: string } | null>(null);
  const reportRef = useRef(false);
  const abOverrideRef = useRef(onAbOverride);
  useEffect(() => {
    abOverrideRef.current = onAbOverride;
  });
  useEffect(() => () => abOverrideRef.current?.(null), []);

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
      if (reportRef.current) {
        reportRef.current = false;
        const v = outcome.verdict;
        const after = t(`autofix.poAnalizie.${v.overall}`, { red: v.redCount, yellow: v.yellowCount });
        setPanel((p) => (p?.kind === "done" ? { ...p, after } : p));
      }
    } else {
      setFailure(outcome.reason);
    }
  }, [doc, resolveClipSourceUrl, signature, t]);

  // After a confirmed apply the doc signature changes → re-analyse once.
  useEffect(() => {
    const pending = reanalyzeRef.current;
    if (!pending || pending.fromSig === signature) return;
    reanalyzeRef.current = null;
    reportRef.current = true;
    setAb((cur) => (cur ? { ...cur, afterSig: signature } : cur));
    void analyze();
  }, [signature, analyze]);

  // Any further edit ends the A/B comparison (derived, not stored).
  const abLive = ab && (!ab.afterSig || ab.afterSig === signature) ? ab : null;
  const abEnded = Boolean(ab && !abLive);
  useEffect(() => {
    if (abEnded) onAbOverride?.(null);
  }, [abEnded, onAbOverride]);

  const setAbListen = (mode: "before" | "after") => {
    const ab = abLive;
    if (!ab) return;
    setAbMode(mode);
    onAbOverride?.(mode === "before" ? ab.before : null);
  };

  const runFix = async (fixes: readonly MixAutofixId[], key: string, summary: string) => {
    if (!result || !onApplyAutofix || fixing || running || stale) return;
    const plan = planMixAutofix({
      doc,
      metrics: result.metrics,
      verdict: result.verdict,
      fixes,
      createId: () => crypto.randomUUID(),
    });
    if (plan.ops.length === 0) {
      setPanel({ kind: "nothing" });
      return;
    }
    setFixing(key);
    if (ab) onAbOverride?.(null);
    const res = await onApplyAutofix(plan.ops, t("autofix.historia", { summary }));
    setFixing(null);
    if (!res.ok) {
      setPanel({ kind: "error", conflict: res.conflict });
      return;
    }
    reanalyzeRef.current = { fromSig: signature };
    setAb({ before: res.before, afterSig: null });
    setAbMode("after");
    setPanel({ kind: "done", notes: plan.notes, after: null });
    setFixSeq((n) => n + 1);
    const texts = plan.notes.map((n) => t(`autofix.notes.${n.key}`, localizeParams(n.params, locale)));
    onBitekNote?.(t("autofix.historia", { summary }), { notes: texts });
  };

  const analysisState = useMemo<BitekAnalysisState>(
    () =>
      running
        ? { status: "running", progress }
        : failure
          ? { status: "failed", reason: failure }
          : result
            ? { status: "done", verdict: result.verdict, stale }
            : { status: "idle" },
    [running, progress, failure, result, stale],
  );

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
  useEffect(() => {
    if (!chatContextRef) return;
    chatContextRef.current = getChatContext;
    return () => {
      chatContextRef.current = null;
    };
  }, [chatContextRef, getChatContext]);

  const verdict = result?.verdict ?? null;
  const canMaster = Boolean(verdict?.canMaster) && !stale && !running;

  // Stage 2b — BITEK bubble (short) instead of long notes on the page.
  const tBitek = useTranslations("studio.bitek");
  // Bubble buttons dispatch through state so the bubble object stays stable.
  const [pending, setPending] = useState<{ id: BitekAction | "fix-all"; seq: number } | null>(null);
  const handledSeq = useRef(0);
  useEffect(() => {
    if (!pending || pending.seq <= handledSeq.current) return;
    handledSeq.current = pending.seq;
    const pendingAction = pending.id;
    // A click from the BITEK bubble (dispatched via state) — not a render-driven update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pendingAction === "fix-all") void runFix(MIX_AUTOFIX_ALL, "all", t("autofix.historiaWszystko"));
    else onBitekAction(pendingAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per dispatched action
  }, [pending]);
  const bubble = useMemo<BitekBubble>(() => {
    if (fixing) return { key: `fixing-${fixing}`, mood: "thinking", text: t("poprawTrwa") };
    if (panel?.kind === "done") {
      const notes = panel.notes.map((n) => t(`autofix.notes.${n.key}`, localizeParams(n.params, locale)));
      return {
        key: `fix-${fixSeq}-${panel.after ? "checked" : "checking"}`,
        mood: panel.after && verdict?.overall === "red" ? "alert" : "done",
        text: [t("autofix.dymek", { count: notes.length }), panel.after ?? t("autofix.sprawdzam")].join(" "),
        details: [...notes, t("autofix.zapisane")],
      };
    }
    if (panel?.kind === "error") {
      return { key: `fix-error-${fixSeq}`, mood: "alert", text: panel.conflict ? t("autofix.konflikt") : t("autofix.blad") };
    }
    if (panel?.kind === "nothing" && !running) return { key: `fix-nothing-${fixSeq}`, mood: "happy", text: t("autofix.nic") };
    const msgs = bitekRulesGuide({ step: "mix", recording: false, ...bitekBase, analysis: analysisState });
    const first = msgs[0];
    const hasIssues = Boolean(verdict && (verdict.redCount > 0 || verdict.yellowCount > 0 || verdict.overall !== "green"));
    const mood: BitekMood = running
      ? "thinking"
      : failure || (!stale && hasIssues)
        ? "alert"
        : verdict?.canMaster && !stale
          ? "done"
          : "happy";
    const actions: BitekBubble["actions"] = [];
    if (first?.action) {
      const a = first.action;
      actions.push({ id: a, label: tBitek(`akcja.${a}`), primary: true, onClick: () => setPending((p) => ({ id: a, seq: (p?.seq ?? 0) + 1 })) });
    }
    if (hasIssues && !stale && !running && onApplyAutofix) {
      actions.push({ id: "fix-all", label: t("poprawWszystko"), primary: !first?.action, onClick: () => setPending((p) => ({ id: "fix-all", seq: (p?.seq ?? 0) + 1 })) });
    }
    return {
      key: `mix-${analysisState.status}-${verdict ? `${verdict.overall}${verdict.redCount}${verdict.yellowCount}` : ""}-${stale ? "s" : ""}`,
      mood,
      text: first ? tBitek(`msg.${first.key}`, first.params ?? {}) : t("tytul"),
      details: [...msgs.slice(1).map((m) => tBitek(`msg.${m.key}`, m.params ?? {})), ...(result ? [] : [t("opis")])],
      actions,
    };
  }, [fixing, panel, fixSeq, verdict, locale, t, tBitek, running, bitekBase, analysisState, failure, stale, onApplyAutofix, result]);
  useEffect(() => {
    onBitekBubble?.(bubble);
  }, [bubble, onBitekBubble]);
  useEffect(() => () => onBitekBubble?.(null), [onBitekBubble]);

  return (
    <div data-testid="studio-mix-step" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="min-h-9" onClick={onBack} data-testid="studio-mix-back">
          ← {t("wrocDoNagrania")}
        </Button>
        <h2 className="brd-display text-2xl leading-none tracking-tight">{t("tytul")}</h2>
      </div>

      <div className="flex flex-col gap-3">
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
              {onApplyAutofix ? (
                <Button
                  type="button"
                  size="sm"
                  className="min-h-9 w-full sm:w-auto"
                  disabled={Boolean(fixing) || running || stale}
                  aria-describedby="studio-mix-fix-all-hint"
                  data-testid="studio-mix-fix-all"
                  onClick={() => void runFix(MIX_AUTOFIX_ALL, "all", t("autofix.historiaWszystko"))}
                >
                  {fixing === "all" ? t("poprawTrwa") : t("poprawWszystko")}
                </Button>
              ) : null}
              <span id="studio-mix-fix-all-hint" className="sr-only">{t("poprawWszystkoOpis")}</span>
            </div>
          ) : null}

          {abLive ? (
            <div
              role="group"
              aria-label={t("autofix.ab.aria")}
              data-testid="studio-mix-ab"
              className="flex flex-wrap items-center gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2"
            >
              <span className="text-sm font-semibold">{t("autofix.ab.label")}</span>
              {(["before", "after"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={abMode === mode ? "default" : "outline"}
                  aria-pressed={abMode === mode}
                  className="min-h-9"
                  data-testid={`studio-mix-ab-${mode}`}
                  onClick={() => setAbListen(mode)}
                >
                  {mode === "before" ? t("autofix.ab.przed") : t("autofix.ab.po")}
                </Button>
              ))}
              <span className="text-xs text-[var(--brd-mute)]" aria-live="polite">
                {t("autofix.ab.opis", {
                  version: abMode === "before" ? t("autofix.ab.przed") : t("autofix.ab.po"),
                })}
              </span>
            </div>
          ) : null}


          {verdict ? (
            <ul data-testid="studio-mix-cards" className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {verdict.cards.map((card) => (
                <MixCardItem
                  key={card.id}
                  card={card}
                  canFix={Boolean(onApplyAutofix) && !running && !stale && !fixing}
                  busy={fixing === card.id}
                  onFix={() =>
                    void runFix(
                      MIX_CARD_FIXES[card.id],
                      card.id,
                      t("autofix.historiaKarta", { title: t(`cards.${card.id}.title`) }),
                    )
                  }
                />
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

      </div>
    </div>
  );
}

function MixCardItem({
  card,
  canFix,
  busy,
  onFix,
}: {
  card: MixCard;
  canFix: boolean;
  busy: boolean;
  onFix: () => void;
}) {
  const t = useTranslations("studio.mixStep");
  const fixable = MIX_CARD_FIXES[card.id].length > 0;
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
          {fixable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canFix}
              aria-label={t("poprawAria", { title: t(`cards.${card.id}.title`) })}
              className="min-h-9"
              data-testid="studio-mix-card-fix"
              onClick={onFix}
            >
              {busy ? t("poprawTrwa") : t("popraw")}
            </Button>
          ) : (
            <span id={hintId} className="text-xs text-[var(--brd-mute)]">{t("poprawBrak")}</span>
          )}
        </div>
      ) : null}
    </li>
  );
}
