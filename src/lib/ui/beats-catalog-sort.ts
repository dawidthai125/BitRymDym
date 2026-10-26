import type { PresentedBeat } from "@/lib/ui/demo-beats";

/** Client-side catalog sort ids (SortSelect values). */
export type BeatsCatalogSortId = "newest" | "featured" | "listened";

/**
 * Order a filtered catalog list for SortSelect.
 * - newest: preserve service/props order (no client sort)
 * - featured: title A→Z via localeCompare("pl")
 * - listened: BPM descending, then title localeCompare("pl")
 *
 * Never mutates `beats`.
 */
export function sortPresentedBeatsCatalog(
  beats: readonly PresentedBeat[],
  sort: BeatsCatalogSortId,
): PresentedBeat[] {
  if (sort === "featured") {
    return [...beats].sort((a, b) => a.title.localeCompare(b.title, "pl"));
  }
  if (sort === "listened") {
    return [...beats].sort(
      (a, b) => b.bpm - a.bpm || a.title.localeCompare(b.title, "pl"),
    );
  }
  return [...beats];
}
