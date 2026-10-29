import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";

import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import { DEFAULT_LOCALE, LOCALES, resolveLocale } from "@/i18n/config";

type Tree = { [k: string]: string | Tree };

function flatten(o: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === "string"
        ? [[prefix + k, v]]
        : Object.entries(flatten(v, `${prefix}${k}.`)),
    ),
  );
}

const flatPl = flatten(pl as Tree);
const flatEn = flatten(en as Tree);

describe("i18n messages", () => {
  it("default locale is Polish and unknown values fall back to it", () => {
    expect(DEFAULT_LOCALE).toBe("pl");
    expect(LOCALES).toEqual(["pl", "en"]);
    expect(resolveLocale(undefined)).toBe("pl");
    expect(resolveLocale("de")).toBe("pl");
    expect(resolveLocale("en")).toBe("en");
  });

  it("pl and en have identical key sets", () => {
    const pk = Object.keys(flatPl).sort();
    const ek = Object.keys(flatEn).sort();
    expect(pk.filter((k) => !(k in flatEn))).toEqual([]);
    expect(ek.filter((k) => !(k in flatPl))).toEqual([]);
    expect(pk.length).toBeGreaterThan(1000);
  });

  it("no empty values; every message parses as ICU with the same arguments", () => {
    const argNames = (msg: string, locale: string) => {
      const ast = new IntlMessageFormat(msg, locale).getAst();
      const names = new Set<string>();
      const walk = (nodes: unknown[]) => {
        for (const n of nodes as Array<Record<string, unknown>>) {
          if (typeof n.value === "string" && n.type !== 0) names.add(n.value);
          if (n.options) {
            for (const o of Object.values(n.options as Record<string, { value: unknown[] }>)) walk(o.value);
          }
        }
      };
      walk(ast as unknown[]);
      return [...names].sort();
    };
    for (const [k, v] of Object.entries(flatPl)) {
      expect(v.trim(), k).not.toBe("");
      expect(flatEn[k].trim(), k).not.toBe("");
      expect(argNames(flatEn[k], "en"), k).toEqual(argNames(v, "pl"));
    }
  });

  it("every literal t(\"key\") used in src exists in messages", () => {
    const out = execFileSync("node", ["scripts/check-i18n-keys.mjs"], {
      encoding: "utf8",
    });
    expect(out).toContain("all keys present");
  });
});
