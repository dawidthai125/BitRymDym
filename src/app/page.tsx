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
 * Home Polish Final — frozen IA (5 blocks), composition polish only.
 * Hero → Bity → Nagraj → Studio → Final CTA
 */
export default async function HomePage() {
  const session = await getCurrentProfile();
  const beats = presentBeats(
    (await listPublishedBeats()).map(toPublicCatalogItem),
  );
  const featured = beats[0] ?? null;
  const strip = beats.slice(0, 6);
  const recordHref = featured ? `/beat/${featured.id}` : "/beats";

  return (
    <AppShell tone="public">
      <main>
        {/* 1. HERO — okładka numeru (zine / label cover) */}
        <section className="border-b border-[var(--brd-line)]">
          <div className="grid lg:grid-cols-12 lg:min-h-[min(62vh,34rem)]">
            <div className="flex flex-col justify-end gap-3.5 px-[max(var(--brd-gutter),env(safe-area-inset-left))] py-7 lg:col-span-5 lg:justify-center lg:py-10 lg:pr-8 xl:pl-[max(var(--brd-gutter),calc((100vw-92rem)/2+var(--brd-gutter)))]">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <SectionLabel>BitRymDym</SectionLabel>
                <span className="brd-meta text-[10px] uppercase tracking-[0.16em] text-[var(--brd-mute)]">
                  Zine · niezależne wydawnictwo
                </span>
              </div>
              <h1 className="brd-display max-w-[12ch] text-[clamp(2.5rem,5.4vw,4.25rem)] leading-[0.88] font-semibold tracking-tight">
                Tu zaczynają się Twoje wersy
              </h1>
              <p className="max-w-[30ch] text-[0.95rem] leading-snug text-[var(--brd-ink-soft)] sm:text-base">
                Katalog bitów. Mikrofon. Numer.
                <br />
                Papierowa okładka — cyfrowa sesja.
              </p>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <BrdLink href="/beats">Otwórz katalog</BrdLink>
                <BrdLink href={recordHref} variant="secondary">
                  Nagraj wers
                </BrdLink>
              </div>
            </div>

            <div className="relative aspect-[5/4] w-full sm:aspect-[16/11] lg:col-span-7 lg:aspect-auto lg:min-h-full">
              <VisualScene
                kind="studio-mic"
                label="Okładka — scena studyjna (materiał demo)"
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
                  <Waveform
                    seed={featured.id}
                    progress={0.32}
                    bars={56}
                    tone="inverted"
                    heightClassName="mt-2.5 h-6"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* 2. BITY — spis treści wydawnictwa */}
        <section className="border-b border-[var(--brd-line)]">
          <PageFrame width="wide" className="py-7 sm:py-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2 brd-zine-masthead pb-3">
              <div>
                <SectionLabel>Katalog · spis</SectionLabel>
                <h2 className="brd-display mt-0.5 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                  Słuchaj. Wybierz. Nagraj.
                </h2>
              </div>
              <Link
                href="/beats"
                className="brd-meta text-[11px] uppercase tracking-[0.14em] text-[var(--brd-green)] hover:underline"
              >
                Pełny spis →
              </Link>
            </div>
            <HomeBeatStrip beats={strip} />
          </PageFrame>
        </section>

        {/* 3. NAGRAJ — recording surface teaser */}
        <section className="border-b border-[var(--brd-line)]">
          <div className="grid lg:grid-cols-12">
            <div className="relative aspect-[4/3] lg:col-span-7 lg:aspect-auto lg:min-h-[24rem]">
              <VisualScene
                kind="booth"
                label="Kabina nagraniowa"
                dim
                focus="45% 40%"
                className="absolute inset-0 border-0"
              />
              <div className="absolute inset-x-4 bottom-4 z-10 border border-[color-mix(in_srgb,var(--brd-on-media)_18%,transparent)] bg-[color-mix(in_srgb,var(--brd-graphite)_78%,transparent)] p-3 text-[var(--brd-on-media)] sm:left-5 sm:right-auto sm:w-[min(100%,20rem)] lg:hidden">
                <Waveform
                  seed="home-rec-mobile"
                  progress={0.34}
                  bars={40}
                  tone="inverted"
                  heightClassName="h-8"
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="brd-meta text-[10px] text-[color-mix(in_srgb,var(--brd-on-media)_60%,transparent)]">
                    00:12 / 00:30
                  </p>
                  <span className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-rec)]">
                    REC
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3.5 bg-[var(--brd-paper-deep)]/40 px-[max(var(--brd-gutter),1rem)] py-7 lg:col-span-5 lg:px-9 lg:py-9">
              <div className="inline-flex items-center gap-2">
                <span className="size-2 bg-[var(--brd-rec)]" aria-hidden />
                <SectionLabel className="text-[var(--brd-rec)]">
                  Nagrywanie
                </SectionLabel>
              </div>
              <h2 className="brd-display text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                Mikrofon. Limit. Take.
              </h2>
              <p className="max-w-[34ch] text-sm leading-relaxed text-[var(--brd-ink-soft)]">
                Przygotuj mic, złap wers na bicie, domknij take przed limitem.
                <br />
                Czerwony sygnał REC — tylko gdy naprawdę nagrywasz.
              </p>
              <div className="hidden border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3 lg:block">
                <Waveform
                  seed="home-rec"
                  progress={0.36}
                  bars={56}
                  heightClassName="h-11"
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="brd-meta text-[10px] text-[var(--brd-mute)]">
                    00:12 / 00:30
                  </p>
                  <span className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-rec)]">
                    REC
                  </span>
                </div>
              </div>
              <BrdLink href={recordHref} variant="danger" className="self-start">
                Nagraj na bicie
              </BrdLink>
            </div>
          </div>
        </section>

        {/* 4. STUDIO — mini workspace preview */}
        <section className="border-b border-[var(--brd-line)]">
          <PageFrame width="wide" className="py-7 sm:py-8">
            <div className="mb-4 max-w-lg">
              <SectionLabel>Studio</SectionLabel>
              <h2 className="brd-display mt-0.5 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                Twoje studio. Twój numer.
              </h2>
              <p className="mt-2 text-sm text-[var(--brd-ink-soft)]">
                Nagrania, miksy i eksporty w jednym miejscu.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
              <div className="relative min-h-[16rem] overflow-hidden border border-[var(--brd-line)] sm:min-h-[18rem] lg:col-span-8 lg:min-h-[22rem]">
                <VisualScene
                  kind="console"
                  label="Studio — konsoleta"
                  dim
                  focus="50% 45%"
                  className="absolute inset-0 border-0"
                />
                <div className="absolute inset-x-0 bottom-0 space-y-2 bg-[linear-gradient(180deg,transparent,rgba(10,14,12,0.9))] p-4 text-[var(--brd-on-media)] sm:p-5">
                  <p className="brd-meta text-[10px] uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--brd-on-media)_55%,transparent)]">
                    Studio
                  </p>
                  <Waveform
                    seed="home-studio-main"
                    progress={0.52}
                    bars={72}
                    tone="inverted"
                    heightClassName="h-9"
                  />
                </div>
              </div>

              <div className="flex flex-col border border-[var(--brd-line)] bg-[var(--brd-paper)] lg:col-span-4">
                <div className="flex flex-1 flex-col justify-between gap-4 p-4 sm:p-5">
                  <div>
                    <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
                      Z katalogu · podgląd
                    </p>
                    {featured ? (
                      <div className="mt-3 flex items-start gap-3">
                        <BeatArtwork
                          variant={featured.artworkVariant}
                          title={featured.title}
                          size="md"
                          className="size-[4.5rem]"
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium leading-tight">
                            {featured.title}
                          </p>
                          <p className="text-sm text-[var(--brd-mute)]">
                            {featured.producer}
                          </p>
                          <p className="brd-meta text-[10px] text-[var(--brd-green)]">
                            Do otwarcia w Studio
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-[var(--brd-mute)]">
                        Tu wyląduje pierwszy bit z katalogu.
                      </p>
                    )}
                  </div>
                  <div>
                    <Waveform
                      seed="home-studio-side"
                      progress={0.4}
                      bars={36}
                      heightClassName="h-7"
                    />
                    <BrdLink
                      href={session ? "/studio" : "/sign-up"}
                      variant="secondary"
                      className="mt-4 w-full"
                    >
                      Otwórz studio
                    </BrdLink>
                  </div>
                </div>
              </div>
            </div>
          </PageFrame>
        </section>

        {/* 5. FINAL CTA */}
        <section>
          <div className="relative min-h-[16rem] overflow-hidden sm:min-h-[18rem]">
            <VisualScene
              kind="night-drive"
              label="Nocna atmosfera"
              dim
              focus="50% 60%"
              className="absolute inset-0 border-0"
            />
            <PageFrame
              width="wide"
              className="relative flex min-h-[16rem] flex-col items-center justify-center py-12 text-center sm:min-h-[18rem] sm:py-14"
            >
              <h2 className="brd-display max-w-lg text-[clamp(1.85rem,4vw,2.75rem)] font-semibold tracking-tight text-balance text-[var(--brd-on-media)] drop-shadow-sm">
                Masz bit.
                <br />
                Masz głos.
                <br />
                Teraz zrób numer.
              </h2>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <BrdLink href={session ? "/beats" : "/sign-up"}>
                  Zacznij tworzyć
                </BrdLink>
                <BrdLink href="/beats" variant="onDark">
                  Przeglądaj bity
                </BrdLink>
              </div>
            </PageFrame>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
