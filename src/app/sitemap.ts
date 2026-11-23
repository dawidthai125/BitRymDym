import type { MetadataRoute } from "next";

import { catalogLaneOf } from "@/lib/beats/catalog-lane";
import { listPublishedBeats } from "@/lib/beats/service";
import { listPublicWorkSitemapEntries } from "@/lib/catalog/catalog-service";
import { collectGenres, genrePagePath } from "@/lib/seo/genre-pages";
import { GUIDE_BASE, GUIDES, guidePath } from "@/lib/seo/guides";
import { LANDING_PAGES, landingPath } from "@/lib/seo/landing-pages";
import { isLocalizedPath, localizedPath } from "@/lib/seo/locale-paths";
import { EN_LANDING_PAGES, englishLandingPath, englishTwinOf } from "@/lib/seo/landing-pages-en";
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
  const guideEntries: MetadataRoute.Sitemap = [
    { url: `${base}${GUIDE_BASE}`, changeFrequency: "weekly", priority: 0.7 },
    ...GUIDES.map((g) => ({
      url: `${base}${guidePath(g.slug)}`,
      lastModified: date(g.datePublished),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

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

  // English keyword landings + hreflang with their Polish twins.
  const enLandingEntries: MetadataRoute.Sitemap = EN_LANDING_PAGES.map((page) => {
    const pl = `${base}${landingPath(page.plSlug)}`;
    const en = `${base}${englishLandingPath(page.slug)}`;
    return { url: en, changeFrequency: "weekly", priority: 0.7, alternates: { languages: { pl, en, "x-default": pl } } };
  });
  for (const entry of landingEntries) {
    const slug = entry.url.slice(base.length + 1);
    const twin = englishTwinOf(slug);
    if (twin) entry.alternates = { languages: { pl: entry.url, en: `${base}${englishLandingPath(twin.slug)}`, "x-default": entry.url } };
  }

  const all = [...staticEntries, ...enLandingEntries, ...landingEntries, ...guideEntries, ...genreEntries, ...beatEntries, ...workEntries];
  return withEnglish(all, base);
}

/** Localized pages: hreflang alternates on the Polish entry + an /en twin with the same alternates. */
function withEnglish(entries: MetadataRoute.Sitemap, base: string): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  for (const entry of entries) {
    const path = entry.url.slice(base.length) || "/";
    if (!isLocalizedPath(path)) {
      out.push(entry);
      continue;
    }
    const pl = `${base}${path === "/" ? "" : path}`;
    const en = `${base}${localizedPath("en", path)}`;
    const alternates = { languages: { pl, en, "x-default": pl } };
    out.push({ ...entry, alternates }, { ...entry, url: en, priority: Math.max(0.1, (entry.priority ?? 0.5) - 0.1), alternates });
  }
  return out;
}
