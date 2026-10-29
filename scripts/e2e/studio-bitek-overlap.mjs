/**
 * BITEK dock overlap check — every visible interactive control in the Studio must be reachable
 * (scrollable to a spot where the BITEK dock does not cover its centre).
 *
 * Module:  import { findBitekOverlaps } from "./scripts/e2e/studio-bitek-overlap.mjs";
 *          const covered = await findBitekOverlaps(page);  // [] = OK
 * CLI:     BASE_URL=https://… STORAGE_STATE=state.json PROJECT_ID=<uuid> node scripts/e2e/studio-bitek-overlap.mjs
 *          (walks Nagrywanie → MIX (analyze) → Mastering where unlocked, desktop 1280×800 + mobile;
 *          exit 1 when any control stays covered)
 */
const SELECTOR =
  'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=slider], [role=tab], [role=radio], [role=switch], [tabindex]:not([tabindex="-1"])';

export async function findBitekOverlaps(page) {
  return page.evaluate((sel) => {
    const dock = document.querySelector('[data-testid="studio-bitek-dock"]');
    if (!dock) return [];
    const out = [];
    const els = [...document.querySelectorAll(sel)].filter((el) => !dock.contains(el));
    const label = (el) =>
      (el.getAttribute("data-testid") || el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 60);
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // sr-only / skip links ("Przejdź do treści") are 1px until focused — not a real control on screen.
      if (el.matches(".sr-only, [class*='sr-only']")) return false;
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[inert],[aria-hidden=true]");
    };
    const covered = (el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true;
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && dock.contains(hit));
    };
    for (const el of els) {
      if (!visible(el)) continue;
      let ok = false;
      for (const block of ["center", "start", "end", "nearest"]) {
        el.scrollIntoView({ block, inline: "nearest", behavior: "instant" });
        if (!covered(el)) { ok = true; break; }
      }
      if (!ok) out.push(label(el));
    }
    window.scrollTo(0, 0);
    return out;
  }, SELECTOR);
}

async function main() {
  const { chromium, devices } = await import("playwright");
  const { BASE_URL, STORAGE_STATE, PROJECT_ID } = process.env;
  if (!BASE_URL || !STORAGE_STATE || !PROJECT_ID) throw new Error("BASE_URL, STORAGE_STATE, PROJECT_ID required");
  const browser = await chromium.launch();
  let failed = 0;
  for (const [name, ctxOpts] of [
    ["desktop", { viewport: { width: 1280, height: 800 } }],
    ["mobile", { ...devices["iPhone 13"] }],
  ]) {
    const ctx = await browser.newContext({ ...ctxOpts, storageState: STORAGE_STATE });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/studio/p/${PROJECT_ID}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const check = async (step) => {
      const covered = await findBitekOverlaps(page);
      console.log(`${name} ${step}: ${covered.length ? "COVERED " + JSON.stringify(covered) : "ok"}`);
      failed += covered.length;
    };
    await check("nagrywanie");
    const next = async (testId, step) => {
      const btn = page.getByTestId(testId).first();
      if (!(await btn.count()) || (await btn.isDisabled())) return console.log(`${name} ${step}: skipped (locked)`);
      await btn.click();
      await page.waitForTimeout(6000);
      if (step === "mix") {
        const analyze = page.getByTestId("studio-mix-analyze");
        if (await analyze.count()) { await analyze.click(); await page.getByTestId("studio-mix-verdict").waitFor({ timeout: 90000 }).catch(() => {}); }
      }
      await check(step);
    };
    await next("studio-go-mix", "mix");
    await next("studio-mix-go-master", "master");
    await ctx.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(2); });
