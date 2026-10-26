import type { PresentedBeat } from "@/lib/ui/demo-beats";

/**
 * Text filter for public catalog SortSelect path (title / producer / genre / key).
 * - trim + toLowerCase substring match (no diacritic folding)
 * - empty / whitespace query → preserve input order (copy)
 * Never mutates `beats`.
 */
export function filterPresentedBeatsCatalogByQuery(
  beats: readonly PresentedBeat[],
  query: string,
): PresentedBeat[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...beats];
  return beats.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.producer.toLowerCase().includes(q) ||
      (b.genre?.toLowerCase().includes(q) ?? false) ||
      (b.key?.toLowerCase().includes(q) ?? false),
  );
}
