/**
 * Polish rhyme check for generated lyrics. Pure, no I/O.
 *
 * Phonetic folding is approximate (no dictionary): diacritics and the common spelling pairs
 * (ó/u, rz/ż/z, ch/h) are folded, then two words rhyme when they share the vowel nucleus of
 * the stressed (penultimate) syllable plus the ending, or a long enough common suffix.
 */

const FOLD: Record<string, string> = { ą: "a", ę: "e", ó: "u", ż: "z", ź: "z", ś: "s", ć: "c", ń: "n", ł: "l" };
const VOWELS = "aeiouy";

/** Lowercase phonetic form of one word. */
export function foldWord(word: string): string {
  let s = word.toLowerCase().replace(/[ąęóżźśćńł]/g, (c) => FOLD[c] ?? c);
  s = s.replace(/[^a-z]/g, "");
  return s.replace(/rz/g, "z").replace(/ch/g, "h").replace(/ji/g, "i");
}

/** Last word of a line, folded ("" when the line has no letters). */
export function lineEnding(line: string): string {
  const words = line.match(/[\p{L}]+/gu);
  return words && words.length ? foldWord(words[words.length - 1]) : "";
}

/**
 * From the second-to-last vowel group (stress falls on the penultimate syllable) to the end;
 * a one-syllable word starts at its only vowel group.
 */
function nucleus(word: string): string {
  const starts: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (VOWELS.includes(word[i]) && (i === 0 || !VOWELS.includes(word[i - 1]))) starts.push(i);
  }
  if (starts.length === 0) return word;
  return word.slice(starts.length >= 2 ? starts[starts.length - 2] : starts[0]);
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return n;
}

/** Do two line endings (folded words) rhyme? The same word never counts. */
export function wordsRhyme(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  if (nucleus(a) === nucleus(b) && nucleus(a).length >= 2) return true;
  const suffix = commonSuffix(a, b);
  return suffix >= 3 || (suffix >= 2 && a.length <= 3 && b.length <= 3);
}

export type RhymeSection = { label: string; lines: string[] };

/** Split lyrics text ("[Refren]" headers, one line per verse) into sections of non-empty lines. */
export function splitSections(text: string): RhymeSection[] {
  const out: RhymeSection[] = [];
  let cur: RhymeSection = { label: "", lines: [] };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const head = line.match(/^\[(.+)\]$/);
    if (head) {
      if (cur.lines.length) out.push(cur);
      cur = { label: head[1], lines: [] };
    } else if (line) cur.lines.push(line);
  }
  if (cur.lines.length) out.push(cur);
  return out;
}

export type RhymeReport = {
  /** Share of line pairs that rhyme under the best scheme per section (0..1); 1 when there is nothing to check. */
  score: number;
  /** Lines (1-based, per section) that miss their rhyme partner — for the repair prompt. */
  weak: { section: string; line: number; text: string; partner: number }[];
  checked: number;
};

/** Line pairs that should rhyme: scheme 0 = AABB, scheme 1 = ABAB. */
function pairs(scheme: 0 | 1, n: number): [number, number][] {
  const out: [number, number][] = [];
  if (scheme === 0) {
    for (let i = 0; i + 1 < n; i += 2) out.push([i, i + 1]);
  } else {
    for (let i = 0; i + 2 < n; i += 4) {
      out.push([i, i + 2]);
      if (i + 3 < n) out.push([i + 1, i + 3]);
    }
  }
  return out;
}

/** Rhyme quality of a lyrics text: the best of AABB / ABAB per section. */
export function rhymeReport(text: string): RhymeReport {
  let hits = 0;
  let total = 0;
  const weak: RhymeReport["weak"] = [];
  for (const section of splitSections(text)) {
    if (section.lines.length < 2) continue;
    const ends = section.lines.map(lineEnding);
    let best: { ok: number; list: [number, number][]; miss: [number, number][] } | null = null;
    for (const scheme of [0, 1] as const) {
      const list = pairs(scheme, ends.length);
      const miss = list.filter(([a, b]) => !wordsRhyme(ends[a], ends[b]));
      const ok = list.length - miss.length;
      if (!best || ok / Math.max(1, list.length) > best.ok / Math.max(1, best.list.length)) best = { ok, list, miss };
    }
    if (!best) continue;
    hits += best.ok;
    total += best.list.length;
    for (const [a, b] of best.miss) {
      weak.push({ section: section.label, line: b + 1, text: section.lines[b], partner: a + 1 });
    }
  }
  return { score: total === 0 ? 1 : hits / total, weak, checked: total };
}
