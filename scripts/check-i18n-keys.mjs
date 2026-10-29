// Static check: every t("literal") key used with a known namespace exists in messages/pl.json.
import fs from "node:fs";
import path from "node:path";
const pl = JSON.parse(fs.readFileSync("messages/pl.json", "utf8"));
const has = (k) => k.split(".").reduce((o, p) => (o && typeof o === "object" ? o[p] : undefined), pl) !== undefined;
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p); } };
walk("src");
let bad = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  const ns = {};
  for (const m of s.matchAll(/const (\w+) = (?:await getTranslations|useTranslations)\(\s*"([^"]+)"\s*\)/g)) (ns[m[1]] ??= new Set()).add(m[2]);
  for (const [v, set] of Object.entries(ns)) {
    for (const m of s.matchAll(new RegExp(`\\b${v}(?:\\.rich)?\\(\\s*"([^"]+)"`, "g"))) {
      if (![...set].some((n) => has(`${n}.${m[1]}`))) { bad++; console.log(`${f}: ${v}("${m[1]}") [${[...set]}]`); }
    }
  }
}
console.log(bad ? `${bad} missing keys` : "all keys present");
process.exit(bad ? 1 : 0);
