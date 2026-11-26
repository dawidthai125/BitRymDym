import { describe, expect, it } from "vitest";

import { COOKIES } from "@/content/legal/cookies";
import { PRIVACY } from "@/content/legal/privacy";
import { TERMS } from "@/content/legal/terms";
import type { LegalBlock, LegalDoc } from "@/content/legal/types";
import { LEGAL_PATHS, PLACEHOLDER_RE } from "@/lib/legal/legal-config";

import { COOKIES_EN } from "./cookies";
import { PRIVACY_EN } from "./privacy";
import { TERMS_EN } from "./terms";

/** Shape of a document: section ids, block kinds, list lengths, table sizes. */
function shape(doc: LegalDoc) {
  const block = (b: LegalBlock) =>
    typeof b === "string" ? "p" : "list" in b ? `list:${b.list.length}` : `table:${b.table.head.length}x${b.table.rows.length}:${b.table.rows.map((r) => r.length).join(",")}`;
  return doc.sections.map((s) => ({ id: s.id, blocks: s.blocks.map(block) }));
}

function allText(doc: LegalDoc): string {
  const parts: string[] = [doc.title, doc.lead];
  for (const s of doc.sections) {
    parts.push(s.h);
    for (const b of s.blocks) {
      if (typeof b === "string") parts.push(b);
      else if ("list" in b) parts.push(...b.list);
      else parts.push(...b.table.head, ...b.table.rows.flat());
    }
  }
  return parts.join("\n");
}

const PAIRS: [string, LegalDoc, LegalDoc][] = [
  ["terms", TERMS, TERMS_EN],
  ["privacy", PRIVACY, PRIVACY_EN],
  ["cookies", COOKIES, COOKIES_EN],
];

describe("English translations of the legal documents", () => {
  it.each(PAIRS)("%s: same version and the same structure as the Polish text", (_name, pl, en) => {
    expect(en.version).toBe(pl.version);
    expect(shape(en)).toEqual(shape(pl));
  });

  it.each(PAIRS)("%s: same numbers, e-mail addresses and own links", (_name, pl, en) => {
    const plText = allText(pl);
    const enText = allText(en);
    for (const path of Object.values(LEGAL_PATHS)) expect(enText.includes(path)).toBe(plText.includes(path));
    const emails = (t: string) => [...new Set(t.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [])].sort();
    expect(emails(enText)).toEqual(emails(plText));
    expect(enText.match(PLACEHOLDER_RE) ?? []).toEqual([]);
  });

  it.each(PAIRS)("%s: no Polish words left", (_name, _pl, en) => {
    const text = allText(en)
      .replace(/„[^”]*”/g, "") // quoted Polish UI labels are allowed
      .replace(/\([^)]*\)/g, ""); // and Polish names in brackets
    expect(text).not.toMatch(/\b(oraz|który|która|które|jest|lub|przez|się|Konto|Usługodawca|Regulamin)\b/);
  });
});
