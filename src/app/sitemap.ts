import type { MetadataRoute } from "next";

import { catalogLaneOf } from "@/lib/beats/catalog-lane";
import { listPublishedBeats } from "@/lib/beats/service";
import { listPublicWorks } from "@/lib/catalog/catalog-service";
import { collectGenres, genrePagePath } from "@/lib/seo/genre-pages";
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
  "/premium",
  "/sign-in",
  "/sign-up",
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

  // Same visibility as /beats and /utwory (PUBLISHED + public; live works). A DB hiccup
  // must not take the static part of the sitemap down.
  const [beats, works] = await Promise.all([
    listPublishedBeats({ catalogLane: "all" }).catch(() => []),
    listPublicWorks().catch(() => ({ enabled: false, works: [] })),
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

  const workEntries: MetadataRoute.Sitemap = works.works.map((work) => ({
    url: `${base}/utwor/${work.id}`,
    lastModified: date(work.publishedAt),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticEntries, ...genreEntries, ...beatEntries, ...workEntries];
}
