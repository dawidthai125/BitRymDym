import type { PresentedBeat } from "@/lib/ui/demo-beats";

/**
 * Symmetric fold for catalog text match: lowercase + strip Latin combining marks.
 * Polish `ł`/`Ł` are mapped explicitly — NFD does not decompose them.
 * Display / stored beat fields are never mutated by callers of this helper.
 */
export function foldCatalogSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\u0141/g, "L")
    .replace(/\u0142/g, "l")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** "90", "90 bpm" or "bpm 90" asks for a tempo; with the word BPM nothing else is searched. */
export function parseTempoQuery(folded: string): { bpm: number; only: boolean } | null {
  const m = /^(bpm\s*)?(\d{2,3})(\s*bpm)?$/.exec(folded);
  return m ? { bpm: Number(m[2]), only: Boolean(m[1] || m[3]) } : null;
}

/**
 * What a search looks through: the shown catalogue, and with a typed query also the users' beats.
 */
export function catalogSearchPool(
  beats: readonly PresentedBeat[],
  communityBeats: readonly PresentedBeat[],
  query: string,
): readonly PresentedBeat[] {
  return query.trim() && communityBeats.length ? [...beats, ...communityBeats] : beats;
}

/**
 * Text filter for public catalog SortSelect path (title / producer / genre / key / tempo).
 * - trim + diacritic-insensitive substring match (Polish ą ć ę ł ń ó ś ź ż)
 * - empty / whitespace query → preserve input order (copy)
 * Never mutates `beats`.
 */
export function filterPresentedBeatsCatalogByQuery(
  beats: readonly PresentedBeat[],
  query: string,
): PresentedBeat[] {
  const q = foldCatalogSearchText(query.trim());
  if (!q) return [...beats];
  const tempo = parseTempoQuery(q);
  return beats.filter((b) => {
    if (tempo && Math.round(b.bpm) === tempo.bpm) return true;
    if (tempo?.only) return false;
    return (
      foldCatalogSearchText(b.title).includes(q) ||
      foldCatalogSearchText(b.producer).includes(q) ||
      (b.genre != null && foldCatalogSearchText(b.genre).includes(q)) ||
      (b.key != null && foldCatalogSearchText(b.key).includes(q))
    );
  });
}
