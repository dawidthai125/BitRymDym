import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { BeatsCatalogClient } from "@/components/brand/beats-catalog-client";
import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf } from "@/components/community/community-shelf";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import { getCurrentProfile } from "@/lib/auth/session";
import { listFavoriteBeatIds } from "@/lib/beats/favorites";
import { toPublicCatalogItem } from "@/lib/beats/public";
import { listPublishedBeats } from "@/lib/beats/service";
import { beatsInGenre, collectGenres, genrePagePath } from "@/lib/seo/genre-pages";
import { presentBeats } from "@/lib/ui/demo-beats";

type GenrePageProps = { params: Promise<{ slug: string }> };

/**
 * Free-catalogue genre landing page. Same data path as /beats (listPublishedBeats,
 * free lane, PUBLISHED + public); dynamic like the rest of the catalogue.
 * One query per request, shared by generateMetadata and the page.
 */
const loadGenre = cache(async (slug: string) => {
  const beats = await listPublishedBeats({ catalogLane: "free" });
  const genres = collectGenres(beats);
  const genre = genres.find((g) => g.slug === slug) ?? null;
  return { genre, genres, beats: genre ? beatsInGenre(beats, slug) : [] };
});

export async function generateMetadata({ params }: GenrePageProps): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("beats.genrePage");
  const { genre } = await loadGenre(slug);
  if (!genre) return { title: t("notFoundTitle"), robots: { index: false } };
  const path = genrePagePath(genre.slug);
  const title = t("metaTitle", { genre: genre.label });
  const description = t("metaDescription", { genre: genre.label });
  return pageMetadata({ title, description, path, image: { url: `${path}/opengraph-image`, width: 1200, height: 630, alt: title } });
}

export default async function BeatsGenrePage({ params }: GenrePageProps) {
  const { slug } = await params;
  const { genre, genres, beats: inGenre } = await loadGenre(slug);
  if (!genre || inGenre.length === 0) notFound();
  const t = await getTranslations("beats.genrePage");
  const session = await getCurrentProfile();
  const favoriteIds = session ? await listFavoriteBeatIds(session.userId) : [];
  const beats = presentBeats(inGenre.map(toPublicCatalogItem));
  const others = genres.filter((g) => g.slug !== genre.slug);

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <CommunityShelf current="beats" />
          <Link
            href="/beats"
            className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
          >
            {t("wszystkieBity")}
          </Link>
          <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-4 border-[var(--brd-ink)] pb-4 pt-2 sm:pt-4">
            <div className="min-w-0 space-y-1">
              <h1 className="brd-display text-[length:var(--tape-text-xl)] leading-[0.88]">
                {t("h1", { genre: genre.label })}
              </h1>
              <p className="brd-meta pt-2 text-xs uppercase tracking-[0.14em] text-[var(--brd-green)]">
                {t("licznik", { count: beats.length })}
              </p>
            </div>
            <p className="max-w-md pb-1 font-[family-name:var(--font-display)] text-lg italic leading-snug text-[var(--brd-ink-soft)]">
              {t("lead", { genre: genre.label })}
            </p>
          </header>

          <BeatsCatalogClient beats={beats} favoriteIds={favoriteIds} signedIn={session != null} />

          {others.length > 0 ? (
            <nav
              aria-label={t("inneGatunki")}
              className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--brd-line)] pt-4 text-sm text-[var(--brd-mute)]"
              data-testid="beats-genre-others"
            >
              <span>{t("inneGatunki")}:</span>
              {others.map((g) => (
                <Link
                  key={g.slug}
                  href={genrePagePath(g.slug)}
                  className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-[var(--brd-ink)]"
                >
                  {g.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </PageFrame>
      </main>
    </AppShell>
  );
}
