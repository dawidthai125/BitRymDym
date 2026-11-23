import "server-only";

import { isTautological, rhymeKeys } from "@/lib/rymy/rhyme";
import WORDS from "@/lib/rymy/words.json";

/**
 * Rhyme dictionary over the 49k most common Polish words (frequency order).
 * Word list: FrequencyWords by Hermit Dave (OpenSubtitles), CC BY-SA 4.0, filtered with SJP.PL (CC BY 4.0).
 */
export const RYMY_BASE = "/rymy";
const PAGE_LIMIT = 3000;
const MIN_EXACT_FOR_PAGE = 6;

/** Rap vocabulary: always gets a page when it has a few rhymes (subtitles rank it low). */
const RAP_WORDS = [
  "rap", "bit", "hajs", "kasa", "ziomek", "ziomal", "ulica", "blok", "osiedle", "dzielnica", "miasto", "życie", "miłość",
  "serce", "noc", "dzień", "sen", "marzenia", "marzenie", "wolność", "prawda", "kłamstwo", "pieniądze", "rym", "wers",
  "zwrotka", "refren", "mikrofon", "scena", "koncert", "sława", "sukces", "porażka", "ból", "łzy", "strach", "gniew",
  "siła", "walka", "wojna", "pokój", "droga", "cel", "czas", "świat", "ludzie", "rodzina", "matka", "ojciec", "brat",
  "siostra", "przyjaciel", "wróg", "zdrada", "honor", "szacunek", "wiara", "bóg", "niebo", "piekło", "deszcz", "słońce",
  "ogień", "woda", "beton", "ławka", "klatka", "podwórko", "szkoła", "praca", "policja", "więzienie", "wódka", "piwo",
  "impreza", "dziewczyna", "chłopak", "ekipa", "muzyka", "studio", "płyta", "numer", "głos", "tekst", "słowa", "flow",
  "mama", "tata", "dom", "ziemia", "gwiazdy", "księżyc", "chmury", "wiatr", "zima", "lato", "jesień", "wiosna", "głowa",
  "ręce", "oczy", "krew", "pot", "łza", "uśmiech", "szczęście", "smutek", "samotność", "nadzieja", "przeszłość",
  "przyszłość", "teraz", "jutro", "wczoraj", "zawsze", "nigdy", "razem", "sam", "brudny", "czysty", "biały", "czarny",
];
const MIN_EXACT_FOR_RAP_WORD = 3;

type Index = {
  words: readonly string[];
  rank: Map<string, number>;
  byKey: Map<string, number[]>;
  byNear: Map<string, number[]>;
  byKey3: Map<string, number[]>;
  pageWords: string[];
  pageSet: Set<string>;
};

let cached: Index | null = null;

function push(map: Map<string, number[]>, key: string | null, i: number) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(i);
  else map.set(key, [i]);
}

function index(): Index {
  if (cached) return cached;
  const words = WORDS as string[];
  const rank = new Map<string, number>();
  const byKey = new Map<string, number[]>();
  const byNear = new Map<string, number[]>();
  const byKey3 = new Map<string, number[]>();
  words.forEach((w, i) => {
    rank.set(w, i);
    const k = rhymeKeys(w);
    if (!k) return;
    push(byKey, k.key, i);
    push(byNear, k.near, i);
    push(byKey3, k.key3, i);
  });
  const exactCount = (w: string) => {
    const k = rhymeKeys(w);
    if (!k || k.key.length < 2) return 0;
    return (byKey.get(k.key) ?? []).filter((j) => words[j] !== w && !isTautological(w, words[j])).length;
  };
  const pageSet = new Set<string>();
  for (const w of RAP_WORDS) if (rank.has(w) && exactCount(w) >= MIN_EXACT_FOR_RAP_WORD) pageSet.add(w);
  for (let i = 0; i < words.length && pageSet.size < PAGE_LIMIT; i++) {
    const w = words[i];
    if (w.length >= 3 && exactCount(w) >= MIN_EXACT_FOR_PAGE) pageSet.add(w);
  }
  const pageWords = [...pageSet];
  cached = { words, rank, byKey, byNear, byKey3, pageWords, pageSet };
  return cached;
}

export type RhymeResult = {
  word: string;
  syllables: number;
  exact: string[];
  multi: string[];
  near: string[];
  total: number;
};

function pick(list: number[] | undefined, word: string, words: readonly string[], skip: Set<string>, max: number): string[] {
  const out: string[] = [];
  for (const j of list ?? []) {
    const w = words[j];
    if (w === word || skip.has(w) || isTautological(word, w)) continue;
    out.push(w);
    skip.add(w);
    if (out.length >= max) break;
  }
  return out;
}

/** Rhymes for any lowercase Polish word (also outside the list). Most common first. */
export function findRhymes(input: string): RhymeResult | null {
  const word = input.trim().toLowerCase();
  if (!/^[a-ząćęłńóśźż]{2,24}$/.test(word)) return null;
  const k = rhymeKeys(word);
  if (!k) return null;
  const { words, byKey, byNear, byKey3 } = index();
  const skip = new Set<string>();
  const multi = k.key3 ? pick(byKey3.get(k.key3), word, words, skip, 60) : [];
  const exact = pick(byKey.get(k.key), word, words, skip, 150);
  const near = k.near ? pick(byNear.get(k.near), word, words, skip, 80) : [];
  return { word, syllables: k.syllables, exact, multi, near, total: multi.length + exact.length + near.length };
}

/** Words that get their own indexable page (/rymy/<słowo>). */
export function rhymePageWords(): readonly string[] {
  return index().pageWords;
}

export function hasRhymePage(word: string): boolean {
  return index().pageSet.has(word);
}

export function rhymePagePath(word: string): string {
  return `${RYMY_BASE}/${encodeURIComponent(word)}`;
}

/** Polish plural: 1 rym, 2–4 rymy (not 12–14), else rymów. */
export function rhymeCountLabel(n: number): string {
  if (n === 1) return "1 rym";
  const last = n % 10;
  const lastTwo = n % 100;
  return `${n} ${last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "rymy" : "rymów"}`;
}
