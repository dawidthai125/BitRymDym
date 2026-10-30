import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { OverflowXScrollRegion } from "@/components/brand/overflow-x-scroll-region";
import { AppShell } from "@/components/site/app-shell";
import {
  GUEST_POLICY,
  PLAN_PAYMENTS_AVAILABLE,
  PLAN_POLICY,
  PLAN_TRIAL_DAYS,
  yearlySavingPercent,
  type PlanDownloadQuality,
} from "@/config/plan-policy";
import { OWN_TAKE_RAW_DOWNLOADS_DAILY } from "@/config/recording";
import type { PremiumTier } from "@/types/premium";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.premiumPage");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

const TIERS: PremiumTier[] = ["FREE", "BRONZE", "SILVER", "GOLD"];
const LABEL: Record<PremiumTier, string> = { FREE: "Free", BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold" };
/** The best download each plan gets, for the table. */
const BEST_QUALITY_ORDER: PlanDownloadQuality[] = ["WAV_MASTER", "WAV_PRO", "WAV_COMPAT", "MP3_320", "MP3_256", "MP3_192", "MP3_128"];

function bestQuality(tier: PremiumTier): PlanDownloadQuality | null {
  const q = PLAN_POLICY[tier].downloads.qualities;
  return BEST_QUALITY_ORDER.find((x) => q.includes(x)) ?? null;
}

export default function PremiumPage() {
  const tr = useTranslations("account.premiumPage");
  const locale = useLocale();
  const money = new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", { style: "currency", currency: "PLN", minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const hours = (s: number) => Math.round(s / 3600);

  const rows: { id: string; label: string; cell: (tier: PremiumTier) => string }[] = [
    { id: "take", label: tr("tab.take"), cell: (x) => tr("tab.sekundy", { n: PLAN_POLICY[x].recording.maxTakeSeconds }) },
    { id: "sesje", label: tr("tab.sesje"), cell: (x) => String(PLAN_POLICY[x].recording.sessionsPerDay) },
    { id: "waznosc", label: tr("tab.waznosc"), cell: (x) => tr("tab.godziny", { n: hours(PLAN_POLICY[x].recording.takeTtlSeconds) }) },
    { id: "projekty", label: tr("tab.projekty"), cell: (x) => String(PLAN_POLICY[x].studio.maxProjects) },
    { id: "sciezki", label: tr("tab.sciezki"), cell: (x) => String(PLAN_POLICY[x].studio.maxRecordingTracks) },
    { id: "mastery", label: tr("tab.mastery"), cell: (x) => String(PLAN_POLICY[x].mastering.mastersPerMonth) },
    {
      id: "pobieranie",
      label: tr("tab.pobieranie"),
      cell: (x) => {
        const q = bestQuality(x);
        return q ? tr("tab.doJakosci", { q: tr(`jakosc.${q}`) }) : tr("tab.brakPobierania");
      },
    },
    { id: "projektZip", label: tr("tab.projektZip"), cell: (x) => (PLAN_POLICY[x].downloads.projectZip ? "✓" : "—") },
    { id: "przechowywanie", label: tr("tab.przechowywanie"), cell: (x) => tr("tab.dni", { n: PLAN_POLICY[x].retentionDays }) },
    { id: "referencja", label: tr("tab.referencja"), cell: (x) => tr(`referencja.${PLAN_POLICY[x].mastering.referenceMastering}`) },
    { id: "bity", label: tr("tab.bity"), cell: (x) => (PLAN_POLICY[x].downloads.beatsPerDay > 0 ? String(PLAN_POLICY[x].downloads.beatsPerDay) : tr("tab.brakPobierania")) },
  ];

  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-5xl py-10 sm:py-12">
          <SectionLabel>{tr("premium")}</SectionLabel>
          <h1 className="brd-display mt-2 max-w-[20ch] text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[0.95] tracking-tight">
            {tr("naglowek")}
          </h1>
          <p className="mt-4 max-w-[52ch] text-[0.95rem] leading-relaxed text-[var(--brd-ink-soft)]">{tr("lead")}</p>
          {!PLAN_PAYMENTS_AVAILABLE ? (
            <p data-testid="premium-payments-soon" role="note" className="mt-4 max-w-[60ch] border-l-4 border-l-[var(--brd-amber)] bg-[var(--brd-paper-deep)]/40 px-3 py-2 text-sm">
              <strong className="font-semibold">{tr("platnosciWkrotce")}</strong> {tr("platnosciOpis")}
            </p>
          ) : null}

          <section className="mt-8" aria-label={tr("plany")}>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="premium-plan-cards">
              {TIERS.map((tier) => {
                const p = PLAN_POLICY[tier];
                const save = yearlySavingPercent(p.price);
                return (
                  <li key={tier} data-testid={`premium-plan-${tier}`} className={`flex flex-col gap-3 border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 ${tier === "SILVER" ? "border-t-4 border-t-[var(--brd-amber)]" : ""}`}>
                    <div>
                      <h2 className="brd-display text-2xl font-semibold tracking-tight">{LABEL[tier]}</h2>
                      <p className="text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">{tr(`dlaKogo.${tier}`)}</p>
                    </div>
                    <div>
                      {p.price.monthlyPln == null ? (
                        <p className="font-mono text-2xl">{tr("cenaFree")}</p>
                      ) : (
                        <>
                          <p className="font-mono text-2xl">
                            {money.format(p.price.monthlyPln)}
                            <span className="text-sm text-[var(--brd-mute)]"> {tr("miesiac")}</span>
                          </p>
                          <p className="text-sm text-[var(--brd-ink-soft)]">
                            {tr("rocznie", { cena: money.format(p.price.yearlyPln ?? 0) })}
                            {save ? ` · ${tr("oszczedzasz", { n: save })}` : ""}
                          </p>
                        </>
                      )}
                    </div>
                    <ul className="flex flex-col gap-1 text-sm leading-snug">
                      <li>{tr("karta.take", { s: p.recording.maxTakeSeconds, n: p.recording.sessionsPerDay })}</li>
                      <li>{tr("karta.waznosc", { h: hours(p.recording.takeTtlSeconds) })}</li>
                      <li>{tr("karta.projekty", { p: p.studio.maxProjects, t: p.studio.maxRecordingTracks })}</li>
                      <li>{tr("karta.mastery", { n: p.mastering.mastersPerMonth })}</li>
                      <li>{bestQuality(tier) ? tr("karta.pobieranie", { q: tr(`jakosc.${bestQuality(tier)!}`) }) : `🔒 ${tr("karta.bezPobierania")}`}</li>
                      {p.mastering.referenceMastering !== "none" ? <li>{tr(`karta.referencja.${p.mastering.referenceMastering}`)}</li> : null}
                    </ul>
                    <p className="mt-auto text-xs text-[var(--brd-mute)]">{tier === "FREE" ? tr("freeStopka") : PLAN_TRIAL_DAYS === 0 ? tr("bezOkresuProbnego") : null}</p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-compare">
            <h2 id="premium-compare" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">{tr("porownanie")}</h2>
            <OverflowXScrollRegion className="mt-4 overflow-x-auto border border-[var(--brd-line)]" ariaLabel={tr("porownanieAria")}>
              <table className="w-full min-w-[40rem] text-left text-sm" data-testid="premium-compare-table">
                <caption className="sr-only">{tr("porownanieAria")}</caption>
                <thead className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/50">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-medium">{tr("tab.co")}</th>
                    {TIERS.map((tier) => (
                      <th key={tier} scope="col" className="px-3 py-2.5 font-medium">{LABEL[tier]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--brd-line)] last:border-0">
                      <th scope="row" className="px-3 py-2.5 font-medium text-[var(--brd-ink)]">{r.label}</th>
                      {TIERS.map((tier) => (
                        <td key={tier} className="px-3 py-2.5 text-[var(--brd-ink-soft)]">{r.cell(tier)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </OverflowXScrollRegion>
            <ul className="mt-3 space-y-1 text-xs leading-relaxed text-[var(--brd-mute)]">
              <li>{tr("przypis.gosc", { s: GUEST_POLICY.previewSeconds })}</li>
              <li>{tr("przypis.narzedzia")}</li>
              <li>{tr("przypis.mastery")}</li>
              <li>{tr("przypis.free")}</li>
              <li>{tr("przypis.upgrade")}</li>
              <li>{tr("przypis.raw", { n: OWN_TAKE_RAW_DOWNLOADS_DAILY, plan: LABEL[TIERS.find((x) => PLAN_POLICY[x].downloads.ownTakeRaw) ?? "GOLD"] })}</li>
            </ul>
          </section>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-soon">
            <h2 id="premium-soon" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">{tr("wPrzygotowaniu")}</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
              <li>
                <span className="font-medium text-[var(--brd-ink)]">{tr("platnosciTytul")}</span>
                {" — "}
                {tr("platnosciPlan")}
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">{tr("referencjaTytul")}</span>
                {" — "}
                {tr("przypis.referencja")}
              </li>
            </ul>
          </section>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-how">
            <h2 id="premium-how" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">{tr("jakDostacPremiumDzis")}</h2>
            <p className="mt-4 max-w-[60ch] text-sm leading-relaxed text-[var(--brd-ink-soft)]">{tr("poziomNadajeSiePo")}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <BrdLink href="/beats">{tr("idzDoKatalogu")}</BrdLink>
              <BrdLink href="/sign-up" variant="secondary">{tr("zalozKonto")}</BrdLink>
              <Link href="/about" className="inline-flex min-h-11 items-center px-2 text-sm text-[var(--brd-green)] underline-offset-4 hover:underline">
                {tr("oBitrymdym")}
              </Link>
            </div>
          </section>
        </PageFrame>
      </main>
    </AppShell>
  );
}
