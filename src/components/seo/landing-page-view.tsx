import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BeatsCatalogClient } from "@/components/brand/beats-catalog-client";
import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import { getCurrentProfile } from "@/lib/auth/session";
import { listFavoriteBeatIds } from "@/lib/beats/favorites";
import { toPublicCatalogItem } from "@/lib/beats/public";
import { listPublishedBeats } from "@/lib/beats/service";
import { collectGenres, genrePagePath } from "@/lib/seo/genre-pages";
import { articleJsonLd, beatListJsonLd, breadcrumbJsonLd, faqPageJsonLd } from "@/lib/seo/json-ld";
import { GUIDE_BASE, GUIDES, guidePath, type Guide } from "@/lib/seo/guides";
import { JsonLdScript } from "@/lib/seo/json-ld-script";
import { LANDING_PAGES, landingPage, landingPath, type LandingPage } from "@/lib/seo/landing-pages";
import { isStoreApp } from "@/lib/site/store-app-server";
import { getPublicSiteUrl } from "@/lib/site-url";
import { presentBeats } from "@/lib/ui/demo-beats";

const BEATS_ON_PAGE = 12;

export async function landingMetadata(slug: string): Promise<Metadata> {
  const page = landingPage(slug);
  if (page.webOnly && (await isStoreApp())) return { title: page.h1, robots: { index: false } };
  return pageMetadata({ title: page.metaTitle, description: page.metaDescription, path: landingPath(slug) });
}

export async function guideMetadata(guide: Guide): Promise<Metadata> {
  return pageMetadata({ title: guide.metaTitle, description: guide.metaDescription, path: guidePath(guide.slug) });
}

export function LandingPageView({ slug }: { slug: string }) {
  return <ContentPageView page={landingPage(slug)} path={landingPath(slug)} />;
}

export function GuidePageView({ guide }: { guide: Guide }) {
  return <ContentPageView page={guide} path={guidePath(guide.slug)} guide={guide} />;
}

/** Landing page or guide: copy + FAQ (FAQPage JSON-LD) + newest beats of a lane. */
async function ContentPageView({ page, path, guide }: { page: LandingPage; path: string; guide?: Guide }) {
  const storeApp = await isStoreApp();
  if (page.webOnly && storeApp) notFound();
  const origin = getPublicSiteUrl();

  const lane = page.beats;
  const raw = lane ? await listPublishedBeats({ catalogLane: lane }).catch(() => []) : [];
  const session = lane ? await getCurrentProfile() : null;
  const favoriteIds = session ? await listFavoriteBeatIds(session.userId) : [];
  const beats = presentBeats(raw.slice(0, BEATS_ON_PAGE).map(toPublicCatalogItem));
  const genres = lane === "free" ? collectGenres(raw) : [];
  const related = [
    ...GUIDES.filter((g) => g.slug !== page.slug).map((g) => ({ href: guidePath(g.slug), label: g.navLabel })),
    ...LANDING_PAGES.filter((p) => p.slug !== page.slug && !(p.webOnly && storeApp)).map((p) => ({ href: landingPath(p.slug), label: p.navLabel })),
  ];
  const crumbs = guide
    ? [{ name: "Poradniki", path: GUIDE_BASE }, { name: page.h1, path }]
    : [{ name: page.h1, path }];

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <JsonLdScript data={breadcrumbJsonLd(origin, crumbs)} />
        {guide ? (
          <JsonLdScript
            data={articleJsonLd(origin, { path, headline: page.h1, description: page.metaDescription, datePublished: guide.datePublished })}
          />
        ) : null}
        <JsonLdScript data={faqPageJsonLd(origin, { path, items: page.faq })} />
        {beats.length > 0 ? <JsonLdScript data={beatListJsonLd(origin, { name: page.h1, path, beats })} /> : null}
        <PageFrame width="wide" className="py-8 sm:py-10">
          {guide ? (
            <Link href={GUIDE_BASE} className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]">
              ← Wszystkie poradniki
            </Link>
          ) : null}
          <header className="mb-6 max-w-3xl border-b-4 border-[var(--brd-ink)] pb-4">
            <h1 className="brd-display text-[length:var(--tape-text-xl)] leading-[0.88]">{page.h1}</h1>
            <p className="mt-4 font-[family-name:var(--font-display)] text-lg italic leading-snug text-[var(--brd-ink-soft)]">
              {page.lead}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {page.cta.map((c, i) => (
                <BrdLink key={c.href} href={c.href} variant={i === 0 ? "primary" : "secondary"}>
                  {c.label}
                </BrdLink>
              ))}
            </div>
          </header>

          {beats.length > 0 ? (
            <section aria-label={page.h1} className="mb-10" data-testid="landing-beats">
              <BeatsCatalogClient beats={beats} favoriteIds={favoriteIds} signedIn={session != null} />
              {genres.length > 0 ? (
                <nav aria-label="Gatunki" className="mt-4 flex flex-wrap items-center gap-x-3 text-sm text-[var(--brd-mute)]">
                  <span>Gatunki:</span>
                  {genres.map((g) => (
                    <Link key={g.slug} href={genrePagePath(g.slug)} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-[var(--brd-ink)]">
                      Bity {g.label}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </section>
          ) : null}

          <article className="max-w-3xl space-y-8 text-[0.95rem] leading-relaxed text-[var(--brd-ink-soft)]" data-testid="landing-copy">
            {page.sections.map((s) => (
              <section key={s.h2} className="space-y-3">
                <h2 className="brd-display text-2xl text-[var(--brd-ink)]">{s.h2}</h2>
                {s.paragraphs.map((p) => (
                  <p key={p.slice(0, 32)}>{p}</p>
                ))}
              </section>
            ))}

            <section aria-labelledby="landing-faq" className="space-y-4 border-t border-[var(--brd-line)] pt-6">
              <h2 id="landing-faq" className="brd-display text-2xl text-[var(--brd-ink)]">Najczęstsze pytania</h2>
              {page.faq.map((f) => (
                <div key={f.q}>
                  <h3 className="font-semibold text-[var(--brd-ink)]">{f.q}</h3>
                  <p className="mt-1">{f.a}</p>
                </div>
              ))}
            </section>
          </article>

          <nav aria-label="Zobacz też" className="mt-10 flex flex-wrap items-center gap-x-4 border-t border-[var(--brd-line)] pt-4 text-sm text-[var(--brd-mute)]" data-testid="landing-related">
            <span>Zobacz też:</span>
            {related.map((r) => (
              <Link key={r.href} href={r.href} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-[var(--brd-ink)]">
                {r.label}
              </Link>
            ))}
          </nav>
        </PageFrame>
      </main>
    </AppShell>
  );
}
