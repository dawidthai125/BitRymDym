import { useLibText } from "@/i18n/use-lib-text";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { OverflowXScrollRegion } from "@/components/brand/overflow-x-scroll-region";
import { AppShell } from "@/components/site/app-shell";
import {
  OWN_TAKE_RAW_DOWNLOADS_DAILY,
  SAMPLE_POLICY_DEFAULTS,
} from "@/config/recording";
import {
  PREMIUM_ANON_DOWNLOADS_DAILY,
  PREMIUM_TIER_MATRIX,
} from "@/config/premium-tiers";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.premiumPage");
  return {
  title: t("metaTitle"),
  description:
    t("metaDescription"),
};
}

const tiers = [
  { id: "FREE" as const, label: "Free" },
  { id: "BRONZE" as const, label: "Bronze" },
  { id: "SILVER" as const, label: "Silver" },
  { id: "GOLD" as const, label: "Gold" },
];

export default function PremiumPage() {
  const tl = useLibText();
  const tr = useTranslations("account.premiumPage");
  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-3xl py-10 sm:py-12">
          <SectionLabel>{tr("premium")}</SectionLabel>
          <h1 className="brd-display mt-2 max-w-[18ch] text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[0.95] tracking-tight">
            {tr("wiecejLimituLepszyEksport")}
          </h1>
          <p className="mt-4 max-w-[42ch] text-[0.95rem] leading-relaxed text-[var(--brd-ink-soft)]">
            {tr("premiumToWarstwaUprawnien")}{" "}
            <strong className="font-medium text-[var(--brd-ink)]">
              {tr("nieMaJeszczeSamodzielnej")}
            </strong>
            {tr("cenyISklepSa")}
          </p>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-now">
            <h2 id="premium-now" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">
              {tr("coDzialaJuzTeraz")}
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
              <li>
                <span className="font-medium text-[var(--brd-ink)]">{tr("limityPobranBitow")}</span>
                {" — "}
                {tr("gosc")}{" "}{PREMIUM_ANON_DOWNLOADS_DAILY}{tr("dzienKontoFree")}{" "}
                {PREMIUM_TIER_MATRIX.FREE.downloadsDaily}{tr("bronze")}{" "}
                {PREMIUM_TIER_MATRIX.BRONZE.downloadsDaily}{tr("silver")}{" "}
                {PREMIUM_TIER_MATRIX.SILVER.downloadsDaily}{tr("gold")}{" "}
                {PREMIUM_TIER_MATRIX.GOLD.downloadsDaily}.
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">{tr("sciezkiWProjekcieStudio")}</span>
                {" — "}
                {tr("free")}{" "}{PREMIUM_TIER_MATRIX.FREE.studioMaxTracks}{tr("bronze2")}{" "}
                {PREMIUM_TIER_MATRIX.BRONZE.studioMaxTracks}{tr("silver2")}{" "}
                {PREMIUM_TIER_MATRIX.SILVER.studioMaxTracks}{tr("gold2")}{" "}
                {PREMIUM_TIER_MATRIX.GOLD.studioMaxTracks} {tr("sciezkaMasterNieLiczy")}
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">{tr("jakoscEksportuMiksu")}</span>
                {" — "}
                {tr("wyzszePoziomyOdblokowujaLepsze")}
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">
                  {tr("czasNagraniaQuickTake")}
                </span>
                {" — "}
                {tr("aktywneLimityNagraniaWedlug")}{" "}
                {SAMPLE_POLICY_DEFAULTS.FREE.maxRecordingSeconds}&nbsp;s /{" "}
                {SAMPLE_POLICY_DEFAULTS.FREE.ttlSeconds / 3600}{tr("hWaznosciProbkiBronze")}{" "}
                {SAMPLE_POLICY_DEFAULTS.BRONZE.maxRecordingSeconds}&nbsp;s /{" "}
                {SAMPLE_POLICY_DEFAULTS.BRONZE.ttlSeconds / 3600}{tr("hSilver")}{" "}
                {SAMPLE_POLICY_DEFAULTS.SILVER.maxRecordingSeconds}&nbsp;s /{" "}
                {SAMPLE_POLICY_DEFAULTS.SILVER.ttlSeconds / 3600}{tr("hGoldDo")}{" "}{SAMPLE_POLICY_DEFAULTS.GOLD.maxRecordingSeconds}&nbsp;s /{" "}
                {SAMPLE_POLICY_DEFAULTS.GOLD.ttlSeconds / 3600}{tr("hCzasNiePrzekroczy")}
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">
                  {tr("pobranieWlasnejProbkiRaw")}
                </span>
                {" — "}
                {tr("tylkoGoldDo")}{" "}{OWN_TAKE_RAW_DOWNLOADS_DAILY} {tr("pobranDziennieSerwerOdmawia")}
              </li>
            </ul>

            <OverflowXScrollRegion
              className="mt-6 overflow-x-auto border border-[var(--brd-line)]"
              ariaLabel={tr("porownanieDziennychPobranI2")}
            >
              <table className="w-full min-w-[28rem] text-left text-sm">
                <caption className="sr-only">
                  {tr("porownanieDziennychPobranI")}
                </caption>
                <thead className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/50">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {tr("poziom")}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {tr("pobraniaDzien")}
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      {tr("sciezkiStudio")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t) => {
                    const lim = PREMIUM_TIER_MATRIX[t.id];
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-[var(--brd-line)] last:border-0"
                      >
                        <th scope="row" className="px-3 py-2.5 font-medium text-[var(--brd-ink)]">
                          {tl(t.label)}
                        </th>
                        <td className="px-3 py-2.5 text-[var(--brd-ink-soft)]">
                          {lim.downloadsDaily}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--brd-ink-soft)]">
                          {lim.studioMaxTracks}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </OverflowXScrollRegion>
            <p className="mt-3 text-xs text-[var(--brd-mute)]">
              {tr("pobraniaISciezkiStudio")}
            </p>
          </section>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-planned">
            <h2 id="premium-planned" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">
              {tr("zaplanowaneJeszczeNieW")}
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
              <li>
                <span className="font-medium text-[var(--brd-ink)]">{tr("cenyIPlatnosci")}</span>
                {" — "}
                {tr("otwarteOd07Od")}
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">{tr("samodzielnyZakupWUi")}</span>
                {" — "}
                {tr("odroczonyNieMaTu")}
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">{tr("katalogPremiumStems")}</span>
                {" — "}
                {tr("odroczoneWMapieProduktu")}
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">
                  {tr("osobnyFullTakePremium")}
                </span>
                {" — "}
                {tr("nieJestOsobnymSklepem")}
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">
                  {tr("retencjaArtefaktowGold")}
                </span>
                {" — "}
                {tr("wProdukcji")}{" "}
                <span className="font-medium text-[var(--brd-ink)]">{tr("n28Dni")}</span>
                {" "}
                {tr("decyzjaOwnera202610")}
              </li>
            </ul>
          </section>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-hold">
            <h2 id="premium-hold" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">
              {tr("wstrzymaneHold")}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
              <span className="font-medium text-[var(--brd-ink)]">{tr("premiumRetention")}</span>
              {" — "}
              {tr("lokalnyWipNieaktywnyNa")}
            </p>
          </section>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-how">
            <h2 id="premium-how" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">
              {tr("jakDostacPremiumDzis")}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
              {tr("poziomNadajeSiePo")}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <BrdLink href="/beats">{tr("idzDoKatalogu")}</BrdLink>
              <BrdLink href="/sign-up" variant="secondary">
                {tr("zalozKonto")}
              </BrdLink>
              <Link
                href="/about"
                className="inline-flex min-h-11 items-center px-2 text-sm text-[var(--brd-green)] underline-offset-4 hover:underline"
              >
                {tr("oBitrymdym")}
              </Link>
            </div>
          </section>
        </PageFrame>
      </main>
    </AppShell>
  );
}
