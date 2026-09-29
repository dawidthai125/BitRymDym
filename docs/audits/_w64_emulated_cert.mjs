/**
 * E3.8 W6.4 — EMULATED Chromium viewport certification smoke.
 * MODE = EMULATED — not formal iOS Safari / Android Chrome.
 * Does not start render jobs. Writes JSON evidence only.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.W64_BASE_URL || "http://127.0.0.1:3010";
const OUT_DIR = path.resolve("docs/audits/_w64_evidence");
const BEAT_ID = process.env.W64_BEAT_ID || "38026c91-e738-47b9-9bfc-deba5bceeadb";

const VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "412x915", width: 412, height: 915 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1280x800", width: 1280, height: 800 },
];

const PATHS = [
  { id: "home", path: "/" },
  { id: "beats", path: "/beats" },
  { id: "beat", path: `/beat/${BEAT_ID}` },
  { id: "sign-in", path: "/sign-in" },
  { id: "sign-up", path: "/sign-up" },
  { id: "auth-confirmed", path: "/auth/confirmed" },
  { id: "account", path: "/account" },
];

const CTA_SELECTORS = [
  'button[aria-label*="Play" i], button:has-text("Play"), button:has-text("Odtwórz")',
  'button[aria-label*="Pause" i], button:has-text("Pause"), button:has-text("Pauza")',
  'button[aria-label*="Mute" i], button:has-text("Mute"), button:has-text("Wycisz")',
  'a:has-text("Pobierz"), button:has-text("Pobierz"), button:has-text("Download")',
  'button:has-text("Nagraj"), a:has-text("Nagraj"), button:has-text("Record")',
  'button:has-text("Mix"), summary:has-text("Mix"), button:has-text("Miks")',
  'button:has-text("Master")',
  'button:has-text("Export"), button:has-text("Eksport")',
  'button[type="submit"], button:has-text("Zaloguj"), button:has-text("Załóż")',
  "header a",
  'input[type="range"]',
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
    const innerWidth = window.innerWidth;
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.right > innerWidth + 1) {
        const cs = getComputedStyle(el);
        offenders.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          className: typeof el.className === "string" ? el.className.slice(0, 120) : null,
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          overflowX: cs.overflowX,
        });
        if (offenders.length >= 8) break;
      }
    }
    return {
      scrollWidth,
      innerWidth,
      ok: scrollWidth <= innerWidth + 1,
      delta: scrollWidth - innerWidth,
      offenders,
    };
  });
}

async function measureTargets(page) {
  return page.evaluate((selectors) => {
    const out = [];
    const seen = new Set();
    for (const sel of selectors) {
      let nodes = [];
      try {
        nodes = Array.from(document.querySelectorAll(sel));
      } catch {
        continue;
      }
      for (const el of nodes.slice(0, 6)) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const key = `${el.tagName}:${Math.round(r.x)}:${Math.round(r.y)}:${Math.round(r.width)}x${Math.round(r.height)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          sel: sel.slice(0, 60),
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
          pass44: r.width >= 44 && r.height >= 44,
        });
      }
    }
    return out;
  }, CTA_SELECTORS);
}

async function surfaceSignals(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    return {
      hasMix: /mix|miks/i.test(text),
      hasMaster: /master/i.test(text),
      hasExport: /export|eksport|hq|wav/i.test(text),
      hasDownload: /pobierz|download/i.test(text),
      hasRecord: /nagraj|record|take/i.test(text),
      hasJobsOff: /niedostęp|unavailable|jobs|render/i.test(text),
      title: document.title,
      url: location.href,
    };
  });
}

async function tryPlayback(page) {
  const result = { attempted: false, playClicked: false, muted: false, error: null };
  try {
    const play = page
      .locator(
        'button[aria-label*="Play" i], button:has-text("Play"), button:has-text("Odtwórz"), button:has-text("Odtwarzaj")',
      )
      .first();
    if (await play.count()) {
      result.attempted = true;
      await play.click({ timeout: 2000 });
      result.playClicked = true;
      await page.waitForTimeout(400);
      const mute = page
        .locator(
          'button[aria-label*="Mute" i], button:has-text("Mute"), button:has-text("Wycisz")',
        )
        .first();
      if (await mute.count()) {
        await mute.click({ timeout: 1500 });
        result.muted = true;
      }
      const pause = page
        .locator(
          'button[aria-label*="Pause" i], button:has-text("Pause"), button:has-text("Pauza")',
        )
        .first();
      if (await pause.count()) {
        await pause.click({ timeout: 1500 });
      }
    }
  } catch (e) {
    result.error = String(e?.message || e).slice(0, 200);
  }
  return result;
}

async function runCell(browser, vp, route) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.width < 1024,
    hasTouch: vp.width < 1024,
    userAgent:
      vp.width < 1024
        ? "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        : undefined,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 200)));

  const url = `${BASE}${route.path}`;
  let navStatus = null;
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    navStatus = resp?.status() ?? null;
    await page.waitForTimeout(700);
  } catch (e) {
    await context.close();
    return {
      viewport: vp.name,
      surface: route.id,
      url,
      mode: "EMULATED",
      browser: "Chromium",
      result: "BLOCKED",
      error: String(e?.message || e).slice(0, 300),
    };
  }

  const overflow = await measureOverflow(page);
  const targets = await measureTargets(page);
  const signals = await surfaceSignals(page);
  let playback = { attempted: false };
  if (route.id === "beat") {
    playback = await tryPlayback(page);
    // Progressive disclosure: open Mix details if present
    try {
      const mixSummary = page.locator("summary").filter({ hasText: /mix|miks/i }).first();
      if (await mixSummary.count()) {
        await mixSummary.click({ timeout: 1500 });
        await page.waitForTimeout(300);
      }
    } catch {
      /* ignore */
    }
  }

  const shotName = `${vp.name}_${route.id}.png`;
  await page.screenshot({
    path: path.join(OUT_DIR, shotName),
    fullPage: false,
  });

  const failingTargets = targets.filter((t) => !t.pass44 && t.h < 44);
  const result =
    overflow.ok && failingTargets.length === 0
      ? "PASS"
      : overflow.ok
        ? "PASS_WITH_FINDINGS"
        : "FAIL";

  await context.close();
  return {
    viewport: vp.name,
    surface: route.id,
    url,
    mode: "EMULATED",
    browser: "Chromium",
    platformLabel: vp.width < 1024 ? "AndroidChromeUA_emulated" : "DesktopChrome_emulated",
    navStatus,
    result,
    overflow,
    targets,
    failingTargets,
    signals,
    playback,
    consoleErrors: consoleErrors.slice(0, 10),
    pageErrors: pageErrors.slice(0, 5),
    evidence: shotName,
  };
}

async function main() {
  ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const cells = [];
  for (const vp of VIEWPORTS) {
    for (const route of PATHS) {
      // Skip auth-confirmed heavy on every mobile vp after first desktop — still run all for cert completeness
      const cell = await runCell(browser, vp, route);
      cells.push(cell);
      process.stdout.write(
        `${cell.viewport} ${cell.surface} ${cell.result} overflow=${cell.overflow?.ok} failCTA=${cell.failingTargets?.length ?? "?"}\n`,
      );
    }
  }
  await browser.close();

  const summary = {
    mode: "EMULATED",
    base: BASE,
    beatId: BEAT_ID,
    generatedAt: new Date().toISOString(),
    formalNote:
      "Chromium viewport + Android UA emulation only. NOT formal iOS Safari or physical Android Chrome.",
    cells,
    overflowFails: cells.filter((c) => c.overflow && !c.overflow.ok),
    targetFindings: cells.filter((c) => (c.failingTargets?.length || 0) > 0),
  };
  const outPath = path.join(OUT_DIR, "w64_emulated_results.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`WROTE ${outPath}`);
  console.log(
    `OVERFLOW_FAILS=${summary.overflowFails.length} TARGET_FINDINGS=${summary.targetFindings.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
