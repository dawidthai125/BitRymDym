import Link from "next/link";

import { BeatArtwork } from "@/components/brand/beat-artwork";
import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { HomeBeatStrip } from "@/components/brand/home-beat-strip";
import { HomePlayButton } from "@/components/brand/home-play-button";
import { VisualScene } from "@/components/brand/visual-scene";
import { Waveform } from "@/components/brand/waveform";
import { AppShell } from "@/components/site/app-shell";
import { formatDurationSeconds, toPublicCatalogItem } from "@/lib/beats/public";
import { listPublishedBeats } from "@/lib/beats/service";
import { getCurrentProfile } from "@/lib/auth/session";
import { presentBeats } from "@/lib/ui/demo-beats";

/**
 * Home — czytelna IA dla nowego użytkownika.
 * Hero → Co możesz zrobić → Jak to działa → Katalog → Premium → CTA
 */
export default async function HomePage() {
  const session = await getCurrentProfile();
  const beats = presentBeats(
    (await listPublishedBeats()).map(toPublicCatalogItem),
  );
  const featured = beats[0] ?? null;
  const strip = beats.slice(0, 6);

  return (
    <AppShell tone="public">
      <main>
        {/* 1. HERO — wartość + główne CTA */}
        <section
          className="border-b border-[var(--brd-line)]"
          aria-labelledby="home-hero"
        >
          <div className="grid lg:grid-cols-12 lg:min-h-[min(58vh,32rem)]">
            <div className="flex flex-col justify-end gap-3.5 px-[max(var(--brd-gutter),env(safe-area-inset-left))] py-7 lg:col-span-5 lg:justify-center lg:py-10 lg:pr-8 xl:pl-[max(var(--brd-gutter),calc((100vw-92rem)/2+var(--brd-gutter)))]">
              <SectionLabel>BitRymDym</SectionLabel>
              <h1
                id="home-hero"
                className="brd-display max-w-[14ch] text-[clamp(2.35rem,5vw,3.75rem)] leading-[0.9] font-semibold tracking-tight"
              >
                Bity, nagranie i Studio dla rapera
              </h1>
              <p className="max-w-[36ch] text-[0.95rem] leading-snug text-[var(--brd-ink-soft)] sm:text-base">
                Znajdź beat, nagraj wers, złóż numer w Studio. Dla ludzi, którzy
                chcą szybko przejść od pomysłu do nagrania — bez zbędnego szumu.
              </p>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <BrdLink href="/beats">Przeglądaj bity</BrdLink>
                <BrdLink href="#jak-to-dziala" variant="secondary">
                  Jak to działa
                </BrdLink>
              </div>
            </div>

            <div className="relative aspect-[5/4] w-full sm:aspect-[16/11] lg:col-span-7 lg:aspect-auto lg:min-h-full">
              <VisualScene
                kind="studio-mic"
                label="Scena studyjna (materiał demo)"
                dim
                priority
                focus="58% 42%"
                className="absolute inset-0 h-full w-full border-0"
              />
              {featured ? (
                <div
                  data-testid="home-featured-media-overlay"
                  className="absolute inset-x-0 bottom-0 z-10 border-t border-[color-mix(in_srgb,var(--brd-on-media)_22%,transparent)] bg-[color-mix(in_srgb,var(--brd-graphite)_88%,transparent)] px-3 py-3 text-[var(--brd-on-media)] sm:px-5 sm:py-4"
                >
                  <div className="flex items-center gap-3">
                    <BeatArtwork
                      variant={featured.artworkVariant}
                      title={featured.title}
                      size="sm"
                      className="size-12 border-[color-mix(in_srgb,var(--brd-on-media)_18%,transparent)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="brd-meta text-[9px] uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--brd-on-media)_55%,transparent)]">
                        Z katalogu
                      </p>
                      <p className="truncate text-sm font-medium">
                        {featured.title}
                      </p>
                      <p className="brd-meta truncate text-[10px] text-[color-mix(in_srgb,var(--brd-on-media)_62%,transparent)]">
                        {featured.producer} · {featured.bpm} BPM ·{" "}
                        {formatDurationSeconds(featured.durationSeconds)}
                      </p>
                    </div>
                    <HomePlayButton beat={featured} compact />
                  </div>
                  <div aria-hidden="true">
                    <Waveform
                      seed={featured.id}
                      progress={0.32}
                      bars={56}
                      tone="inverted"
                      heightClassName="mt-2.5 h-6"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* 2. Co możesz zrobić — tylko potwierdzone powierzchnie */}
        <section
          className="border-b border-[var(--brd-line)]"
          aria-labelledby="home-co-mozesz"
        >
          <PageFrame width="wide" className="py-8 sm:py-9">
            <SectionLabel>Na start</SectionLabel>
            <h2
              id="home-co-mozesz"
              className="brd-display mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]"
            >
              Co możesz tu zrobić
            </h2>
            <p className="mt-2 max-w-[42ch] text-sm text-[var(--brd-ink-soft)]">
              Katalog otwarty od razu. Nagranie i Studio — po założeniu konta, na
              bicie ze statusem opublikowanym.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <li className="border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4">
                <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
                  Bez konta
                </p>
                <h3 className="mt-1.5 font-medium text-[var(--brd-ink)]">
                  Słuchaj i pobieraj bity
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
                  Przeglądaj katalog. Pobrania mają dzienny limit — gość ma niższy
                  niż zalogowany użytkownik.
                </p>
              </li>
              <li className="border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4">
                <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
                  Konto + bit opublikowany
                </p>
                <h3 className="mt-1.5 font-medium text-[var(--brd-ink)]">
                  Nagraj wers na bicie
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
                  Na stronie bitu albo w Studio. Czas nagrania zależy od poziomu
                  Premium na koncie (i od długości bitu).
                </p>
              </li>
              <li className="border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 sm:col-span-2 lg:col-span-1">
                <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
                  Wymaga konta
                </p>
                <h3 className="mt-1.5 font-medium text-[var(--brd-ink)]">
                  Złóż numer w Studio
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
                  Projekty, ścieżki, miks i eksport w jednym miejscu. Ile ścieżek
                  dostaniesz — zależy od Premium.
                </p>
              </li>
            </ul>
          </PageFrame>
        </section>

        {/* 3. Jak to działa */}
        <section
          id="jak-to-dziala"
          className="scroll-mt-20 border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/35"
          aria-labelledby="home-jak"
        >
          <PageFrame width="wide" className="py-8 sm:py-9">
            <SectionLabel>Proces</SectionLabel>
            <h2
              id="home-jak"
              className="brd-display mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]"
            >
              Jak to działa
            </h2>
            <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  n: "1",
                  t: "Wybierz bit",
                  d: "Wejdź w katalog, odsłuchaj i wybierz opublikowany beat.",
                },
                {
                  n: "2",
                  t: "Załóż konto",
                  d: "Do nagrania i Studio potrzebujesz konta. Sam katalog możesz przeglądać od razu.",
                },
                {
                  n: "3",
                  t: "Nagraj wers",
                  d: "Na stronie bitu albo w Studio — tylko na opublikowanym bicie, w limicie Premium na koncie.",
                },
                {
                  n: "4",
                  t: "Dopracuj w Studio",
                  d: "Ułóż ścieżki, miksuj i eksportuj. Wyższy Premium = więcej ścieżek i lepszy eksport.",
                },
              ].map((step) => (
                <li
                  key={step.n}
                  className="border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4"
                >
                  <p className="brd-meta text-[10px] uppercase tracking-[0.16em] text-[var(--brd-green)]">
                    Krok {step.n}
                  </p>
                  <h3 className="mt-1.5 font-medium">{step.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
                    {step.d}
                  </p>
                </li>
              ))}
            </ol>
          </PageFrame>
        </section>

        {/* 4. Katalog — dowód produktu */}
        <section className="border-b border-[var(--brd-line)]" aria-labelledby="home-katalog">
          <PageFrame width="wide" className="py-7 sm:py-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2 brd-zine-masthead pb-3">
              <div>
                <SectionLabel>Katalog</SectionLabel>
                <h2
                  id="home-katalog"
                  className="brd-display mt-0.5 text-2xl font-semibold tracking-tight sm:text-[1.75rem]"
                >
                  Posłuchaj z katalogu
                </h2>
              </div>
              <Link
                href="/beats"
                className="brd-meta inline-flex min-h-11 items-center text-[11px] uppercase tracking-[0.14em] text-[var(--brd-green)] hover:underline"
              >
                Pełny spis →
              </Link>
            </div>
            <HomeBeatStrip beats={strip} />
          </PageFrame>
        </section>

        {/* 5. Premium — spokojny most */}
        <section className="border-b border-[var(--brd-line)]" aria-labelledby="home-premium">
          <PageFrame width="wide" className="py-8 sm:py-9">
            <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-7">
                <SectionLabel>Premium</SectionLabel>
                <h2
                  id="home-premium"
                  className="brd-display mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]"
                >
                  Więcej limitu, gdy tego potrzebujesz
                </h2>
                <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-[var(--brd-ink-soft)]">
                  Premium (Free → Gold) podnosi limity pobrań, ścieżek w Studio,
                  czas nagrania i jakość eksportu. Uprawnienia już działają —{" "}
                  <strong className="font-medium text-[var(--brd-ink)]">
                    bez samodzielnego zakupu w aplikacji
                  </strong>
                  . Szczegóły, HOLD i co jest dopiero planowane — na stronie
                  Premium.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:col-span-5 lg:justify-end">
                <BrdLink href="/premium">Szczegóły Premium</BrdLink>
                {!session ? (
                  <BrdLink href="/sign-up" variant="secondary">
                    Załóż konto
                  </BrdLink>
                ) : null}
              </div>
            </div>
          </PageFrame>
        </section>

        {/* 6. Final CTA — jedno główne działanie */}
        <section aria-labelledby="home-cta">
          <div className="relative min-h-[14rem] overflow-hidden sm:min-h-[16rem]">
            <VisualScene
              kind="night-drive"
              label="Nocna atmosfera"
              dim
              focus="50% 60%"
              className="absolute inset-0 border-0"
            />
            <PageFrame
              width="wide"
              className="relative flex min-h-[14rem] flex-col items-center justify-center py-11 text-center sm:min-h-[16rem] sm:py-12"
            >
              <h2
                id="home-cta"
                className="brd-display max-w-md text-[clamp(1.65rem,3.5vw,2.35rem)] font-semibold tracking-tight text-balance text-[var(--brd-on-media)] drop-shadow-sm"
              >
                Zacznij od katalogu bitów
              </h2>
              <p className="mt-2 max-w-[32ch] text-sm text-[color-mix(in_srgb,var(--brd-on-media)_78%,transparent)]">
                Potem konto, nagranie i Studio — w tej kolejności.
              </p>
              <div className="mt-5">
                <BrdLink href="/beats">Otwórz katalog</BrdLink>
              </div>
            </PageFrame>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
