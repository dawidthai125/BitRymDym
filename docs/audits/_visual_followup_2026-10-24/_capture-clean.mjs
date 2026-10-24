import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve("docs/audits/_visual_followup_2026-10-24");
fs.mkdirSync(outDir, { recursive: true });

async function prepare(page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-dialog],
      [data-nextjs-dev-overlay],
      [data-next-mark],
      [data-react-devtools-portal],
      iframe[src*="react-devtools"],
      .nextjs-toast-errors-parent,
      button[aria-label="Open Next.js Dev Tools"],
      [aria-label="Open Next.js Dev Tools"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `,
  });
  await page.evaluate(() => {
    document.querySelectorAll("audio,video").forEach((el) => {
      el.muted = true;
      el.pause();
      el.volume = 0;
    });
  });
}

async function shot(page, name, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(700);
  await prepare(page);
  await page.waitForTimeout(200);
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, type: "png", fullPage: false });
  return file;
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const browser = await chromium.launch({ headless: true });

const desk = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const deskPage = await desk.newPage();
await shot(deskPage, "clean-home-desktop-1280x800.png", "http://localhost:3456/");
await shot(deskPage, "clean-beats-desktop-1280x800.png", "http://localhost:3456/beats");
await shot(
  deskPage,
  "clean-studio-auth-gate-desktop-1280x800.png",
  "http://localhost:3456/studio",
);
await desk.close();

const mob = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const mobPage = await mob.newPage();
await shot(mobPage, "clean-home-mobile-390x844.png", "http://localhost:3456/");
await shot(mobPage, "clean-beats-mobile-390x844.png", "http://localhost:3456/beats");
await shot(
  mobPage,
  "clean-studio-auth-gate-mobile-390x844.png",
  "http://localhost:3456/studio",
);
await mob.close();

await browser.close();

let allOk = true;
for (const f of fs
  .readdirSync(outDir)
  .filter((x) => x.startsWith("clean-") && x.endsWith(".png"))) {
  const { w, h } = pngSize(path.join(outDir, f));
  const ok =
    (f.includes("desktop") && w === 1280 && h === 800) ||
    (f.includes("mobile") && w === 390 && h === 844);
  if (!ok) allOk = false;
  console.log(`${f}\t${w}x${h}\t${ok ? "OK" : "SIZE_MISMATCH"}`);
}
process.exit(allOk ? 0 : 2);
