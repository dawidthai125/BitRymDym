/**
 * Polish syllable counter for rap lyrics (pure, client-safe). A syllable = a vowel
 * (a ą e ę i o ó u y). "i" before another vowel only softens the consonant
 * ("nie", "się", "pierwszy") and is not a syllable of its own. "au"/"eu" at the
 * start of a word are one syllable ("auto", "euro"). An approximation, like any
 * rule-based count: "nauka" is still 3 (na-u-ka).
 */
const VOWELS = new Set([..."aąeęioóuy"]);

export function countWordSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-ząćęłńóśźż]/g, "");
  let count = 0;
  for (let i = 0; i < w.length; i++) {
    const ch = w[i]!;
    if (!VOWELS.has(ch)) continue;
    const next = w[i + 1];
    if (ch === "i" && next !== undefined && VOWELS.has(next)) continue;
    if (i === 1 && (w.startsWith("au") || w.startsWith("eu"))) continue;
    count++;
  }
  return count;
}

/** Accusative: "1 sylabę", "2 sylaby", "5 sylab". */
export function syllableCountLabel(n: number): string {
  if (n === 1) return "1 sylabę";
  return `${n} ${n >= 2 && n <= 4 ? "sylaby" : "sylab"}`;
}

export type LineCount = { text: string; syllables: number; words: number };

export function countLines(text: string): LineCount[] {
  return text.split(/\r?\n/).map((line) => {
    const words = line.split(/[\s\-—–]+/).filter((w) => /[a-ząćęłńóśźż]/i.test(w));
    return { text: line, words: words.length, syllables: words.reduce((sum, w) => sum + countWordSyllables(w), 0) };
  });
}

/** Totals over non-empty lines. */
export function summarize(lines: readonly LineCount[]): { lines: number; syllables: number; words: number; average: number } {
  const filled = lines.filter((l) => l.words > 0);
  const syllables = filled.reduce((s, l) => s + l.syllables, 0);
  const words = filled.reduce((s, l) => s + l.words, 0);
  return { lines: filled.length, syllables, words, average: filled.length ? Math.round((syllables / filled.length) * 10) / 10 : 0 };
}
