/**
 * Test-only: source-contract tests grep component source for Polish copy.
 * After the i18n migration that copy lives in messages/pl.json and the source
 * calls t("key"). This resolves those calls back to the default (pl) text so
 * contract tests keep asserting the user-visible copy wired by key.
 */
import pl from "../../messages/pl.json";

type Tree = { [k: string]: string | Tree };

function lookup(key: string): string | undefined {
  let o: string | Tree | undefined = pl as Tree;
  for (const p of key.split(".")) {
    if (!o || typeof o !== "object") return undefined;
    o = o[p];
  }
  return typeof o === "string" ? o : undefined;
}

function icuToText(s: string): string {
  return s.replace(/'([{}<>])'/g, "$1").replace(/''/g, "'");
}

/** Strip `tl(expr)` display-boundary wrappers (lib-text translation) → `expr`. */
function unwrapLibText(src: string): string {
  let out = "";
  let i = 0;
  const re = /\btl\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index < i) continue;
    let depth = 1;
    let j = m.index + 3;
    for (; j < src.length && depth > 0; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") depth--;
    }
    if (depth !== 0) break;
    out += src.slice(i, m.index) + unwrapLibText(src.slice(m.index + 3, j - 1));
    i = j;
    re.lastIndex = j;
  }
  return out + src.slice(i);
}

export function resolveI18nSource(input: string): string {
  const src = unwrapLibText(input);
  const ns: Record<string, string[]> = {};
  for (const m of src.matchAll(
    /const (\w+) = (?:await getTranslations|useTranslations)\(\s*"([^"]+)"\s*\)/g,
  )) {
    (ns[m[1]] ??= []).push(m[2]);
  }
  let out = src;
  for (const [v, list] of Object.entries(ns)) {
    const call = new RegExp(
      `(=)?(\\{)?\\b${v}(?:\\.rich)?\\(\\s*"([^"]+)"(?:\\s*,\\s*\\{[^{}]*\\})?\\s*\\)(\\})?`,
      "g",
    );
    out = out.replace(call, (whole, eq, open, key, close) => {
      const raw = list.map((n) => lookup(`${n}.${key}`)).find((x) => x !== undefined);
      if (raw === undefined) return whole;
      const text = icuToText(raw);
      if (eq && open && close) return `="${text}"`;
      if (open && close) return text;
      return `${eq ?? ""}${open ?? ""}${JSON.stringify(text)}${close ?? ""}`;
    });
  }
  return out;
}

export function shouldResolveSourcePath(p: unknown): boolean {
  const s = String(p);
  return /[\\/]src[\\/].+\.tsx?$/.test(s) && !/\.test\.tsx?$/.test(s) && !/[\\/]src[\\/]test[\\/]/.test(s);
}
