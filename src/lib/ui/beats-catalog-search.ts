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

/**
 * Text filter for public catalog SortSelect path (title / producer / genre / key).
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
  return beats.filter((b) => {
    return (
      foldCatalogSearchText(b.title).includes(q) ||
      foldCatalogSearchText(b.producer).includes(q) ||
      (b.genre != null && foldCatalogSearchText(b.genre).includes(q)) ||
      (b.key != null && foldCatalogSearchText(b.key).includes(q))
    );
  });
}
