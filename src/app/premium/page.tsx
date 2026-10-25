import Link from "next/link";

import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import {
  OWN_TAKE_RAW_DOWNLOADS_DAILY,
  SAMPLE_POLICY_DEFAULTS,
} from "@/config/recording";
import {
  PREMIUM_ANON_DOWNLOADS_DAILY,
  PREMIUM_TIER_MATRIX,
} from "@/config/premium-tiers";

export const metadata = {
  title: "Premium — BitRymDym",
  description:
    "Poziomy Premium w BitRymDym: limity pobrań, ścieżki w Studio i jakość eksportu. Bez obiecanek o płatnościach, których jeszcze nie ma.",
};

const tiers = [
  { id: "FREE" as const, label: "Free" },
  { id: "BRONZE" as const, label: "Bronze" },
  { id: "SILVER" as const, label: "Silver" },
  { id: "GOLD" as const, label: "Gold" },
];

export default function PremiumPage() {
  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-3xl py-10 sm:py-12">
          <SectionLabel>Premium</SectionLabel>
          <h1 className="brd-display mt-2 max-w-[18ch] text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[0.95] tracking-tight">
            Więcej limitu. Lepszy eksport. Te same Studio.
          </h1>
          <p className="mt-4 max-w-[42ch] text-[0.95rem] leading-relaxed text-[var(--brd-ink-soft)]">
            Premium to warstwa uprawnień na koncie (Free / Bronze / Silver / Gold).
            Działa w produkcie już teraz — ale{" "}
            <strong className="font-medium text-[var(--brd-ink)]">
              nie ma jeszcze samodzielnej płatności w aplikacji
            </strong>
            . Ceny i sklep są otwarte decyzjami produktu (OD-07).
          </p>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-now">
            <h2 id="premium-now" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">
              Co działa już teraz
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
              <li>
                <span className="font-medium text-[var(--brd-ink)]">Limity pobrań bitów</span>
                {" — "}
                gość: {PREMIUM_ANON_DOWNLOADS_DAILY}/dzień; konto Free:{" "}
                {PREMIUM_TIER_MATRIX.FREE.downloadsDaily}; Bronze:{" "}
                {PREMIUM_TIER_MATRIX.BRONZE.downloadsDaily}; Silver:{" "}
                {PREMIUM_TIER_MATRIX.SILVER.downloadsDaily}; Gold:{" "}
                {PREMIUM_TIER_MATRIX.GOLD.downloadsDaily}.
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">Ścieżki w projekcie Studio</span>
                {" — "}
                Free {PREMIUM_TIER_MATRIX.FREE.studioMaxTracks}, Bronze{" "}
                {PREMIUM_TIER_MATRIX.BRONZE.studioMaxTracks}, Silver{" "}
                {PREMIUM_TIER_MATRIX.SILVER.studioMaxTracks}, Gold{" "}
                {PREMIUM_TIER_MATRIX.GOLD.studioMaxTracks} (ścieżka Master nie
                liczy się do limitu tak samo jak beat — według kontraktu Studio).
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">Jakość eksportu / miksu</span>
                {" — "}
                wyższe poziomy odblokowują lepsze formaty (m.in. HQ MP3, Mix/Master
                Pro, WAV na Gold) zgodnie z macierzą uprawnień w produkcie.
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">
                  Czas nagrania Quick Take / TTL próbki
                </span>
                {" — "}
                aktywne limity nagrania według poziomu Premium: Free{" "}
                {SAMPLE_POLICY_DEFAULTS.FREE.maxRecordingSeconds}&nbsp;s /{" "}
                {SAMPLE_POLICY_DEFAULTS.FREE.ttlSeconds / 3600}&nbsp;h ważności
                próbki; Bronze{" "}
                {SAMPLE_POLICY_DEFAULTS.BRONZE.maxRecordingSeconds}&nbsp;s /{" "}
                {SAMPLE_POLICY_DEFAULTS.BRONZE.ttlSeconds / 3600}&nbsp;h; Silver{" "}
                {SAMPLE_POLICY_DEFAULTS.SILVER.maxRecordingSeconds}&nbsp;s /{" "}
                {SAMPLE_POLICY_DEFAULTS.SILVER.ttlSeconds / 3600}&nbsp;h; Gold
                do {SAMPLE_POLICY_DEFAULTS.GOLD.maxRecordingSeconds}&nbsp;s /{" "}
                {SAMPLE_POLICY_DEFAULTS.GOLD.ttlSeconds / 3600}&nbsp;h. Czas nie
                przekroczy też długości bitu. Dla Bronze/Silver/Gold operator
                może podnieść sam max czas (1–180&nbsp;s); ważność próbki i
                dzienne limity sesji zostają z tych wartości domyślnych.
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">
                  Pobranie własnej próbki RAW
                </span>
                {" — "}
                tylko Gold, do {OWN_TAKE_RAW_DOWNLOADS_DAILY} pobrań dziennie.
                Serwer odmawia RAW na niższych planach.
              </li>
            </ul>

            <div className="mt-6 overflow-x-auto border border-[var(--brd-line)]">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <caption className="sr-only">
                  Porównanie dziennych pobrań i maksymalnej liczby ścieżek Studio
                  według poziomu Premium
                </caption>
                <thead className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/50">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Poziom
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Pobrania / dzień
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Ścieżki Studio
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
                          {t.label}
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
            </div>
            <p className="mt-3 text-xs text-[var(--brd-mute)]">
              Pobrania i ścieżki Studio — z macierzy Premium. Nagrania — z
              polityki próbek (z możliwą korektą czasu przez operatora). To nie
              jest cennik.
            </p>
          </section>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-planned">
            <h2 id="premium-planned" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">
              Zaplanowane / jeszcze nie w sklepie
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
              <li>
                <span className="font-medium text-[var(--brd-ink)]">Ceny i płatności</span>
                {" — "}
                otwarte (OD-07 / OD-04). Nie podajemy kwot ani okresów próbnych,
                bo nie są zatwierdzone.
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">Samodzielny zakup w UI</span>
                {" — "}
                odroczony. Nie ma tu przycisku „Kup Premium”.
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">Katalog Premium / STEMS</span>
                {" — "}
                odroczone w mapie produktu.
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">
                  Osobny „Full Take Premium” z historycznego SSOT §22–23
                </span>
                {" — "}
                nie jest osobnym sklepem; aktywne limity Quick Take to Sample
                Policy powyżej. Osobne liczby overlay z dawnego opisu pozostają
                OPEN / DEFERRED względem tamtego tekstu.
              </li>
              <li>
                <span className="font-medium text-[var(--brd-ink)]">
                  Retencja artefaktów Gold
                </span>
                {" — "}
                w produkcji{" "}
                <span className="font-medium text-[var(--brd-ink)]">28 dni</span>
                {" "}
                (decyzja Ownera 2026-10-25, zgodna z kontraktem export). Wariant 90
                dni pozostaje tylko w katalogu designu — bez janitora i bez
                aktywacji Premium Retention (HOLD).
              </li>
            </ul>
          </section>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-hold">
            <h2 id="premium-hold" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">
              Wstrzymane (HOLD)
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
              <span className="font-medium text-[var(--brd-ink)]">Premium Retention</span>
              {" — "}
              lokalny WIP, nieaktywny na produkcji. Nie jest produktem, którego możesz
              dziś „włączyć” w ustawieniach.
            </p>
          </section>

          <section className="mt-10 border-t border-[var(--brd-line)] pt-8" aria-labelledby="premium-how">
            <h2 id="premium-how" className="brd-display text-xl font-semibold tracking-tight sm:text-2xl">
              Jak dostać Premium dziś
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
              Poziom nadaje się po stronie konta (m.in. przez panel administracyjny
              z audytem zmian). Bez działających płatności w aplikacji nie obiecujemy
              self‑serve checkoutu. Jak tylko sklep będzie gotowy — ta strona dostanie
              jasny CTA zakupowy.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <BrdLink href="/beats">Idź do katalogu</BrdLink>
              <BrdLink href="/sign-up" variant="secondary">
                Załóż konto
              </BrdLink>
              <Link
                href="/about"
                className="inline-flex min-h-11 items-center px-2 text-sm text-[var(--brd-green)] underline-offset-4 hover:underline"
              >
                O BitRymDym
              </Link>
            </div>
          </section>
        </PageFrame>
      </main>
    </AppShell>
  );
}
