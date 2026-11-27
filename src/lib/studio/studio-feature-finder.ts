/**
 * "Znajdź funkcję": the list of Studio features and where each one lives.
 * Pure data and filtering; the editor decides what opening an entry does.
 */

/** The five groups of the Studio full view (bottom bar on touch, right panel on desktop). */
export const STUDIO_GROUPS = ["record", "sound", "text", "add", "more"] as const;
export type StudioGroup = (typeof STUDIO_GROUPS)[number];

/** Where the entry leads, shown next to its name. */
export type StudioFeaturePlace = StudioGroup | "mix" | "track" | "timeline" | "top";

export type StudioFeatureEntry = {
  id: string;
  place: StudioFeaturePlace;
  /** Exists only in the full view (Silver and Gold). */
  fullOnly: boolean;
  /** Plans without the full view find it in the Mix step. */
  mixWithoutFullView?: boolean;
};

const entry = (id: string, place: StudioFeaturePlace, fullOnly = false): StudioFeatureEntry => ({ id, place, fullOnly });
/** Presets, tuning and effects: next to the recording in the full view, otherwise in the Mix step. */
const sound = (id: string): StudioFeatureEntry => ({ ...entry(id, "sound"), mixWithoutFullView: true });

/** Order = order of the list when nothing is typed (most wanted first). */
export const STUDIO_FEATURES: readonly StudioFeatureEntry[] = [
  sound("autotune"),
  entry("latency", "record"),
  entry("lyrics", "text"),
  entry("importVocal", "add"),
  sound("presets"),
  entry("cleanup", "mix"),
  entry("export", "more", true),
  entry("samples", "add"),
  sound("effects"),
  entry("markers", "text", true),
  entry("addTrack", "add", true),
  entry("stems", "add", true),
  entry("mic", "record"),
  entry("countdown", "record", true),
  entry("recMode", "record", true),
  entry("takes", "record"),
  entry("scratch", "add", true),
  entry("mixer", "more", true),
  entry("volumeAutomation", "track", true),
  entry("trackSettings", "more", true),
  entry("clipTools", "timeline"),
  entry("beatLock", "track"),
  entry("changeBeat", "top"),
  entry("metronome", "top"),
  entry("history", "more", true),
  entry("snap", "more", true),
  entry("files", "more", true),
  entry("makeSong", "mix"),
];

/** Lower case without Polish accents: "ścieżka" matches "sciezka". */
export function normalizeFeatureText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Entries matching every typed word. Name matches come before matches found only in the keywords;
 * otherwise the list order stays.
 */
export function findStudioFeatures(
  query: string,
  textOf: (id: string) => { label: string; keywords: string },
  entries: readonly StudioFeatureEntry[] = STUDIO_FEATURES,
): StudioFeatureEntry[] {
  const words = normalizeFeatureText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  const byName: StudioFeatureEntry[] = [];
  const byKeyword: StudioFeatureEntry[] = [];
  for (const item of entries) {
    const text = textOf(item.id);
    const label = normalizeFeatureText(text.label);
    const all = `${label} ${normalizeFeatureText(text.keywords)}`;
    // A word matches the start of any word, so "tune" finds "autotune" only through the keywords.
    const tokens = all.split(/[^a-z0-9]+/).filter(Boolean);
    if (!words.every((word) => tokens.some((token) => token.startsWith(word)))) continue;
    const labelTokens = label.split(/[^a-z0-9]+/).filter(Boolean);
    (words.every((word) => labelTokens.some((token) => token.startsWith(word))) ? byName : byKeyword).push(item);
  }
  return [...byName, ...byKeyword];
}
