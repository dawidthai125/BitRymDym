import Link from "next/link";

import { HomeTracklist } from "@/components/home/home-tracklist";
import { TapeDeck } from "@/components/home/tape-deck";
import { AppShell } from "@/components/site/app-shell";
import { getCurrentProfile } from "@/lib/auth/session";
import { toPublicCatalogItem } from "@/lib/beats/public";
import { listPublishedBeats } from "@/lib/beats/service";
import { presentBeats } from "@/lib/ui/demo-beats";

/**
 * Home — design v3 "Nocna sesja" (prototype).
 * Poster hero + loaded tape → side-A tracklist → rack of what you can do
 * → session timeline → Premium neon → closing poster.
 * Copy and data are the product's own; nothing invented.
 */
const CAPABILITIES = [
  {
    channel: "Bez konta",
    title: "Słuchaj i pobieraj bity",
    body: "Przeglądaj katalog. Pobrania mają dzienny limit — gość ma niższy niż zalogowany użytkownik.",
  },
  {
    channel: "Konto + bit opublikowany",
    title: "Nagraj wers na bicie",
    body: "Na stronie bitu albo w Studio. Czas nagrania zależy od poziomu Premium na koncie (i od długości bitu).",
  },
  {
    channel: "Wymaga konta",
    title: "Złóż numer w Studio",
    body: "Projekty, ścieżki, miks i eksport w jednym miejscu. Ile ścieżek dostaniesz — zależy od Premium.",
  },
] as const;

const STEPS = [
  {
    t: "Wybierz bit",
    d: "Wejdź w katalog, odsłuchaj i wybierz opublikowany beat.",
  },
  {
    t: "Załóż konto",
    d: "Do nagrania i Studio potrzebujesz konta. Sam katalog możesz przeglądać od razu.",
  },
  {
    t: "Nagraj wers",
    d: "Na stronie bitu albo w Studio — tylko na opublikowanym bicie, w limicie Premium na koncie.",
  },
  {
    t: "Dopracuj w Studio",
    d: "Ułóż ścieżki, miksuj i eksportuj. Wyższy Premium = więcej ścieżek i lepszy eksport.",
  },
] as const;

const wrap =
  "mx-auto w-full max-w-[var(--brd-max-wide)] px-[max(var(--brd-gutter),env(safe-area-inset-left))]";

const ctaPrimary =
  "inline-flex min-h-12 items-center justify-center rounded-[var(--tape-r-panel)] border border-tape-amber-deep bg-tape-amber px-6 font-poster text-lg font-extrabold uppercase tracking-[0.1em] text-tape-on-amber shadow-[0_3px_0_0_var(--tape-amber-deep)] transition-[transform,box-shadow,background-color] duration-[var(--tape-dur-fast)] ease-[var(--tape-ease-out)] hover:bg-[#f7bb5c] active:translate-y-[3px] active:shadow-none";

const ctaSecondary =
  "inline-flex min-h-12 items-center justify-center rounded-[var(--tape-r-panel)] border border-tape-cream-soft px-6 font-poster text-lg font-bold uppercase tracking-[0.1em] text-tape-cream transition-colors duration-[var(--tape-dur-fast)] hover:border-tape-cream hover:bg-tape-panel";

export default async function HomePage() {
  const session = await getCurrentProfile();
  const beats = presentBeats(
    (await listPublishedBeats()).map(toPublicCatalogItem),
  );
  const featured = beats[0] ?? null;
  const strip = beats.slice(0, 6);

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
                <span className="block">Bity,</span>
                <span className="block">nagranie</span>
                <span className="block">
                  i <span className="text-tape-amber">Studio</span>
                </span>
              </h1>
              <p className="mt-5 font-[family-name:var(--font-display)] text-[clamp(1.35rem,2.4vw,1.9rem)] italic leading-snug text-tape-cream">
                dla rapera.
              </p>
              <p className="mt-3 max-w-[44ch] text-base leading-relaxed text-tape-cream-soft sm:text-lg">
                Znajdź beat, nagraj wers, złóż numer w Studio. Dla ludzi, którzy
                chcą szybko przejść od pomysłu do nagrania — bez zbędnego szumu.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/beats" className={ctaPrimary}>
                  Przeglądaj bity
                </Link>
                <Link href="#jak-to-dziala" className={ctaSecondary}>
                  Jak to działa
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5">
              <TapeDeck beat={featured} />
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
                Posłuchaj z katalogu
              </h2>
              <Link
                href="/beats"
                className="inline-flex min-h-11 items-center gap-2 font-mono text-sm uppercase tracking-[0.14em] text-tape-amber underline-offset-4 hover:underline"
              >
                Pełny spis <span aria-hidden="true">→</span>
              </Link>
            </div>
            <HomeTracklist beats={strip} />
          </div>
        </section>

        {/* WHAT YOU CAN DO — rack units, not cards */}
        <section aria-labelledby="home-co-mozesz" className="border-b border-tape-line bg-tape-deck">
          <div className={`${wrap} grid gap-8 py-[var(--tape-section-y)] lg:grid-cols-12`}>
            <div className="lg:col-span-4">
              <h2
                id="home-co-mozesz"
                className="font-poster text-[length:var(--tape-text-xl)] font-black uppercase leading-[0.9] text-tape-cream"
              >
                Co możesz tu zrobić
              </h2>
              <p className="mt-4 max-w-[38ch] font-[family-name:var(--font-display)] text-lg italic leading-snug text-tape-cream-soft">
                Katalog otwarty od razu. Nagranie i Studio — po założeniu konta,
                na bicie ze statusem opublikowanym.
              </p>
            </div>
            <ul className="space-y-2 lg:col-span-8">
              {CAPABILITIES.map((c) => (
                <li
                  key={c.title}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[var(--tape-r-panel)] border border-tape-line-strong bg-tape-panel px-4 py-5 shadow-[inset_0_1px_0_#ffffff0d,0_6px_16px_-10px_#000] sm:px-5"
                >
                  <span className="tape-rack-screw self-start" aria-hidden="true" />
                  <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[12rem_1fr]">
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-tape-amber">
                      {c.channel}
                    </p>
                    <div>
                      <h3 className="font-poster text-2xl font-bold uppercase leading-none text-tape-cream">
                        {c.title}
                      </h3>
                      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-tape-cream-soft sm:text-base">
                        {c.body}
                      </p>
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
              Jak to działa
            </h2>
            <ol className="mt-10 grid gap-y-10 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4 lg:gap-x-0">
              {STEPS.map((s, i) => (
                <li key={s.t} className="relative lg:pr-8">
                  <div aria-hidden="true" className="mb-4 flex items-center gap-3">
                    <span className="size-3 rounded-full border-2 border-tape-amber bg-tape-soot" />
                    <span className="h-px flex-1 bg-[repeating-linear-gradient(90deg,var(--tape-line-strong)_0_6px,transparent_6px_10px)]" />
                  </div>
                  <p className="font-poster text-6xl font-black leading-none text-tape-amber tabular-nums">
                    {i + 1}
                  </p>
                  <h3 className="mt-3 font-poster text-2xl font-bold uppercase leading-none text-tape-cream">
                    {s.t}
                  </h3>
                  <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-tape-cream-soft sm:text-base">
                    {s.d}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* PREMIUM — the one neon sign */}
        <section aria-labelledby="home-premium" className="border-b border-tape-line bg-[#0a0807]">
          <div className={`${wrap} grid gap-8 py-[var(--tape-section-y)] lg:grid-cols-12 lg:items-center`}>
            <div className="lg:col-span-7">
              <h2
                id="home-premium"
                className="font-poster text-[length:var(--tape-text-xl)] font-black uppercase leading-[0.9] text-tape-cream"
              >
                Więcej limitu,{" "}
                <span className="tape-neon-sign">gdy tego potrzebujesz</span>
              </h2>
              <p className="mt-5 max-w-[56ch] text-base leading-relaxed text-tape-cream-soft">
                Premium (Free → Gold) podnosi limity pobrań, ścieżek w Studio,
                czas nagrania i jakość eksportu. Uprawnienia już działają —{" "}
                <strong className="font-semibold text-tape-cream">
                  bez samodzielnego zakupu w aplikacji
                </strong>
                . Szczegóły, HOLD i co jest dopiero planowane — na stronie
                Premium.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
              <Link href="/premium" className={ctaPrimary}>
                Szczegóły Premium
              </Link>
              {!session ? (
                <Link href="/sign-up" className={ctaSecondary}>
                  Załóż konto
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
              Zacznij od katalogu
            </h2>
            <p className="mx-auto mt-5 max-w-[34ch] font-[family-name:var(--font-display)] text-xl italic text-tape-cream-soft">
              Potem konto, nagranie i Studio — w tej kolejności.
            </p>
            <div className="mt-8">
              <Link href="/beats" className={ctaPrimary}>
                Otwórz katalog
              </Link>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
