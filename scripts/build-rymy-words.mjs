#!/usr/bin/env node
/**
 * Builds src/lib/rymy/words.json from FrequencyWords pl_50k.txt
 * (https://github.com/hermitdave/FrequencyWords, content CC BY-SA 4.0, OpenSubtitles).
 * Filtered to real Polish words with the SJP.PL inflection list (odm.txt, https://sjp.pl/sl/odmiany/,
 * GPL 2 / LGPL 2.1 / Apache 2.0 / CC BY 4.0): drops names, English and words typed without diacritics.
 * Usage: node scripts/build-rymy-words.mjs /path/to/pl_50k.txt /path/to/odm.txt
 * Keeps lowercase Polish words (3–16 letters), drops a blocklist of slurs/vulgarities,
 * keeps frequency order (most common first).
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
const odm = process.argv[3];
if (!src || !odm) throw new Error("usage: build-rymy-words.mjs pl_50k.txt odm.txt");
const polish = new Set();
for (const line of readFileSync(odm, "utf8").split("\n")) {
  for (const form of line.split(",")) {
    const f = form.trim();
    if (f && f === f.toLowerCase()) polish.add(f);
  }
}
const BLOCK = [
  "kurw", "chuj", "jeb", "pierdol", "pizd", "cipa", "cipk", "cipy", "kutas", "dziwk", "pedał", "pedal", "cwel",
  "ciota", "cioty", "ciotą", "szmat", "suka", "suki", "suko", "suką", "dupk", "fiut", "ciul", "zjeb", "spierd",
  "wypierd", "napierd", "rozpierd", "skurw", "kurew", "murzyn", "czarnuch", "cygan", "pojeb", "huj", "srać",
  "sram", "srasz", "gówn", "gown", "lesb", "zajeb", "odjeb", "wyjeb", "dojeb", "przyjeb", "najeb", "wjeb",
];
const ok = /^[a-ząćęłńóśźż]{3,16}$/;
const seen = new Set();
const out = [];
for (const line of readFileSync(src, "utf8").split("\n")) {
  const w = line.split(" ")[0]?.trim();
  if (!w || !ok.test(w) || seen.has(w) || !polish.has(w)) continue;
  if (BLOCK.some((b) => w.startsWith(b) || (b.length > 4 && w.includes(b)))) continue;
  // Subtitles noise: words without vowels or with 3+ repeated letters.
  if (!/[aąeęioóuy]/.test(w) || /(.)\1\1/.test(w)) continue;
  seen.add(w);
  out.push(w);
}
writeFileSync(new URL("../src/lib/rymy/words.json", import.meta.url), JSON.stringify(out));
console.log(`words: ${out.length}`);
