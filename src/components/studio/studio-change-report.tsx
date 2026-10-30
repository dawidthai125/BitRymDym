"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { useLibText } from "@/i18n/use-lib-text";
import type { MixMetrics } from "@/lib/studio/mix-analysis/metrics";
import { buildChangeReport, buildMasterReport, type MasterReportItem, type ReportItem } from "@/lib/studio/report/change-report";
import { checkPlatforms } from "@/lib/studio/report/platforms";
import { studioFxLabelPl } from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

const num = (n: number, locale: string) => n.toLocaleString(locale === "en" ? "en-GB" : "pl-PL", { maximumFractionDigits: 1 });
const signed = (n: number, locale: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n), locale)}`;

/** Gaps P1 #7 — „Co zmieniłem” per track after Mix auto-fixes (first-person BITEK). */
export function StudioChangeReport({
  before,
  after,
  metricsBefore,
  metricsAfter,
}: {
  before: StudioProjectDocument;
  after: StudioProjectDocument;
  metricsBefore?: MixMetrics | null;
  metricsAfter?: MixMetrics | null;
}) {
  const t = useTranslations("studio.report");
  const tRole = useTranslations("studio.trackRole");
  const tl = useLibText();
  const locale = useLocale();
  const report = useMemo(() => buildChangeReport({ before, after, metricsBefore, metricsAfter }), [before, after, metricsBefore, metricsAfter]);
  const pan = (v: number) => (Math.abs(v) < 0.01 ? t("panSrodek") : v < 0 ? t("panL", { pct: Math.round(-v * 100) }) : t("panR", { pct: Math.round(v * 100) }));
  const line = (it: ReportItem): string => {
    switch (it.key) {
      case "gainUp":
      case "gainDown":
        return t(`items.${it.key}`, { delta: num(it.params.delta, locale), from: signed(it.params.from, locale), to: signed(it.params.to, locale) });
      case "panMove":
        return t("items.panMove", { from: pan(it.params.from), to: pan(it.params.to) });
      case "muted":
      case "unmuted":
        return t(`items.${it.key}`);
      case "fxAdded":
      case "fxRemoved":
      case "fxOn":
      case "fxOff":
        return t(`items.${it.key}`, { fx: tl(studioFxLabelPl(it.params.fx)) });
      case "fxChanged":
        return t("items.fxChanged", {
          fx: tl(studioFxLabelPl(it.params.fx)),
          changes: it.params.changes
            .slice(0, 4)
            .map((c) => `${tl(c.labelPl)} ${num(c.from, locale)} → ${num(c.to, locale)}${c.unit ? ` ${c.unit}` : ""}`)
            .join(", "),
        });
      case "loudnessMeasured":
        return t("items.loudnessMeasured", { from: num(it.params.from, locale), to: num(it.params.to, locale), delta: signed(it.params.delta, locale) });
    }
  };
  return (
    <section aria-labelledby="studio-change-report-title" data-testid="studio-change-report" data-tracks={report.changedTracks} className="flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3">
      <h3 id="studio-change-report-title" className="brd-display text-base">{t("tytul")}</h3>
      {report.changedTracks === 0 ? (
        <p className="text-sm text-[var(--brd-mute)]">{t("brakZmian")}</p>
      ) : (
        <>
          <p className="text-sm">{t("wstep", { tracks: report.changedTracks, items: report.totalItems })}</p>
          <ul className="flex flex-col gap-2">
            {report.tracks.map((tr) => (
              <li key={tr.trackId} data-testid="studio-change-report-track" className="flex flex-col gap-1 border-l-2 border-l-[var(--brd-amber)] pl-2">
                <p className="text-sm font-semibold">
                  {tr.name} <span className="text-xs font-normal uppercase tracking-[0.12em] text-[var(--brd-mute)]">{tRole(tr.role)}</span>
                </p>
                <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
                  {tr.items.map((it, i) => (
                    <li key={i}>{line(it)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Gaps P1 #7 — whole-song report after the master + platform loudness panel. */
export function StudioMasterReport({
  mix,
  master,
  target,
  settings,
  style = null,
  tpCeiling,
}: {
  mix: { lufs: number; truePeakDb: number; lraLu: number } | null;
  master: { lufs: number; truePeakDb: number; lra?: number | null } | null;
  target: string;
  settings: Record<string, number>;
  style?: { id: string; intensity: number } | null;
  tpCeiling: number;
}) {
  const t = useTranslations("studio.report");
  const tm = useTranslations("studio.masterStep");
  const locale = useLocale();
  if (!master || !Number.isFinite(master.lufs)) return null;
  const items = buildMasterReport({ mix, master, target, settings, style, tpCeiling });
  const line = (it: MasterReportItem): string => {
    switch (it.key) {
      case "target":
        return t("master.target", { target: tm(`cele.${it.params.target}.nazwa`) });
      case "loudnessUp":
      case "loudnessDown":
        return t(`master.${it.key}`, { from: num(it.params.from, locale), to: num(it.params.to, locale), delta: num(it.params.delta, locale) });
      case "peakTamed":
        return t("master.peakTamed", { from: num(it.params.from, locale), to: num(it.params.to, locale) });
      case "peakOver":
        return t("master.peakOver", { to: num(it.params.to, locale) });
      case "dynamics":
        return t("master.dynamics", { from: num(it.params.from, locale), to: num(it.params.to, locale) });
      case "style":
        return t("master.style", { style: tm(`styl.${it.params.style}`), pct: it.params.intensity });
      case "setting":
        return t("master.setting", { setting: tm(`ustawienia.${it.params.setting}`), value: signed(it.params.value, locale) });
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <section aria-labelledby="studio-master-report-title" data-testid="studio-master-report" className="flex flex-col gap-1 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3">
        <h3 id="studio-master-report-title" className="brd-display text-base">{t("masterTytul")}</h3>
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
          {items.map((it, i) => (
            <li key={i}>{line(it)}</li>
          ))}
        </ul>
      </section>
      <StudioPlatformPanel lufs={master.lufs} truePeakDb={master.truePeakDb} />
    </div>
  );
}

export function StudioPlatformPanel({ lufs, truePeakDb }: { lufs: number; truePeakDb: number }) {
  const t = useTranslations("studio.report");
  const locale = useLocale();
  const check = checkPlatforms(lufs, truePeakDb);
  if (!check) return null;
  return (
    <section aria-labelledby="studio-platforms-title" data-testid="studio-platforms" data-tp={check.tp.status} className="flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="studio-platforms-title" className="brd-display text-base">{t("platformy.tytul")}</h3>
        <span className="font-mono text-xs">{num(check.lufs, locale)} LUFS · {num(check.truePeakDb, locale)} dBTP</span>
      </div>
      <p className="text-xs text-[var(--brd-mute)]">{t("platformy.opis")}</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {check.platforms.map((p) => (
          <li key={p.id} data-testid={`studio-platform-${p.id}`} data-kind={p.kind} className="flex flex-col gap-0.5 rounded-[2px] border border-[var(--brd-line)] p-2">
            <p className="flex items-baseline justify-between gap-2 text-sm font-semibold">
              <span>{t(`platformy.nazwy.${p.id}`)}</span>
              <span className={`font-mono ${p.kind === "down" && p.gainDb <= -4 ? "text-[var(--brd-amber)]" : ""}`}>{p.kind === "same" ? "0 dB" : `${signed(p.gainDb, locale)} dB`}</span>
            </p>
            <p className="text-xs">
              {p.kind === "down"
                ? t("platformy.sciszy", { db: num(-p.gainDb, locale), ref: num(p.referenceLufs, locale) })
                : p.kind === "up"
                  ? t(p.peakLimited ? "platformy.podglosniCzesciowo" : "platformy.podglosni", { db: num(p.gainDb, locale), ref: num(p.referenceLufs, locale) })
                  : p.peakLimited
                    ? t("platformy.bezZmianSzczyt", { ref: num(p.referenceLufs, locale) })
                    : t("platformy.bezZmian", { ref: num(p.referenceLufs, locale) })}
            </p>
            {!p.published ? <p className="text-[11px] text-[var(--brd-mute)]">{t("platformy.szacunek")}</p> : null}
          </li>
        ))}
      </ul>
      <p role={check.tp.status === "ok" ? undefined : "alert"} data-testid="studio-platforms-tp" className={`text-sm ${check.tp.status === "over" ? "text-[var(--brd-rec)]" : check.tp.status === "warn" ? "text-[var(--brd-amber)]" : ""}`}>
        {t(`platformy.tp.${check.tp.status}`, { tp: num(check.truePeakDb, locale), ceiling: num(check.tp.ceiling, locale) })}
      </p>
    </section>
  );
}
