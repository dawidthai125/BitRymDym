/**
 * Translation of user-visible text produced outside React components:
 * lib/ helpers (status labels, plan copy, Studio persist status), server
 * actions and API error messages (`json.error`), and client-side lib errors.
 *
 * Those strings stay Polish (the default locale) at the source, so the API
 * contract and PL behaviour do not change. Components pass them through
 * `tl()` (see `useLibText` / `getLibText`) right before rendering, which maps
 * the Polish source to the active locale using `messages/lib-text.json`
 * (gettext-style: source text → translation; `{0}` marks template slots).
 * Unknown text (e.g. database content) is returned unchanged.
 *
 * A few sources are internal English codes (e.g. "Daily download limit
 * reached."); for those the entry carries an explicit `pl` translation.
 */
import entries from "../../messages/lib-text.json";
import type { AppLocale } from "@/i18n/config";

type Entry = { src: string; en: string; pl?: string; tpl?: boolean };

const exact = new Map<string, Entry>();
const templates: Array<{ re: RegExp; order: number[]; entry: Entry }> = [];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const e of entries as Entry[]) {
  if (!e.tpl) {
    exact.set(e.src, e);
    continue;
  }
  const order: number[] = [];
  const re = e.src
    .split(/(\{\d+\})/)
    .map((part) => {
      const m = part.match(/^\{(\d+)\}$/);
      if (m) {
        order.push(Number(m[1]));
        return "([\\s\\S]*?)";
      }
      return escapeRe(part);
    })
    .join("");
  templates.push({ re: new RegExp(`^${re}$`), order, entry: e });
}
// Longest literal part first so specific templates win over generic ones.
templates.sort((a, b) => b.entry.src.length - a.entry.src.length);

function fill(target: string, order: number[], args: string[]): string {
  return target.replace(/\{(\d+)\}/g, (_, n) => {
    const idx = order.indexOf(Number(n));
    return idx >= 0 ? args[idx] : "";
  });
}

export function translateLibText(text: string, locale: AppLocale, depth = 0): string {
  const hit = exact.get(text);
  if (hit) return locale === "en" ? hit.en : (hit.pl ?? hit.src);
  if (depth > 2) return text;
  for (const t of templates) {
    const m = text.match(t.re);
    if (!m) continue;
    const args = m.slice(1).map((a) => translateLibText(a, locale, depth + 1));
    const target = locale === "en" ? t.entry.en : (t.entry.pl ?? t.entry.src);
    return fill(target, t.order, args);
  }
  return text;
}

export type LibText = <T extends string | null | undefined>(text: T) => T;

export function makeLibText(locale: AppLocale): LibText {
  return (<T extends string | null | undefined>(text: T): T =>
    (typeof text === "string" ? translateLibText(text, locale) : text) as T) as LibText;
}
