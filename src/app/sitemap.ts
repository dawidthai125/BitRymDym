import type { MetadataRoute } from "next";

import { catalogLaneOf } from "@/lib/beats/catalog-lane";
import { listPublishedBeats } from "@/lib/beats/service";
import { listPublicWorkSitemapEntries } from "@/lib/catalog/catalog-service";
import { collectGenres, genrePagePath } from "@/lib/seo/genre-pages";
import { LANDING_PAGES, landingPath } from "@/lib/seo/landing-pages";
import { getPublicSiteUrl } from "@/lib/site-url";

/** Public, indexable pages only (no auth-gated or API routes). */
const PUBLIC_PATHS = [
  "/",
  "/beats",
  "/sampel",
  "/utwory",
  "/ranking",
  "/ranking/sampel",
  "/ranking/utwor",
  "/about",
  "/jak-nagrac",
  "/nagrywarka",
  "/mastering",
  "/premium",
];

function date(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicSiteUrl();
  const staticEntries: MetadataRoute.Sitemap = PUBLIC_PATHS.map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    changeFrequency: path === "/beats" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));

  // Keyword landing pages (src/lib/seo/landing-pages.ts): evergreen copy, high priority.
  const landingEntries: MetadataRoute.Sitemap = LANDING_PAGES.map((page) => ({
    url: `${base}${landingPath(page.slug)}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Same visibility as /beats and /utwory (PUBLISHED + public; live works). A DB hiccup
  // must not take the static part of the sitemap down.
  const [beats, works] = await Promise.all([
    listPublishedBeats({ catalogLane: "all" }).catch(() => []),
    listPublicWorkSitemapEntries().catch(() => []),
  ]);

  const beatEntries: MetadataRoute.Sitemap = beats.map((beat) => ({
    url: `${base}/beat/${beat.id}`,
    lastModified: date(beat.updatedAt),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // Genre pages list the free catalogue only.
  const genreEntries: MetadataRoute.Sitemap = collectGenres(
    beats.filter((beat) => catalogLaneOf(beat.catalogLane) === "free"),
  ).map((genre) => ({
    url: `${base}${genrePagePath(genre.slug)}`,
    lastModified: date(genre.lastModified),
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const workEntries: MetadataRoute.Sitemap = works.map((work) => ({
    url: `${base}/utwor/${work.id}`,
    lastModified: date(work.publishedAt),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticEntries, ...landingEntries, ...genreEntries, ...beatEntries, ...workEntries];
}
