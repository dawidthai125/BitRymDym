/**
 * Polish rhyme engine (pure). Stress falls on the penultimate syllable, so a
 * "feminine" rhyme matches from the penultimate vowel to the end, after a rough
 * phonetic normalisation: ó→u, rz→ż, ch→h, soft i+vowel, final devoicing, final ę→e.
 */
const VOWELS = new Set(["a", "ą", "e", "ę", "i", "o", "u", "y"]);

const SOFT: Array<[string, string]> = [
  ["dzi", "dź"],
  ["si", "ś"],
  ["ci", "ć"],
  ["zi", "ź"],
  ["ni", "ń"],
];

const DEVOICE: Array<[RegExp, string]> = [
  [/dż$/, "cz"],
  [/dź$/, "ć"],
  [/dz$/, "c"],
  [/ż$/, "sz"],
  [/ź$/, "ś"],
  [/b$/, "p"],
  [/d$/, "t"],
  [/g$/, "k"],
  [/w$/, "f"],
  [/z$/, "s"],
];

/** Rough pronunciation of a lowercase Polish word. */
export function phonetic(word: string): string {
  let w = word.toLowerCase().trim();
  w = w.replace(/ó/g, "u").replace(/rz/g, "ż").replace(/ch/g, "h");
  // Soft consonant + i + vowel: "się" → "śę"; consonant + i + vowel: "pies" → "pjes".
  for (const [from, to] of SOFT) w = w.replace(new RegExp(`${from}(?=[aąeęouy])`, "g"), to);
  w = w.replace(/(?<=[^aąeęiouy])i(?=[aąeęouy])/g, "j");
  // Soft consonant + i (syllabic): "sił" keeps i as vowel but the consonant is soft.
  for (const [from, to] of SOFT) w = w.replace(new RegExp(`${from.slice(0, -1)}i`, "g"), `${to}i`);
  w = w.replace(/ę$/, "e").replace(/ą$/, "om");
  for (const [re, to] of DEVOICE) {
    if (re.test(w)) {
      w = w.replace(re, to);
      break;
    }
  }
  return w;
}

/** Start indexes of vowel nuclei in a phonetic string. */
function nuclei(p: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.length; i++) {
    if (VOWELS.has(p[i]) && !(i > 0 && VOWELS.has(p[i - 1]) && p[i - 1] !== "i")) out.push(i);
  }
  return out;
}

export type RhymeKeys = {
  syllables: number;
  /** Exact (feminine) rhyme: from the penultimate vowel. */
  key: string;
  /** Near rhyme: from the consonant after the penultimate vowel (miłość / czułość). */
  near: string | null;
  /** Multi-syllable rhyme: from the antepenultimate vowel. */
  key3: string | null;
  assonance: string;
};

/** key: from the penultimate vowel (or the only vowel); key3: from the antepenultimate vowel. */
export function rhymeKeys(word: string): RhymeKeys | null {
  const p = phonetic(word);
  const n = nuclei(p);
  if (n.length === 0) return null;
  const start = n.length >= 2 ? n[n.length - 2] : n[0];
  const key = p.slice(start);
  const key3 = n.length >= 3 ? p.slice(n[n.length - 3]) : null;
  const vowels = n.slice(-2).map((i) => p[i]).join("");
  const assonance = `${vowels}:${p[p.length - 1]}`;
  const tail = key.slice(1);
  const near = n.length >= 2 && tail.length >= 3 && !VOWELS.has(tail[0]) ? tail : null;
  return { syllables: n.length, key, near, key3, assonance };
}

/** One word "contains" the other as an ending (robić / zrobić): a weak, tautological rhyme. */
export function isTautological(a: string, b: string): boolean {
  return a.endsWith(b) || b.endsWith(a);
}
