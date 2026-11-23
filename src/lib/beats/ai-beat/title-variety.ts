/**
 * Distinct names for generated beats (pure, client-safe).
 * 2026-11-23: generated titles clustered ("Mroczny Puls w Moll", "Mroczny Pocket w Moll",
 * "Ciemny Motyw Ulicy" …). Candidates are rejected when they share their first word or two
 * content words with an existing title, or lean on an overused word.
 */
const STOP = new Set(["w", "we", "na", "i", "z", "ze", "do", "o", "od", "po", "pod", "nad", "za", "u", "a", "the", "of", "bit", "remix", "wersja"]);

/** Words that made the catalogue sound the same — never allowed in new titles. */
export const OVERUSED_TITLE_WORDS = [
  "mroczny", "mroczna", "mroczne", "mrocznej", "mrok", "ciemny", "ciemna", "ciemne", "moll", "ulica", "ulicy", "ulic",
  "puls", "cień", "cienie", "nocny", "nocna", "nocne", "noc", "motyw", "beton", "betonowy", "twardy", "pocket",
] as const;

const OVERUSED = new Set<string>(OVERUSED_TITLE_WORDS);

/** Lowercase content words; drops numbers, stop words and parenthesised suffixes like "(remix)". */
export function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-ząćęłńóśźż\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** Rough stem so "ulica/ulicy", "nocny/nocna" count as the same word. */
function stem(word: string): string {
  return word.length > 4 ? word.slice(0, word.length - 2) : word;
}

export function titleRejectReason(candidate: string, existing: readonly string[]): string | null {
  const words = titleWords(candidate);
  if (words.length === 0) return "empty";
  if (words.length > 5) return "too long";
  if (words.some((w) => OVERUSED.has(w))) return "overused word";
  const stems = words.map(stem);
  for (const other of existing) {
    const ow = titleWords(other);
    if (ow.length === 0) continue;
    if (ow.join(" ") === words.join(" ")) return `duplicate of ${other}`;
    if (stem(ow[0]!) === stems[0]) return `same first word as ${other}`;
    const shared = new Set(ow.map(stem).filter((s) => stems.includes(s)));
    if (shared.size >= 2) return `too close to ${other}`;
  }
  return null;
}

/** First candidate that is distinct from the catalogue (and from earlier candidates). */
export function pickDistinctTitle(candidates: readonly string[], existing: readonly string[]): string | null {
  for (const c of candidates) {
    const t = c.replace(/["“”„]/g, "").replace(/\s+/g, " ").trim();
    if (t && titleRejectReason(t, existing) === null) return t;
  }
  return null;
}

export function parseTitleCandidates(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as { titles?: unknown };
    return Array.isArray(parsed.titles) ? parsed.titles.filter((t): t is string => typeof t === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function titlePrompt(existing: readonly string[]): string {
  return [
    "You name instrumental hip-hop beats for a Polish beat catalogue.",
    'Reply with JSON only: {"titles":["...","...","...","...","...","..."]} — six different Polish titles, 1 to 4 words each.',
    "Make every title vivid and specific: a place, an object, a moment, a slang phrase, a verb or a short image (e.g. kinds like „Ostatni tramwaj”, „Klatka B”, „Szron na szybie”, „Zgaś światło”, „Peron 4”).",
    "Vary the grammar: not always adjective + noun. No genre names, no tempo, no musical key, no English words.",
    `Never use these words or their forms: ${OVERUSED_TITLE_WORDS.join(", ")}.`,
    "Do not reuse the first word or the main idea of any existing title. No artist names, no existing song titles.",
    `Existing titles: ${existing.slice(0, 120).join("; ") || "(none)"}.`,
  ].join(" ");
}
