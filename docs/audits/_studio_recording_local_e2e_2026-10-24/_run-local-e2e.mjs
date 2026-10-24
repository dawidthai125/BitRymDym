/**
 * Local Studio recording E2E (loopback only):
 * - default R unarmed + conscious arm
 * - Master contrast on real transport bg
 * - mocked MediaRecorder (no real mic) → REC → stop → Zachowaj → archive
 * Theme via Motyw UI only. No Play/export/upload. Creds via CREDS_PATH.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve(
  "docs/audits/_studio_recording_local_e2e_2026-10-24",
);
fs.mkdirSync(outDir, { recursive: true });
const KEY = "bitrymdym.theme";
const FIXTURE_TITLE = "Visual Fixture — Local Only";
const creds = JSON.parse(fs.readFileSync(process.env.CREDS_PATH, "utf8"));
const base = creds.base;
if (
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(new URL(base).origin)
) {
  throw new Error("REFUSE non-loopback base");
}

const webmPath = path.resolve(
  "src/lib/beats/fixtures/chromium-mediarecorder-opus.webm",
);
const webmB64 = fs.readFileSync(webmPath).toString("base64");

function hideDevtoolsCss() {
  return `nextjs-portal,[data-nextjs-toast],[data-nextjs-dialog],[data-nextjs-dev-overlay],button[aria-label="Open Next.js Dev Tools"]{display:none!important}`;
}

async function muteAudio(page) {
  await page.evaluate(() => {
    document.querySelectorAll("audio,video").forEach((el) => {
      el.muted = true;
      el.pause();
      el.volume = 0;
    });
  });
}

async function assertTheme(page, expected) {
  const actual = await page.evaluate((key) => {
    const root = document.documentElement;
    return {
      storage: localStorage.getItem(key),
      dataTheme: root.getAttribute("data-theme"),
      hasDark: root.classList.contains("dark"),
    };
  }, KEY);
  if (
    actual.storage !== expected ||
    actual.dataTheme !== expected ||
    actual.hasDark !== (expected === "dark")
  ) {
    throw new Error(JSON.stringify({ expected, actual }));
  }
}

async function clickMotywTo(page, theme) {
  const label =
    theme === "light"
      ? 'button[aria-label="Przełącz na jasny motyw"]'
      : 'button[aria-label="Przełącz na ciemny motyw"]';
  await page.locator(label).first().click({ force: true });
  await page.waitForFunction(
    ({ key, theme: t }) => localStorage.getItem(key) === t,
    { key: KEY, theme },
    { timeout: 8000 },
  );
}

async function setThemeViaUi(page, theme) {
  const state = await page.evaluate((key) => {
    const root = document.documentElement;
    return {
      storage: localStorage.getItem(key),
      dataTheme: root.getAttribute("data-theme"),
      hasDark: root.classList.contains("dark"),
    };
  }, KEY);
  const ok =
    state.storage === theme &&
    state.dataTheme === theme &&
    state.hasDark === (theme === "dark");
  if (ok) {
    await assertTheme(page, theme);
    return;
  }
  const visual = state.hasDark ? "dark" : "light";
  if (visual === theme && state.storage !== theme) {
    const other = theme === "dark" ? "light" : "dark";
    await clickMotywTo(page, other);
    await clickMotywTo(page, theme);
  } else if (visual !== theme) {
    await clickMotywTo(page, theme);
  } else {
    const other = theme === "dark" ? "light" : "dark";
    await clickMotywTo(page, other);
    await clickMotywTo(page, theme);
  }
  await assertTheme(page, theme);
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function parseRgb(str) {
  const m = String(str).match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/,
  );
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
}

function relLum({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const L1 = relLum(fg);
  const L2 = relLum(bg);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

async function measureMasterContrast(page) {
  return page.evaluate(() => {
    function parseColor(str) {
      const s = String(str).trim();
      let m = s.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/,
      );
      if (m) {
        return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
      }
      // color(srgb r g b) — channels 0..1
      m = s.match(
        /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/i,
      );
      if (m) {
        return {
          r: Math.round(+m[1] * 255),
          g: Math.round(+m[2] * 255),
          b: Math.round(+m[3] * 255),
          a: m[4] != null ? +m[4] : 1,
        };
      }
      return null;
    }
    function rel({ r, g, b }) {
      const f = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }
    function ratio(a, b) {
      const L1 = rel(a);
      const L2 = rel(b);
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    }

    const transport = document.querySelector('[data-testid="studio-transport"]');
    const master = document.querySelector(
      '[data-testid="studio-transport-master"]',
    );
    if (!transport || !master) {
      return { ok: false, reason: "transport-or-master-missing" };
    }
    const label =
      master.querySelector("span.font-mono") ||
      master.querySelector("span") ||
      master;
    const cs = getComputedStyle(label);
    const fg = parseColor(cs.color);
    const bgCs = getComputedStyle(transport);
    const bg = parseColor(bgCs.backgroundColor);
    if (!fg || !bg || bg.a < 0.05) {
      return {
        ok: false,
        reason: "unresolved-colors",
        color: cs.color,
        background: bgCs.backgroundColor,
      };
    }
    const r = ratio(fg, bg);
    return {
      ok: true,
      color: `rgb(${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)})`,
      background: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
      fontSize: cs.fontSize,
      ratio: Math.round(r * 100) / 100,
      aaNormal: r >= 4.5,
      surface: "studio-transport",
    };
  });
}

async function rArmStates(page) {
  return page.evaluate(() => {
    const chips = [...document.querySelectorAll("button")].filter((b) => {
      const t = (b.textContent || "").trim();
      return t === "R";
    });
    return chips.map((b) => ({
      ariaPressed: b.getAttribute("aria-pressed"),
      text: (b.textContent || "").trim(),
    }));
  });
}

async function login(page) {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle", timeout: 90000 });
  await muteAudio(page);
  await page.getByLabel(/e-mail/i).fill(creds.email);
  await page.getByLabel(/hasło|password/i).fill(creds.password);
  await page.getByRole("button", { name: /zaloguj/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), {
    timeout: 60000,
  });
}

async function openExistingProject(page) {
  await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 90000 });
  await muteAudio(page);
  const openBtn = page.getByRole("button", { name: /^Otwórz$/i });
  if ((await openBtn.count()) > 0) await openBtn.first().click();
  else await page.locator('a[href*="/studio/p/"]').first().click();
  await page.waitForURL(/\/studio\/p\/[^/]+/, { timeout: 60000 });
  await muteAudio(page);
  await page.waitForTimeout(1000);
  return new URL(page.url()).pathname.split("/").pop();
}

async function ensureFixtureBeat(page) {
  const state = await page.evaluate(() =>
    /Nie masz jeszcze wybranego bitu/i.test(document.body.innerText || ""),
  );
  if (!state) return { attached: true, already: true };
  await page.getByRole("button", { name: /\+?\s*Wybierz bit/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /Wybierz bit/i });
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  await dialog.getByRole("button", { name: "Moje", exact: true }).click();
  await page.waitForTimeout(600);
  const fixture = dialog.locator("ul li button", { hasText: FIXTURE_TITLE });
  if ((await fixture.count()) === 0) {
    return { attached: false, reason: "fixture-missing-in-moje" };
  }
  await fixture.first().click();
  await dialog.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await muteAudio(page);
  return { attached: true, already: false };
}

async function placement(page) {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) return { ok: false };
    const nodes = [...header.querySelectorAll("a, button")].map((el) =>
      (el.getAttribute("aria-label") || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40),
    );
    const toggleIdx = nodes.findIndex((t) => /Ciemny|Jasny|motyw/i.test(t));
    const after = nodes.slice(toggleIdx + 1);
    const hasAccount = after.some(
      (t) => t && !/Szukaj|Bity|Studio|Biblioteka/i.test(t),
    );
    return { ok: toggleIdx >= 0 && hasAccount, toggleIdx, nodes };
  });
}

const report = {
  base,
  capturedAt: new Date().toISOString(),
  defaultR: null,
  consciousArm: null,
  masterContrast: { dark: null, light: null },
  recordingE2E: null,
  themeRoundTrip: null,
  motywPlacement: null,
  shots: [],
  ihdr: [],
  mockLimitations: [],
  defects: [],
};

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  permissions: ["microphone"],
});

// Prefer init-script mock so TakeMediaRecorder sees Fake MediaRecorder + silent stream.
await context.addInitScript(
  ({ b64 }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const silentBlob = new Blob([bytes], { type: "audio/webm;codecs=opus" });

    class FakeMediaRecorder {
      static isTypeSupported(type) {
        return String(type).startsWith("audio/webm");
      }
      state = "inactive";
      mimeType = "audio/webm;codecs=opus";
      ondataavailable = null;
      onstop = null;
      onerror = null;
      constructor(_stream, opts) {
        if (opts?.mimeType) this.mimeType = opts.mimeType;
      }
      start() {
        this.state = "recording";
      }
      requestData() {
        if (typeof this.ondataavailable === "function") {
          this.ondataavailable({ data: silentBlob });
        }
      }
      stop() {
        this.state = "inactive";
        if (typeof this.ondataavailable === "function") {
          this.ondataavailable({ data: silentBlob });
        }
        if (typeof this.onstop === "function") this.onstop();
      }
      pause() {}
      resume() {}
    }

    window.MediaRecorder = FakeMediaRecorder;
    if (!navigator.mediaDevices) {
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(navigator, "mediaDevices", {
        value: {},
        configurable: true,
      });
    }
    navigator.mediaDevices.getUserMedia = async () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      return dest.stream;
    };
  },
  { b64: webmB64 },
);

const page = await context.newPage();
await page.addStyleTag({ content: hideDevtoolsCss() }).catch(() => {});

await login(page);
const projectId = await openExistingProject(page);
report.projectIdSet = Boolean(projectId);

const beat = await ensureFixtureBeat(page);
if (!beat.attached) {
  report.recordingE2E = { status: "NOT_VERIFIED", reason: beat.reason };
}

// --- Default R ---
let arms = await rArmStates(page);
const defaultUnarmed = arms.every((a) => a.ariaPressed !== "true");
report.defaultR = {
  status: defaultUnarmed ? "PASS" : "FAIL",
  arms,
};

// --- Conscious arm (first unarmed R) ---
const rButtons = page.locator("button", { hasText: /^R$/ });
const countR = await rButtons.count();
let armedIdx = -1;
for (let i = 0; i < countR; i++) {
  const pressed = await rButtons.nth(i).getAttribute("aria-pressed");
  if (pressed !== "true") {
    await rButtons.nth(i).click({ force: true });
    armedIdx = i;
    break;
  }
}
await page.waitForTimeout(400);
arms = await rArmStates(page);
const armedCount = arms.filter((a) => a.ariaPressed === "true").length;
// Desktop+mobile track chrome may duplicate R buttons for the same track.
report.consciousArm = {
  status:
    armedIdx >= 0 &&
    armedCount >= 1 &&
    arms.some((a) => a.ariaPressed === "true")
      ? "PASS"
      : "FAIL",
  armedIdx,
  armedCount,
  note: "Duplicate R nodes from responsive layouts are OK if at least one is armed after click",
  arms,
};

// --- Theme + Master contrast + R shots ---
for (const theme of ["dark", "light"]) {
  await setThemeViaUi(page, theme);
  await muteAudio(page);
  report.masterContrast[theme] = await measureMasterContrast(page);
  const place = await placement(page);
  report.motywPlacement = {
    ...(report.motywPlacement || {}),
    [theme]: place,
  };
  const file = path.join(
    outDir,
    `${theme}-editor-default-r-desktop-1280x800.png`,
  );
  await page.screenshot({ path: file, type: "png", fullPage: false });
  const { w, h } = pngSize(file);
  report.ihdr.push({
    file: path.basename(file),
    w,
    h,
    ok: w === 1280 && h === 800,
  });
  report.shots.push({
    id: path.basename(file),
    status: place.ok && w === 1280 ? "PASS" : "FAIL",
  });
}

// Mobile shots (light + dark) after ensuring R still consciously armed once
await page.setViewportSize({ width: 390, height: 844 });
for (const theme of ["dark", "light"]) {
  await setThemeViaUi(page, theme);
  await muteAudio(page);
  const file = path.join(
    outDir,
    `${theme}-editor-default-r-mobile-390x844.png`,
  );
  await page.screenshot({ path: file, type: "png", fullPage: false });
  const { w, h } = pngSize(file);
  report.ihdr.push({
    file: path.basename(file),
    w,
    h,
    ok: w === 390 && h === 844,
  });
  report.shots.push({
    id: path.basename(file),
    status: w === 390 && h === 844 ? "PASS" : "FAIL",
  });
}
await page.setViewportSize({ width: 1280, height: 800 });

// Theme round-trip
await setThemeViaUi(page, "dark");
await setThemeViaUi(page, "light");
await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 90000 });
await assertTheme(page, "light");
await page.goto(`${base}/studio/p/${projectId}`, {
  waitUntil: "networkidle",
  timeout: 90000,
});
await muteAudio(page);
await assertTheme(page, "light");
await page.reload({ waitUntil: "networkidle" });
await muteAudio(page);
await assertTheme(page, "light");
await setThemeViaUi(page, "dark");
await page.reload({ waitUntil: "networkidle" });
await assertTheme(page, "dark");
report.themeRoundTrip = "PASS";

// --- Recording E2E (mocked) ---
report.mockLimitations.push(
  "MediaRecorder + getUserMedia replaced in page init script; fixture blob = chromium-mediarecorder-opus.webm (local file, not played).",
);
report.mockLimitations.push(
  "Chromium also launched with --use-fake-*-media-stream as belt-and-suspenders.",
);

if (beat.attached) {
  await page.goto(`${base}/studio/p/${projectId}`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await muteAudio(page);
  // Re-arm one R if needed after reload
  arms = await rArmStates(page);
  if (!arms.some((a) => a.ariaPressed === "true")) {
    const n = await rButtons.count();
    for (let i = 0; i < n; i++) {
      const pressed = await rButtons.nth(i).getAttribute("aria-pressed");
      if (pressed !== "true") {
        await rButtons.nth(i).click({ force: true });
        break;
      }
    }
  }

  // Open RECORD inspector / recording panel (not transport Play)
  const recordTab = page.getByRole("button", { name: /^RECORD$/i });
  if ((await recordTab.count()) > 0) await recordTab.first().click({ force: true });
  await page.waitForTimeout(400);
  // Transport record control opens inspector prefer-record (aria often Record)
  const transportRec = page.locator(
    '[data-testid="studio-transport"] button[aria-label*="Nagraj"], [data-testid="studio-transport"] button[aria-label*="Record"], [data-testid="studio-transport"] button[aria-label*="REC"]',
  );
  if ((await transportRec.count()) > 0) {
    await transportRec.first().click({ force: true });
    await page.waitForTimeout(500);
  }

  const panel = page.locator('[aria-label="Nagrywanie w Studio"]');
  try {
    await panel.waitFor({ state: "visible", timeout: 10000 });
  } catch {
    /* may already be embedded visible */
  }

  async function clickRecordingPrimary(nameRe) {
    const inPanel = panel.getByRole("button", { name: nameRe });
    if ((await inPanel.count()) > 0) {
      await inPanel.first().click({ force: true });
      return true;
    }
    const any = page.getByRole("button", { name: nameRe });
    if ((await any.count()) > 0) {
      await any.first().click({ force: true });
      return true;
    }
    return false;
  }

  // Prepare mic
  await clickRecordingPrimary(/Przygotuj mikrofon/i);
  await page.waitForTimeout(2000);

  // Start REC
  const started = await clickRecordingPrimary(/● Nagraj/i);
  if (!started) {
    report.recordingE2E = {
      status: "NOT_VERIFIED",
      reason: "nagraj-button-missing-after-prep",
      phaseHint: await panel.innerText().catch(() => null),
    };
  } else {
    await page.waitForTimeout(2000);
    const stopped = await clickRecordingPrimary(/■ Zatrzymaj nagrywanie/i);
    if (!stopped) {
      report.recordingE2E = {
        status: "NOT_VERIFIED",
        reason: "stop-button-missing-after-rec",
        phaseHint: await panel.innerText().catch(() => null),
      };
    } else {
      const ready = page.getByText(/Nagranie gotowe/i);
      try {
        await ready.waitFor({ state: "visible", timeout: 120000 });
      } catch {
        report.recordingE2E = {
          status: "NOT_VERIFIED",
          reason: "take-ready-not-shown",
          panelText: await panel.innerText().catch(() => null),
        };
      }

      if (!report.recordingE2E) {
        // Do NOT click Odtwórz / Play
        const keep = page.getByRole("button", { name: /✓ Zachowaj/i });
        if ((await keep.count()) === 0) {
          report.recordingE2E = {
            status: "NOT_VERIFIED",
            reason: "zachowaj-missing",
          };
        } else {
          await keep.first().click();
          await page.waitForTimeout(3000);
          await muteAudio(page);

          await page.goto(`${base}/account/takes`, {
            waitUntil: "networkidle",
            timeout: 90000,
          });
          await muteAudio(page);
          await page.waitForTimeout(1000);
          const body = await page.evaluate(() => document.body.innerText || "");
          const hasTake =
            /nagranie|take|READY|gotow|sekund|\d+\s*s/i.test(body) &&
            !/Jeszcze cicho|Nie masz jeszcze żadnego nagrania/i.test(body);
          const archFile = path.join(
            outDir,
            "archive-after-take-desktop-1280x800.png",
          );
          await page.screenshot({
            path: archFile,
            type: "png",
            fullPage: false,
          });
          const { w, h } = pngSize(archFile);
          report.ihdr.push({
            file: path.basename(archFile),
            w,
            h,
            ok: w === 1280 && h === 800,
          });
          report.shots.push({
            id: path.basename(archFile),
            status: w === 1280 ? "PASS" : "FAIL",
          });
          report.recordingE2E = {
            status: hasTake ? "PASS" : "NOT_VERIFIED",
            reason: hasTake ? undefined : "archive-empty-or-unclear",
            mock: true,
          };
        }
      }
    }
  }
} else if (!report.recordingE2E) {
  report.recordingE2E = {
    status: "NOT_VERIFIED",
    reason: "beat-not-attached",
  };
}

await browser.close();

fs.writeFileSync(
  path.join(outDir, "recording-local-e2e-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      defaultR: report.defaultR?.status,
      consciousArm: report.consciousArm?.status,
      masterDark: report.masterContrast.dark,
      masterLight: report.masterContrast.light,
      recordingE2E: report.recordingE2E,
      themeRoundTrip: report.themeRoundTrip,
      shots: report.shots.length,
      ihdrFail: report.ihdr.filter((x) => !x.ok),
    },
    null,
    2,
  ),
);
process.exit(0);
