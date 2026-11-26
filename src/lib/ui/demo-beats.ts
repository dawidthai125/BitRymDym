/**
 * Public catalog presentation adapter.
 *
 * Passes through canonical DB / public-author fields only.
 * Does NOT invent titles, producers, BPM, genre, key, mood, or duration.
 * artworkVariant is visual chrome (stable hash of id), not content metadata.
 */

export type PresentedBeat = {
  id: string;
  title: string;
  /** Canonical public author (already resolved via withPublicAuthors). */
  producer: string;
  /** Public profile of the author, when it is on. */
  authorHref?: string;
  genre: string | null;
  /** No mood column in beats — always null until a real source exists. */
  mood: string | null;
  key: string | null;
  bpm: number;
  durationSeconds: number;
  artworkVariant: number;
  /** Approved owner cover (thumb) — overrides the generated artwork. */
  coverUrl?: string | null;
  coverFullUrl?: string | null;
  /** A user's beat shown among search results of the BitRymDym catalogue. */
  community?: boolean;
};

type PresentableInput = {
  id: string;
  title: string;
  producer?: string | null;
  authorHref?: string;
  genre?: string | null;
  style?: string | null;
  bpm: number;
  key?: string | null;
  scale?: string | null;
  durationSeconds: number;
  coverUrl?: string | null;
  coverFullUrl?: string | null;
};

/** Stable cover-art variant index from beat id (visual only). */
export function artworkVariantForId(beatId: string): number {
  let h = 2166136261;
  for (let i = 0; i < beatId.length; i += 1) {
    h ^= beatId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 12;
}

/**
 * 2026-11-22: catalog showed only the root ("A"), so minor and major looked the same.
 * Short musical label like the key detector ("Am" = a-moll, "C" = C-dur).
 */
export function presentKey(key: string | null | undefined, scale: string | null | undefined): string | null {
  const root = key?.trim();
  if (!root) return null;
  const s = scale?.trim().toLowerCase();
  const minor = s === "minor" || s === "moll" || s === "m";
  return minor && !root.endsWith("m") ? `${root}m` : root;
}

function toPresented(raw: PresentableInput): PresentedBeat {
  const title = raw.title?.trim() ?? "";
  const producer = raw.producer?.trim() || "—";
  return {
    id: raw.id,
    title,
    producer,
    ...(raw.authorHref ? { authorHref: raw.authorHref } : {}),
    genre: raw.genre?.trim() || null,
    mood: null,
    key: presentKey(raw.key, raw.scale),
    bpm: Number.isFinite(raw.bpm) ? raw.bpm : 0,
    durationSeconds: Number.isFinite(raw.durationSeconds)
      ? Math.max(0, raw.durationSeconds)
      : 0,
    artworkVariant: artworkVariantForId(raw.id),
    coverUrl: raw.coverUrl ?? null,
    coverFullUrl: raw.coverFullUrl ?? null,
  };
}

/** Present a single beat from canonical public fields — no fiction. */
export function presentBeat(raw: PresentableInput): PresentedBeat {
  return toPresented(raw);
}

/** Present catalog rows from canonical public fields — no fiction, no fixtures. */
export function presentBeats(raw: PresentableInput[]): PresentedBeat[] {
  return raw.map(toPresented);
}

/** Unique non-empty genres from a presented catalog (for filters). */
export function catalogGenresFromBeats(
  beats: readonly PresentedBeat[],
): string[] {
  return [
    ...new Set(
      beats
        .map((b) => b.genre)
        .filter((g): g is string => Boolean(g && g.trim())),
    ),
  ].sort((a, b) => a.localeCompare(b, "pl"));
}

/** Unique non-empty keys from a presented catalog (for filters). */
export function catalogKeysFromBeats(beats: readonly PresentedBeat[]): string[] {
  return [
    ...new Set(
      beats
        .map((b) => b.key)
        .filter((k): k is string => Boolean(k && k.trim())),
    ),
  ].sort((a, b) => a.localeCompare(b, "pl"));
}
