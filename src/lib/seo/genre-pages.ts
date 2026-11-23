/**
 * Genre landing pages /beats/gatunek/[slug] (pure, client-safe).
 * Genres come from the real beats.genre column; slugs reuse slugTitle
 * ("Boom Bap" → "boom-bap", Polish letters transliterated).
 */
import { slugTitle } from "@/lib/studio/master/parts";

export const GENRE_PAGE_BASE = "/beats/gatunek";

/** Slug for a genre value, or null when the genre has no letters/digits. */
export function genreSlug(genre: string | null | undefined): string | null {
  const g = genre?.trim();
  if (!g || !/[\p{L}\p{N}]/u.test(g)) return null;
  return slugTitle(g);
}

export function genrePagePath(slug: string): string {
  return `${GENRE_PAGE_BASE}/${slug}`;
}

export type GenreEntry = {
  slug: string;
  /** Most common original spelling in the catalog. */
  label: string;
  count: number;
  /** Newest updatedAt among the genre's beats (ISO), when known. */
  lastModified: string | null;
};

type GenreSource = { genre: string | null | undefined; updatedAt?: string | null };

/** Distinct genres by slug ("Trap" and "trap" collapse), most beats first. */
export function collectGenres(beats: readonly GenreSource[]): GenreEntry[] {
  const bySlug = new Map<string, { labels: Map<string, number>; count: number; last: string | null }>();
  for (const beat of beats) {
    const slug = genreSlug(beat.genre);
    if (!slug) continue;
    const label = beat.genre!.trim();
    const entry = bySlug.get(slug) ?? { labels: new Map(), count: 0, last: null };
    entry.count += 1;
    entry.labels.set(label, (entry.labels.get(label) ?? 0) + 1);
    const at = beat.updatedAt ?? null;
    if (at && (!entry.last || Date.parse(at) > Date.parse(entry.last))) entry.last = at;
    bySlug.set(slug, entry);
  }
  return [...bySlug.entries()]
    .map(([slug, e]) => ({
      slug,
      label: [...e.labels.entries()].sort((a, b) => b[1] - a[1])[0]![0],
      count: e.count,
      lastModified: e.last,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pl"));
}

/** Beats whose genre maps to the slug. */
export function beatsInGenre<T extends { genre: string | null | undefined }>(
  beats: readonly T[],
  slug: string,
): T[] {
  return beats.filter((beat) => genreSlug(beat.genre) === slug);
}

export type GenreStats = {
  /** Rounded min/max tempo, null when no beat has a positive BPM. */
  bpmMin: number | null;
  bpmMax: number | null;
  /** Most common keys, most beats first (max 3). */
  topKeys: string[];
};

/** Real tempo range and common keys of a genre's beats (unique text for the landing page). */
export function genreStats(beats: readonly { bpm?: number | null; key?: string | null }[]): GenreStats {
  const bpms = beats
    .map((b) => b.bpm)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .map((v) => Math.round(v));
  const keys = new Map<string, number>();
  for (const b of beats) {
    const k = b.key?.trim();
    if (k && k !== "—") keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  return {
    bpmMin: bpms.length ? Math.min(...bpms) : null,
    bpmMax: bpms.length ? Math.max(...bpms) : null,
    topKeys: [...keys.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([k]) => k),
  };
}
