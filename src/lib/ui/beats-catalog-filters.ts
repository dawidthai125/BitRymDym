import type { PresentedBeat } from "@/lib/ui/demo-beats";

export type BeatsCatalogChipFilters = {
  genres: readonly string[];
  keys: readonly string[];
  bpmFilterActive: boolean;
  bpmMin: number;
  bpmMax: number;
};

/**
 * Chip / BPM filter for public catalog (before text search + sort).
 * - genres / keys: exact includes; multiple values = OR within dimension
 * - dimensions AND together when active
 * - BPM inclusive range only when bpmFilterActive
 * Never mutates `beats`.
 */
export function filterPresentedBeatsCatalogByChips(
  beats: readonly PresentedBeat[],
  filters: BeatsCatalogChipFilters,
): PresentedBeat[] {
  const { genres, keys, bpmFilterActive, bpmMin, bpmMax } = filters;
  return beats.filter((b) => {
    if (genres.length && (!b.genre || !genres.includes(b.genre))) return false;
    if (keys.length && (!b.key || !keys.includes(b.key))) return false;
    if (bpmFilterActive && (b.bpm < bpmMin || b.bpm > bpmMax)) return false;
    return true;
  });
}

/** Active chip/BPM count shown on mobile Filtry button. */
export function countActiveCatalogChipFilters(
  filters: Pick<
    BeatsCatalogChipFilters,
    "genres" | "keys" | "bpmFilterActive"
  >,
): number {
  return (
    filters.genres.length +
    filters.keys.length +
    (filters.bpmFilterActive ? 1 : 0)
  );
}

/** BPM slider bounds from catalog (same fallback as BeatsCatalogClient). */
export function catalogBpmBoundsFromBeats(
  beats: readonly PresentedBeat[],
): { min: number; max: number } {
  const bpms = beats.map((b) => b.bpm).filter((n) => Number.isFinite(n));
  if (bpms.length === 0) return { min: 70, max: 160 };
  return { min: Math.min(...bpms), max: Math.max(...bpms) };
}
