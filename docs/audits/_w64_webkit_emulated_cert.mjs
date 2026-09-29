/**
 * E3.8 W6.4 — WebKit (Playwright) EMULATED iOS-engine smoke.
 * MODE = EMULATED — Windows WebKit ≠ physical iOS Safari.
 */
import { webkit } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.W64_BASE_URL || "http://127.0.0.1:3010";
const BEAT = process.env.W64_BEAT_ID || "38026c91-e738-47b9-9bfc-deba5bceeadb";
const OUT = path.resolve("docs/audits/_w64_evidence");
const VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "412x915", width: 412, height: 915 },
  { name: "768x1024", width: 768, height: 1024 },
];

async function cell(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 180));
  });
  await page.goto(`${BASE}/beat/${BEAT}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(600);
  const metrics = await page.evaluate(() => {
    const iw = innerWidth;
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const text = document.body.innerText || "";
    const btns = [...document.querySelectorAll("button, header a")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        t: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 28),
        w: Math.round(r.width),
        h: Math.round(r.height),
        pass: r.width >= 44 && r.height >= 44,
      };
    });
    return {
      iw,
      sw,
      overflowOk: sw <= iw + 1,
      mix: /mix|miks/i.test(text),
      loginGate: /zaloguj się, aby użyć basic mix/i.test(text),
      btns,
      failBtns: btns.filter((b) => !b.pass && b.h > 0),
    };
  });
  let playback = { play: false, pause: false, mute: false, err: null };
  try {
    const play = page.getByRole("button", { name: /Odtwórz|Play/i }).first();
    if (await play.count()) {
      await play.click({ timeout: 2000 });
      playback.play = true;
      await page.waitForTimeout(500);
      const pause = page.getByRole("button", { name: /Pauza|Pause/i }).first();
      if (await pause.count()) {
        await pause.click({ timeout: 2000 }).catch(() => {});
        playback.pause = true;
      }
      const mute = page.getByRole("button", { name: /Wycisz|Mute|Dźwięk/i }).first();
      if (await mute.count()) {
        await mute.click({ timeout: 2000 });
        playback.mute = true;
      }
    }
  } catch (e) {
    playback.err = String(e?.message || e).slice(0, 160);
  }
  const shot = `webkit_${vp.name}_beat.png`;
  await page.screenshot({ path: path.join(OUT, shot) });
  await context.close();
  return {
    mode: "EMULATED",
    engine: "Playwright-WebKit",
    formal: false,
    note: "Not physical iOS Safari",
    viewport: vp.name,
    result: metrics.overflowOk && metrics.failBtns.length === 0 ? "PASS" : "FAIL",
    metrics,
    playback,
    consoleErrors: consoleErrors.slice(0, 8),
    evidence: shot,
  };
}

const browser = await webkit.launch({ headless: true });
const cells = [];
for (const vp of VIEWPORTS) {
  const c = await cell(browser, vp);
  cells.push(c);
  console.log(`${c.viewport} ${c.result} overflow=${c.metrics.overflowOk} play=${c.playback.play} mute=${c.playback.mute}`);
}
await browser.close();
fs.writeFileSync(path.join(OUT, "w64_webkit_emulated_results.json"), JSON.stringify({ mode: "EMULATED", cells }, null, 2));
console.log("WROTE webkit results");
