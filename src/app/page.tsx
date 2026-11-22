import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { FREE_WATERMARK_PER_DAY, freeWatermarkDownloadEnabled } from "@/lib/studio/deliver/policy";

import { OverflowXScrollRegion } from "@/components/brand/overflow-x-scroll-region";
import { HomePromoFilm } from "@/components/home/home-promo-film";
import { CommunityShelf } from "@/components/community/community-shelf";
import { HomeFeaturedWork } from "@/components/home/home-featured-work";
import { HomeTracklist } from "@/components/home/home-tracklist";
import { TapeDeck } from "@/components/home/tape-deck";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import {
  GUEST_POLICY,
  PLAN_POLICY,
  yearlySavingPercent,
  type PlanDownloadQuality,
} from "@/config/plan-policy";
import { getCurrentProfile } from "@/lib/auth/session";
import { toPublicCatalogItem } from "@/lib/beats/public";
import { listPublishedBeats } from "@/lib/beats/service";
import { loadFeaturedWorkOfWeek } from "@/lib/catalog/featured-work-server";
import { presentBeats } from "@/lib/ui/demo-beats";
import type { PremiumTier } from "@/types/premium";
import { cn } from "@/lib/utils";

const HOME_TIERS: PremiumTier[] = ["FREE", "BRONZE", "SILVER", "GOLD"];
/** Rows shown on the plan cards; the full table stays one click away. */
const CARD_ROW_IDS = ["take", "sesje", "sciezki", "stemy", "mastery", "pobieranie"] as const;
const TIER_LABEL: Record<PremiumTier, string> = {
  FREE: "Free",
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
};
const QUALITY_ORDER: PlanDownloadQuality[] = [
  "WAV_MASTER",
  "WAV_PRO",
  "WAV_COMPAT",
  "MP3_320",
  "MP3_256",
  "MP3_192",
  "MP3_128",
];

function bestQuality(tier: PremiumTier): PlanDownloadQuality | null {
  const qualities = PLAN_POLICY[tier].downloads.qualities;
  return QUALITY_ORDER.find((quality) => qualities.includes(quality)) ?? null;
}

/**
 * Home — design v3 "Nocna sesja" (prototype).
 * Poster hero + loaded tape → side-A tracklist → rack of what you can do
 * → session timeline → Premium neon → closing poster.
 * Copy and data are the product's own; nothing invented.
 */
const CAPABILITIES = [
  {
    channel: "bezKonta",
    title: "sluchajIPobierajBity",
    body: "przegladajKatalogPobraniaMaja",
  },
  {
    channel: "kontoBitOpublikowany",
    title: "nagrajWersNaBicie",
    body: "naStronieBituAlbo",
  },
  {
    channel: "wymagaKonta",
    title: "zlozNumerWStudio",
    body: "projektySciezkiMiksI",
  },
] as const;



const wrap =
  "mx-auto w-full max-w-[var(--brd-max-wide)] px-[max(var(--brd-gutter),env(safe-area-inset-left))]";

const ctaPrimary =
  "inline-flex min-h-12 items-center justify-center rounded-[var(--tape-r-panel)] border border-tape-amber-deep bg-tape-amber px-6 font-poster text-lg font-extrabold uppercase tracking-[0.1em] text-tape-on-amber shadow-[0_3px_0_0_var(--tape-amber-deep)] transition-[transform,box-shadow,background-color] duration-[var(--tape-dur-fast)] ease-[var(--tape-ease-out)] hover:bg-[#f7bb5c] active:translate-y-[3px] active:shadow-none";

const ctaSecondary =
  "inline-flex min-h-12 items-center justify-center rounded-[var(--tape-r-panel)] border border-tape-cream-soft px-6 font-poster text-lg font-bold uppercase tracking-[0.1em] text-tape-cream transition-colors duration-[var(--tape-dur-fast)] hover:border-tape-cream hover:bg-tape-panel";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const m = await getTranslations("meta.pages");
  return pageMetadata({ title: m("homeTitle"), description: m("homeDescription"), path: "/", absoluteTitle: true });
}

export default async function HomePage() {
  const t = await getTranslations("home.page");
  const tc = await getTranslations("home.page.consts");
  const locale = await getLocale();
  const money = new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const publishedPromise = listPublishedBeats({ limit: 8 });
  // Null (no feature this week / work withdrawn / table missing) → the section is not rendered.
  const featuredPromise = loadFeaturedWorkOfWeek().catch(() => null);
  const session = await getCurrentProfile();
  const steps = [
    { title: tc("wybierzBit"), body: t("krokBit", { s: GUEST_POLICY.previewSeconds }) },
    { title: tc("zalozKonto"), body: tc("doNagraniaIStudio") },
    {
      title: tc("nagrajWers"),
      body: t("krokNagranie", {
        free: PLAN_POLICY.FREE.recording.maxTakeSeconds,
        gold: PLAN_POLICY.GOLD.recording.maxTakeSeconds,
      }),
    },
    {
      title: tc("dopracujWStudio"),
      body: t("krokStudio", { gold: PLAN_POLICY.GOLD.studio.maxRecordingTracks }),
    },
    {
      title: tc("stemy"),
      body: t("krokStemy", {
        silver: PLAN_POLICY.SILVER.studio.maxStems,
        gold: PLAN_POLICY.GOLD.studio.maxStems,
      }),
    },
    { title: tc("automatykaNuty"), body: tc("krokAutomatyka") },
    { title: tc("mixIMaster"), body: tc("krokMix") },
    {
      title: tc("oddajPlik"),
      body: t(freeWatermarkDownloadEnabled() ? "krokPlikZnak" : "krokPlik", { gold: PLAN_POLICY.GOLD.downloads.youtubeVideosPerWeek, n: FREE_WATERMARK_PER_DAY }),
    },
  ];
  const planRows: { id: string; label: string; cell: (tier: PremiumTier) => string }[] = [
    {
      id: "cena",
      label: t("planCena"),
      cell: (tier) => {
        const price = PLAN_POLICY[tier].price;
        if (price.monthlyPln == null) return t("planCenaFree");
        const save = yearlySavingPercent(price);
        const monthly = money.format(price.monthlyPln);
        const yearly = money.format(price.yearlyPln ?? 0);
        return save
          ? t("planCenaPlatna", { m: monthly, y: yearly, n: save })
          : `${monthly}`;
      },
    },
    {
      id: "take",
      label: t("planDlugosc"),
      cell: (tier) => t("planSekundy", { n: PLAN_POLICY[tier].recording.maxTakeSeconds }),
    },
    {
      id: "sesje",
      label: t("planSesje"),
      cell: (tier) => String(PLAN_POLICY[tier].recording.sessionsPerDay),
    },
    {
      id: "sciezki",
      label: t("planSciezki"),
      cell: (tier) => String(PLAN_POLICY[tier].studio.maxRecordingTracks),
    },
    {
      id: "stemy",
      label: t("planStemy"),
      cell: (tier) => {
        const stems = PLAN_POLICY[tier].studio.maxStems;
        return stems > 0 ? String(stems) : "—";
      },
    },
    {
      id: "rozciecie",
      label: t("planRozciecie"),
      cell: (tier) => (PLAN_POLICY[tier].studio.maxStems > 0 ? t("planTak") : "—"),
    },
    {
      id: "teksty",
      label: t("planTeksty"),
      cell: (tier) => String(PLAN_POLICY[tier].tools.aiLyricsPerDay),
    },
    {
      id: "wysokosc",
      label: t("planWysokosc"),
      cell: (tier) => (PLAN_POLICY[tier].studio.clipPitch ? t("planTak") : "—"),
    },
    {
      id: "sciszanie",
      label: t("planSciszanie"),
      cell: (tier) => (PLAN_POLICY[tier].studio.sidechain ? t("planTak") : "—"),
    },
    {
      id: "efekty",
      label: t("planEfekty"),
      cell: (tier) => String(PLAN_POLICY[tier].studio.maxFxEffects),
    },
    {
      id: "sample",
      label: t("planSample"),
      cell: (tier) => String(PLAN_POLICY[tier].studio.maxSamples),
    },
    {
      id: "projekty",
      label: t("planProjekty"),
      cell: (tier) => String(PLAN_POLICY[tier].studio.maxProjects),
    },
    {
      id: "mastery",
      label: t("planMastery"),
      cell: (tier) => String(PLAN_POLICY[tier].mastering.mastersPerMonth),
    },
    {
      id: "pobieranie",
      label: t("planPobieranie"),
      cell: (tier) => {
        if (tier === "FREE" && freeWatermarkDownloadEnabled()) return t("planPobieranieZnak", { n: FREE_WATERMARK_PER_DAY });
        const quality = bestQuality(tier);
        return quality ? t(`jakosc.${quality}`) : t("planBrak");
      },
    },
    {
      id: "yt",
      label: t("planYt"),
      cell: (tier) => {
        const perWeek = PLAN_POLICY[tier].downloads.youtubeVideosPerWeek;
        return perWeek > 0 ? t("planYtTydzien", { n: perWeek }) : "—";
      },
    },
    {
      id: "ref",
      label: t("planReferencja"),
      cell: (tier) => t(`planRef.${PLAN_POLICY[tier].mastering.referenceMastering}`),
    },
    {
      id: "presety",
      label: t("planPresety"),
      cell: (tier) => {
        const presets = PLAN_POLICY[tier].tools.vocalPresets;
        if (presets.roleSets) return t("planPresetyRole", { n: presets.maxOwn });
        return presets.maxOwn > 0 ? String(presets.maxOwn) : "—";
      },
    },
    {
      id: "nuty",
      label: t("planEdytorNut"),
      cell: (tier) => (PLAN_POLICY[tier].tools.pitchCorrection.manualNotes ? t("planTak") : "—"),
    },
    {
      id: "czyszczenie",
      label: t("planCzyszczenie"),
      cell: (tier) => String(PLAN_POLICY[tier].tools.vocalCleanup.perDay),
    },
    {
      id: "linki",
      label: t("planLinki"),
      cell: (tier) => {
        const links = PLAN_POLICY[tier].sharing.listenLinksActive;
        return links == null ? t("planBezLimitu") : String(links);
      },
    },
    {
      id: "bitek",
      label: t("planBitek"),
      cell: (tier) =>
        t(PLAN_POLICY[tier].tools.bitekMemory === "project" ? "planBitekProjekt" : "planBitekSesja"),
    },
    {
      id: "waznosc",
      label: t("planWaznosc"),
      cell: (tier) =>
        t("planGodziny", { n: Math.round(PLAN_POLICY[tier].recording.takeTtlSeconds / 3600) }),
    },
    {
      id: "retencja",
      label: t("planRetencja"),
      cell: (tier) => t("planDni", { n: PLAN_POLICY[tier].retentionDays }),
    },
  ];
  const community = await getTranslations("community");
  const beats = presentBeats(
    (await publishedPromise).map(toPublicCatalogItem),
  );
  const strip = beats.slice(0, 6);
  const featured = await featuredPromise;

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-surface tape-grain overflow-hidden">
        {/* HERO — poster type + the loaded tape */}
        <section aria-labelledby="home-hero" className="border-b border-tape-line">
          <div
            className={`${wrap} grid gap-10 py-10 sm:py-14 lg:grid-cols-12 lg:items-center lg:gap-8 lg:py-20`}
          >
            <div className="lg:col-span-7">
              <h1
                id="home-hero"
                className="font-poster text-[length:var(--tape-text-mega)] font-black uppercase leading-[0.84] tracking-[-0.01em] text-tape-cream"
              >
                <span className="block">{t("bity")}</span>
                <span className="block">{t("nagranie")}</span>
                <span className="block">
                  {t("and")} <span className="text-tape-amber">{t("studio")}</span>
                </span>
              </h1>
              <p className="mt-5 font-[family-name:var(--font-display)] text-[clamp(1.35rem,2.4vw,1.9rem)] italic leading-snug text-tape-cream">
                {t("dlaRapera")}
              </p>
              <p className="mt-3 max-w-[44ch] text-base leading-relaxed text-tape-cream-soft sm:text-lg">
                {t("znajdzBeatNagrajWers")}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/beats" className={ctaPrimary}>
                  {t("przegladajBity")}
                </Link>
                {session ? (
                  <Link href="/studio" className={ctaSecondary}>
                    {t("otworzStudio")}
                  </Link>
                ) : null}
                <Link href="#jak-to-dziala" className={ctaSecondary}>
                  {t("jakToDziala")}
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5">
              <TapeDeck beats={strip} />
            </div>
          </div>
        </section>

        {/* CATALOG — side A tracklist */}
        <section aria-labelledby="home-katalog" className="border-b border-tape-line">
          <div className={`${wrap} py-[var(--tape-section-y)]`}>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-4 border-tape-cream pb-3">
              <h2
                id="home-katalog"
                className="font-poster text-[length:var(--tape-text-xl)] font-black uppercase leading-[0.9] text-tape-cream"
              >
                {t("posluchajZKatalogu")}
              </h2>
              <Link
                href="/beats"
                className="inline-flex min-h-11 items-center gap-2 font-mono text-sm uppercase tracking-[0.14em] text-tape-amber underline-offset-4 hover:underline"
              >
                {t("pelnySpis")}{" "}<span aria-hidden="true">→</span>
              </Link>
            </div>
            <CommunityShelf current="beats" tone="tape" />
            <HomeTracklist beats={strip} />
            <p className="mt-6 max-w-prose border-l-2 border-tape-amber pl-4 text-sm leading-relaxed text-tape-cream-soft sm:text-base">
              {community("pitch")}
            </p>
          </div>
        </section>

        {/* TRACK OF THE WEEK — only while a live work is featured for this Warsaw week */}
        {featured ? <HomeFeaturedWork featured={featured} /> : null}

        {/* WHAT YOU CAN DO — rack units, not cards */}
        <section aria-labelledby="home-co-mozesz" className="border-b border-tape-line bg-tape-deck">
          <div className={`${wrap} grid gap-8 py-[var(--tape-section-y)] lg:grid-cols-12`}>
            <div className="lg:col-span-4">
              <h2
                id="home-co-mozesz"
                className="font-poster text-[length:var(--tape-text-xl)] font-black uppercase leading-[0.9] text-tape-cream"
              >
                {t("coMozeszTuZrobic")}
              </h2>
              <p className="mt-4 max-w-[38ch] font-[family-name:var(--font-display)] text-lg italic leading-snug text-tape-cream-soft">
                {t("katalogOtwartyOdRazu")}
              </p>
            </div>
            <ul className="space-y-2 lg:col-span-8">
              {CAPABILITIES.map((c) => (
                <li
                  key={tc(c.title)}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[var(--tape-r-panel)] border border-tape-line-strong bg-tape-panel px-4 py-5 shadow-[inset_0_1px_0_#ffffff0d,0_6px_16px_-10px_#000] sm:px-5"
                >
                  <span className="tape-rack-screw self-start" aria-hidden="true" />
                  <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[12rem_1fr]">
                    <p className="font-mono text-sm uppercase tracking-[0.08em] text-tape-amber">
                      {tc(c.channel)}
                    </p>
                    <div>
                      <h3 className="font-poster text-2xl font-bold uppercase leading-none text-tape-cream">
                        {tc(c.title)}
                      </h3>
                      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-tape-cream-soft sm:text-base">
                        {tc(c.body)}
                      </p>
                      {c.title === "nagrajWersNaBicie" ? (
                        <p className="mt-2">
                          <Link
                            href="/nagrywarka"
                            className="text-sm text-tape-amber underline-offset-4 hover:underline"
                          >
                            {tc("otworzNagrywarke")}
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <span className="tape-rack-screw self-end" aria-hidden="true" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* HOW IT WORKS — the session, step by step (order matters) */}
        <section
          id="jak-to-dziala"
          aria-labelledby="home-jak"
          className="scroll-mt-20 border-b border-tape-line"
        >
          <div className={`${wrap} py-[var(--tape-section-y)]`}>
            <h2
              id="home-jak"
              className="font-poster text-[length:var(--tape-text-xl)] font-black uppercase leading-[0.9] text-tape-cream"
            >
              {t("jakToDziala")}
            </h2>
            <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-12">
              <div className="lg:sticky lg:top-24 lg:col-span-7">
                <HomePromoFilm />
              </div>
              <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1 lg:gap-y-5">
                {steps.map((step, i) => (
                  <li
                    key={step.title}
                    className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 border-b border-tape-line pb-5 last:border-0"
                  >
                    <p className="font-poster text-4xl font-black leading-none text-tape-amber tabular-nums">
                      {i + 1}
                    </p>
                    <div>
                      <h3 className="font-poster text-xl font-bold uppercase leading-none text-tape-cream sm:text-2xl">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-tape-cream-soft sm:text-base">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <p className="mt-8 text-sm text-tape-cream-soft sm:text-base">
              <Link href="/jak-nagrac" className="underline underline-offset-4 hover:text-tape-cream" data-testid="home-limits-license-link">
                {t("limityILicencja")}
              </Link>
            </p>
          </div>
        </section>

        {/* PREMIUM — the one neon sign */}
        <section id="premium" aria-labelledby="home-premium" className="border-b border-tape-line bg-[#0a0807]">
          <div className={`${wrap} py-[var(--tape-section-y)]`}>
            <h2
              id="home-premium"
              className="font-poster text-[length:var(--tape-text-xl)] font-black uppercase leading-[0.9] text-tape-cream"
            >
              {t("wiecejLimitu")}{" "}
              <span className="tape-neon-sign">{t("gdyTegoPotrzebujesz")}</span>
            </h2>
            <p className="mt-5 max-w-[68ch] text-base leading-relaxed text-tape-cream-soft">
              {t("premiumFreeGoldPodnosi")}{" "}
              <strong className="font-semibold text-tape-cream">
                {t("bezSamodzielnegoZakupuW")}
              </strong>
              {t("szczegolyHoldICo")}
            </p>
            <ul
              aria-label={t("planNajwazniejsze")}
              className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              data-testid="home-plan-cards"
            >
              {HOME_TIERS.map((tier) => {
                const price = PLAN_POLICY[tier].price;
                const save = yearlySavingPercent(price);
                return (
                  <li
                    key={tier}
                    className={cn(
                      "flex flex-col rounded-[var(--tape-r-panel)] border bg-tape-panel p-5",
                      tier === "GOLD" ? "border-tape-amber" : "border-tape-line-strong",
                    )}
                  >
                    <p className="font-poster text-3xl font-black uppercase leading-none text-tape-cream">
                      {TIER_LABEL[tier]}
                    </p>
                    <p className="mt-3 font-poster text-4xl font-black leading-none text-tape-amber">
                      {price.monthlyPln == null ? t("planCenaFree") : money.format(price.monthlyPln)}{" "}
                      <span className="font-sans text-base font-normal text-tape-cream-soft">
                        {price.monthlyPln == null ? t("planBezOplat") : t("planMies")}
                      </span>
                    </p>
                    <p className="mt-1 min-h-5 text-sm text-tape-cream-soft">
                      {price.monthlyPln != null && save
                        ? t("planRokTaniej", { y: money.format(price.yearlyPln ?? 0), n: save })
                        : null}
                    </p>
                    <dl className="mt-4 divide-y divide-tape-line border-t border-tape-line text-sm">
                      {planRows
                        .filter((row) => (CARD_ROW_IDS as readonly string[]).includes(row.id))
                        .map((row) => (
                          <div key={row.id} className="flex items-baseline justify-between gap-3 py-2">
                            <dt className="text-tape-cream-soft">{row.label}</dt>
                            <dd className="text-right font-medium text-tape-cream">{row.cell(tier)}</dd>
                          </div>
                        ))}
                    </dl>
                  </li>
                );
              })}
            </ul>
            <details className="group mt-6">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-mono text-sm uppercase tracking-[0.08em] text-tape-amber hover:underline [&::-webkit-details-marker]:hidden">
                {t("planWszystkie", { n: planRows.length })}
                <span aria-hidden="true" className="transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
            <OverflowXScrollRegion className="mt-4 overflow-x-auto border border-tape-line" ariaLabel={t("planTabelaAria")}>
              <table className="w-full min-w-[44rem] text-left text-sm text-tape-cream" data-testid="home-plan-board">
                <caption className="sr-only">{t("planTabelaAria")}</caption>
                <thead className="border-b border-tape-line bg-tape-panel">
                  <tr>
                    <th scope="col" className="px-3 py-3 font-mono text-sm uppercase tracking-[0.08em] text-tape-amber">
                      {t("planCo")}
                    </th>
                    {HOME_TIERS.map((tier) => (
                      <th key={tier} scope="col" className="px-3 py-3 font-poster text-xl uppercase text-tape-cream">
                        {TIER_LABEL[tier]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {planRows.map((row) => (
                    <tr key={row.id} className="border-b border-tape-line last:border-0">
                      <th scope="row" className="px-3 py-2.5 font-medium text-tape-cream">
                        {row.label}
                      </th>
                      {HOME_TIERS.map((tier) => (
                        <td key={tier} className="px-3 py-2.5 text-tape-cream-soft">
                          {row.cell(tier)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </OverflowXScrollRegion>
            <ul className="mt-4 max-w-[72ch] space-y-2 text-sm leading-relaxed text-tape-cream-soft">
              <li>{t("planWspolne")}</li>
              <li>
                {t("planBramki", {
                  freeLyrics: PLAN_POLICY.FREE.tools.aiLyricsPerDay,
                  bronzeLyrics: PLAN_POLICY.BRONZE.tools.aiLyricsPerDay,
                  silverLyrics: PLAN_POLICY.SILVER.tools.aiLyricsPerDay,
                  goldLyrics: PLAN_POLICY.GOLD.tools.aiLyricsPerDay,
                  shortFx: PLAN_POLICY.FREE.studio.maxFxEffects,
                  longFx: PLAN_POLICY.SILVER.studio.maxFxEffects,
                })}
              </li>
              <li>{t("planGosc", { s: GUEST_POLICY.previewSeconds })}</li>
            </ul>
            </details>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/premium" className={ctaPrimary}>
                {t("szczegolyPremium")}
              </Link>
              {!session ? (
                <Link href="/sign-up" className={ctaSecondary}>
                  {t("zalozKonto")}
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {/* CLOSING POSTER */}
        <section aria-labelledby="home-cta">
          <div className={`${wrap} py-[var(--tape-section-y)] text-center`}>
            <h2
              id="home-cta"
              className="mx-auto max-w-[12ch] font-poster text-[length:var(--tape-text-mega)] font-black uppercase leading-[0.84] text-tape-cream"
            >
              {t("zacznijOdKatalogu")}
            </h2>
            <p className="mx-auto mt-5 max-w-[34ch] font-[family-name:var(--font-display)] text-xl italic text-tape-cream-soft">
              {t("potemKontoNagranieI")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/beats" className={ctaPrimary}>
                {t("otworzKatalog")}
              </Link>
              {session ? (
                <Link href="/studio" className={ctaSecondary}>
                  {t("otworzStudio")}
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
