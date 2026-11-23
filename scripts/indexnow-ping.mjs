#!/usr/bin/env node
/**
 * IndexNow: tell Bing, Yandex, Seznam, Naver (and others sharing IndexNow) about the
 * site's URLs. Reads the live sitemap and posts every <loc> to api.indexnow.org.
 * Key = the public/<key>.txt file (public by design, not a secret).
 * The ~3000 rhyme pages are left out: announcing them all sends every crawler at once (2026-11-23).
 * Usage: node scripts/indexnow-ping.mjs [https://www.bitrymdym.pl] [--all]
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const base = (process.argv.slice(2).find((a) => a.startsWith("http")) ?? "https://www.bitrymdym.pl").replace(/\/$/, "");
const keyFile = readdirSync(path.join(process.cwd(), "public")).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error("No IndexNow key file in public/");
const key = readFileSync(path.join(process.cwd(), "public", keyFile), "utf8").trim();

const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => process.argv.includes("--all") || !u.startsWith(`${base}/rymy/`));
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(base).host, key, keyLocation: `${base}/${keyFile}`, urlList }),
});
console.log(`IndexNow: ${urlList.length} URL → HTTP ${res.status}`);
if (!res.ok && res.status !== 202) process.exit(1);
