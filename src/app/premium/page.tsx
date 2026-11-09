import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { OverflowXScrollRegion } from "@/components/brand/overflow-x-scroll-region";
import { AppShell } from "@/components/site/app-shell";
import {
  GUEST_POLICY,
  PLAN_PACK_CATALOG,
  PLAN_POLICY,
  youtubePackOffer,
  PLAN_TRIAL_DAYS,
  readPlanPaymentsAvailable,
  yearlySavingPercent,
  type PlanDownloadQuality,
} from "@/config/plan-policy";
import { studioAdvancedRecordAllowed } from "@/lib/studio/studio-record-view";
import { PremiumPurchaseSection } from "@/components/premium/premium-purchase-section";
import { isP24Configured } from "@/lib/payments/p24-config";
import { isPayuConfigured } from "@/lib/payments/payu-config";
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
  const paymentsOn = readPlanPaymentsAvailable() && (isPayuConfigured() || isP24Configured());

  const rows: { id: string; label: string; cell: (tier: PremiumTier) => string }[] = [
    { id: "take", label: tr("tab.take"), cell: (x) => tr("tab.sekundy", { n: PLAN_POLICY[x].recording.maxTakeSeconds }) },
    { id: "sesje", label: tr("tab.sesje"), cell: (x) => String(PLAN_POLICY[x].recording.sessionsPerDay) },
    { id: "widok", label: tr("tab.widok"), cell: (x) => tr(studioAdvancedRecordAllowed(x) ? "widok.pelny" : "widok.prosty") },
    { id: "waznosc", label: tr("tab.waznosc"), cell: (x) => tr("tab.godziny", { n: hours(PLAN_POLICY[x].recording.takeTtlSeconds) }) },
    { id: "projekty", label: tr("tab.projekty"), cell: (x) => String(PLAN_POLICY[x].studio.maxProjects) },
    { id: "sciezki", label: tr("tab.sciezki"), cell: (x) => String(PLAN_POLICY[x].studio.maxRecordingTracks) },
    { id: "stemy", label: tr("tab.stemy"), cell: (x) => (PLAN_POLICY[x].studio.maxStems > 0 ? tr("tab.stemyIle", { n: PLAN_POLICY[x].studio.maxStems }) : "—") },
    { id: "rozciecie", label: tr("tab.rozciecie"), cell: (x) => (PLAN_POLICY[x].studio.maxStems > 0 ? tr("tab.znakWodnyTak") : "—") },
    { id: "teksty", label: tr("tab.teksty"), cell: (x) => String(PLAN_POLICY[x].tools.aiLyricsPerDay) },
    { id: "wysokosc", label: tr("tab.wysokosc"), cell: (x) => (PLAN_POLICY[x].studio.clipPitch ? tr("tab.znakWodnyTak") : "—") },
    { id: "sciszanie", label: tr("tab.sciszanie"), cell: (x) => (PLAN_POLICY[x].studio.sidechain ? tr("tab.znakWodnyTak") : "—") },
    { id: "efekty", label: tr("tab.efekty"), cell: (x) => String(PLAN_POLICY[x].studio.maxFxEffects) },
    { id: "sample", label: tr("tab.sample"), cell: (x) => String(PLAN_POLICY[x].studio.maxSamples) },
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
    {
      id: "wideoYt",
      label: tr("tab.wideoYt"),
      cell: (x) => {
        const perWeek = PLAN_POLICY[x].downloads.youtubeVideosPerWeek;
        if (perWeek > 0) return tr("tab.wideoYtTydzien", { n: perWeek });
        const offer = youtubePackOffer(x);
        return offer ? tr("tab.wideoYtJednorazowo", { cena: money.format(offer.pricePln) }) : "—";
      },
    },
    { id: "przechowywanie", label: tr("tab.przechowywanie"), cell: (x) => tr("tab.dni", { n: PLAN_POLICY[x].retentionDays }) },
    { id: "referencja", label: tr("tab.referencja"), cell: (x) => tr(`referencja.${PLAN_POLICY[x].mastering.referenceMastering}`) },
    { id: "bity", label: tr("tab.bity"), cell: (x) => (PLAN_POLICY[x].downloads.beatsPerDay > 0 ? String(PLAN_POLICY[x].downloads.beatsPerDay) : tr("tab.brakPobierania")) },
    { id: "aktywne", label: tr("tab.aktywne"), cell: (x) => String(PLAN_POLICY[x].recording.maxActiveReady) },
    {
      id: "presety",
      label: tr("tab.presety"),
      cell: (x) => {
        const presets = PLAN_POLICY[x].tools.vocalPresets;
        if (presets.roleSets) return tr("tab.presetyRole", { n: presets.maxOwn });
        return presets.maxOwn > 0 ? tr("tab.presetyIle", { n: presets.maxOwn }) : tr("tab.presetyBrak");
      },
    },
    {
      id: "pitch",
      label: tr("tab.pitch"),
      cell: (x) => {
        const pitch = PLAN_POLICY[x].tools.pitchCorrection;
        if (pitch.manualNotes) return tr("tab.pitchNotes");
        if (pitch.custom) return tr("tab.pitchCustom");
        return tr("tab.pitchNatural");
      },
    },
    { id: "czyszczenie", label: tr("tab.czyszczenie"), cell: (x) => String(PLAN_POLICY[x].tools.vocalCleanup.perDay) },
    {
      id: "linki",
      label: tr("tab.linki"),
      cell: (x) => {
        const links = PLAN_POLICY[x].sharing.listenLinksActive;
        return links == null ? tr("tab.linkiBezLimitu") : String(links);
      },
    },
    {
      id: "bitek",
      label: tr("tab.bitek"),
      cell: (x) => tr(PLAN_POLICY[x].tools.bitekMemory === "project" ? "tab.bitekProjekt" : "tab.bitekSesja"),
    },
    { id: "nuty", label: tr("tab.nuty"), cell: () => tr("tab.nutyWszystkie") },
    { id: "znak", label: tr("tab.znakWodny"), cell: () => tr("tab.znakWodnyTak") },
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
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-[var(--brd-ink-soft)]">
            {tr("programLinia")}{" "}
            <Link href="/nagrywarka" className="underline underline-offset-4">{tr("programLink")}</Link>
          </p>
          {paymentsOn ? (
            <PremiumPurchaseSection />
          ) : (
            <p data-testid="premium-payments-soon" role="note" className="mt-4 max-w-[60ch] border-l-4 border-l-[var(--brd-amber)] bg-[var(--brd-paper-deep)]/40 px-3 py-2 text-sm">
              <strong className="font-semibold">{tr("platnosciWkrotce")}</strong> {tr("platnosciOpis")}
            </p>
          )}

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
                      <li>{tr(studioAdvancedRecordAllowed(tier) ? "karta.widokPelny" : "karta.widokProsty")}</li>
                      <li>{tr("karta.waznosc", { h: hours(p.recording.takeTtlSeconds) })}</li>
                      <li>{tr("karta.projekty", { p: p.studio.maxProjects, t: p.studio.maxRecordingTracks })}</li>
                      <li>{tr("karta.mastery", { n: p.mastering.mastersPerMonth })}</li>
                      <li>{p.studio.maxStems > 0 ? tr("karta.stemy", { n: p.studio.maxStems }) : tr("karta.stemyBrak")}</li>
                      <li>{p.studio.maxStems > 0 ? tr("karta.rozciecie") : tr("karta.rozciecieBrak")}</li>
                      <li>{tr("karta.teksty", { n: p.tools.aiLyricsPerDay })}</li>
                      <li>{tr("karta.efekty", { n: p.studio.maxFxEffects })}</li>
                      <li>{p.studio.clipPitch ? tr("karta.wysokosc") : tr("karta.tempo")}</li>
                      <li>{tr("karta.sample", { n: p.studio.maxSamples })}</li>
                      <li>{bestQuality(tier) ? tr("karta.pobieranie", { q: tr(`jakosc.${bestQuality(tier)!}`) }) : `🔒 ${tr("karta.bezPobierania")}`}</li>
                      {p.downloads.youtubeVideosPerWeek > 0 ? <li>{tr("karta.yt", { n: p.downloads.youtubeVideosPerWeek })}</li> : null}
                      <li>{tr(p.tools.pitchCorrection.manualNotes ? "karta.nutyEdytor" : "karta.nuty")}</li>
                      <li>{tr("karta.znak")}</li>
                      {p.mastering.referenceMastering === "addon" ? <li>{tr("karta.referencja.addonKup")}</li> : null}
                      {p.mastering.referenceMastering === "included" ? <li>{tr("karta.referencja.included")}</li> : null}
                    </ul>
                    <p className="mt-auto text-xs text-[var(--brd-mute)]">{tier === "FREE" ? tr("freeStopka") : PLAN_TRIAL_DAYS === 0 ? tr("bezOkresuProbnego") : null}</p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mt-8 border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4" aria-labelledby="premium-packs" data-testid="premium-packs">
            <h2 id="premium-packs" className="brd-display text-xl font-semibold tracking-tight">{tr("pakietyTytul")}</h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-[var(--brd-ink-soft)]">{tr("pakietyLead")}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
              <li>{tr("pakietTake", { n: PLAN_PACK_CATALOG.take.units, cena: money.format(PLAN_PACK_CATALOG.take.pricePln) })}</li>
              <li>{tr("pakietMaster", { n: PLAN_PACK_CATALOG.master.units, cena: money.format(PLAN_PACK_CATALOG.master.pricePln) })}</li>
              <li>{tr("pakietYoutubeGold", { n: 2, cena: money.format(9.99) })}</li>
              <li>{tr("pakietYoutubeSilver", { cena: money.format(14.99) })}</li>
              <li>{tr("pakietYoutubeBronze", { cena: money.format(24.99) })}</li>
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
              <li>{tr("przypis.pakiety")}</li>
              <li>{tr("przypis.mastery")}</li>
              <li>{tr("przypis.free")}</li>
              <li>{tr("przypis.upgrade")}</li>
              <li>{tr("przypis.raw", { n: OWN_TAKE_RAW_DOWNLOADS_DAILY, plan: LABEL[TIERS.find((x) => PLAN_POLICY[x].downloads.ownTakeRaw) ?? "GOLD"] })}</li>
              <li>{tr("przypis.nuty")}</li>
              <li>
                {tr("przypis.bramki", {
                  freeLyrics: PLAN_POLICY.FREE.tools.aiLyricsPerDay,
                  bronzeLyrics: PLAN_POLICY.BRONZE.tools.aiLyricsPerDay,
                  silverLyrics: PLAN_POLICY.SILVER.tools.aiLyricsPerDay,
                  goldLyrics: PLAN_POLICY.GOLD.tools.aiLyricsPerDay,
                  shortFx: PLAN_POLICY.FREE.studio.maxFxEffects,
                  longFx: PLAN_POLICY.SILVER.studio.maxFxEffects,
                })}
              </li>
              <li>{tr("przypis.znak")}</li>
            </ul>
          </section>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-how">
            <h2 id="premium-how" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">{tr("jakDostacPremiumDzis")}</h2>
            <p className="mt-4 max-w-[60ch] text-sm leading-relaxed text-[var(--brd-ink-soft)]">{tr("poziomGdyPlatnosci")}</p>
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
