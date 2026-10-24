/**
 * With APPROVED (not PUBLISHED) fixture: confirm picker visibility, recording gate,
 * Motyw placement, theme round-trip, editor shots dark/light × desktop/mobile.
 * Does NOT bypass publish. No Play/export. Creds via CREDS_PATH (owner).
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const outDir = path.resolve(
  "docs/audits/_studio_recording_local_e2e_2026-10-24",
);
const KEY = "bitrymdym.theme";
const FIXTURE = "Visual Fixture — Local Only";
const creds = JSON.parse(fs.readFileSync(process.env.CREDS_PATH, "utf8"));
const base = creds.base;
if (
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(new URL(base).origin)
) {
  throw new Error("REFUSE non-loopback base");
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
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

const report = {
  capturedAt: new Date().toISOString(),
  fixtureStatusExpected: "APPROVED_not_PUBLISHED",
  pickerVisibility: null,
  recordingGate: null,
  consciousArm: null,
  mockRec: null,
  takeSave: null,
  archive: null,
  themeRoundTrip: null,
  motywPlacement: null,
  ihdr: [],
  shots: [],
  defects: [],
  productVsMock: {
    productBlock:
      "Publish blocked by rights attestation product gate; REC requires PUBLISHED",
    mockNotExercised:
      "MediaRecorder harness not reached because product gate blocks REC primary",
  },
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
const page = await context.newPage();

try {
  await login(page);
  await page.goto(`${base}/studio`, { waitUntil: "networkidle", timeout: 90000 });
  await muteAudio(page);
  const openBtn = page.getByRole("button", { name: /^Otwórz$/i });
  if ((await openBtn.count()) > 0) await openBtn.first().click();
  else await page.locator('a[href*="/studio/p/"]').first().click();
  await page.waitForURL(/\/studio\/p\/[^/]+/, { timeout: 60000 });
  await muteAudio(page);
  const projectId = new URL(page.url()).pathname.split("/").pop();

  // Attach / verify fixture in picker
  const needPick = await page.evaluate(() =>
    /Nie masz jeszcze wybranego bitu/i.test(document.body.innerText || ""),
  );
  if (needPick) {
    await page.getByRole("button", { name: /\+?\s*Wybierz bit/i }).first().click();
  } else {
    // open picker to check Moje visibility even if already attached
    const change = page.getByRole("button", {
      name: /Zmień bit|Wybierz bit/i,
    });
    if ((await change.count()) > 0) await change.first().click();
  }
  const dialog = page.getByRole("dialog", { name: /Wybierz bit/i });
  let inPicker = false;
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Moje", exact: true }).click();
    await page.waitForTimeout(600);
    const fixture = dialog.locator("ul li button", { hasText: FIXTURE });
    inPicker = (await fixture.count()) > 0;
    report.pickerVisibility = {
      status: inPicker ? "PASS" : "FAIL",
      surface: "Moje",
    };
    if (inPicker && needPick) {
      await fixture.first().click();
      await dialog.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
    } else if (await dialog.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
    }
  } else {
    // Already attached — treat as visible if title on page
    const onPage = await page.evaluate(
      (t) => (document.body.innerText || "").includes(t),
      FIXTURE,
    );
    report.pickerVisibility = {
      status: onPage ? "PASS" : "NOT_VERIFIED",
      surface: onPage ? "editor-attached" : "picker-unavailable",
    };
  }
  await muteAudio(page);

  // Recording gate
  const recordTab = page.getByRole("button", { name: /^RECORD$/i });
  if ((await recordTab.count()) > 0) await recordTab.first().click({ force: true });
  const transportRec = page.locator(
    '[data-testid="studio-transport"] button[aria-label*="Nagraj"], [data-testid="studio-transport"] button[aria-label*="Record"], [data-testid="studio-transport"] button[aria-label*="REC"]',
  );
  if ((await transportRec.count()) > 0) {
    await transportRec.first().click({ force: true });
    await page.waitForTimeout(500);
  }
  const panel = page.locator('[aria-label="Nagrywanie w Studio"]');
  await panel.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  const panelText = await panel.innerText().catch(() => "");
  const bodyText = await page.evaluate(() => document.body.innerText || "");
  const gate =
    /tylko dla opublikowanych bitów|opublikowanych bitów/i.test(
      panelText + "\n" + bodyText,
    );
  report.recordingGate = {
    status: gate ? "PRESENT_BLOCKING" : "LIFTED_OR_ABSENT",
    gateCopyPresent: gate,
  };

  // Conscious R arm (product behavior independent of publish)
  const rButtons = page.locator("button", { hasText: /^R$/ });
  const countR = await rButtons.count();
  let armed = false;
  for (let i = 0; i < countR; i++) {
    const pressed = await rButtons.nth(i).getAttribute("aria-pressed");
    if (pressed !== "true") {
      await rButtons.nth(i).click({ force: true });
      armed = true;
      break;
    }
  }
  await page.waitForTimeout(400);
  const arms = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => (b.textContent || "").trim() === "R")
      .map((b) => b.getAttribute("aria-pressed")),
  );
  report.consciousArm = {
    status: armed && arms.some((a) => a === "true") ? "PASS" : "FAIL",
    arms,
  };

  // Attempt REC primary — expect blocked
  const nagraj = page.getByRole("button", { name: /● Nagraj/i });
  report.mockRec = {
    status: (await nagraj.count()) === 0 ? "BLOCKED" : "BUTTON_PRESENT",
    note:
      (await nagraj.count()) === 0
        ? "REC primary absent while unpublished-gate active"
        : "REC visible despite gate — unexpected",
  };
  report.takeSave = { status: "NOT_RUN" };
  report.archive = { status: "NOT_RUN" };

  // Theme + shots for attached APPROVED beat editor
  for (const theme of ["dark", "light"]) {
    await setThemeViaUi(page, theme);
    await muteAudio(page);
    const place = await page.evaluate(() => {
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
      return { ok: toggleIdx >= 0 && hasAccount, toggleIdx };
    });
    report.motywPlacement = {
      ...(report.motywPlacement || {}),
      [theme]: place,
    };
    const file = path.join(
      outDir,
      `${theme}-editor-approved-attached-desktop-1280x800.png`,
    );
    await page.screenshot({ path: file, type: "png", fullPage: false });
    const { w, h } = pngSize(file);
    report.ihdr.push({
      file: path.basename(file),
      w,
      h,
      ok: w === 1280 && h === 800,
    });
    report.shots.push(path.basename(file));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["dark", "light"]) {
    await setThemeViaUi(page, theme);
    await muteAudio(page);
    const file = path.join(
      outDir,
      `${theme}-editor-approved-attached-mobile-390x844.png`,
    );
    await page.screenshot({ path: file, type: "png", fullPage: false });
    const { w, h } = pngSize(file);
    report.ihdr.push({
      file: path.basename(file),
      w,
      h,
      ok: w === 390 && h === 844,
    });
    report.shots.push(path.basename(file));
  }
  await page.setViewportSize({ width: 1280, height: 800 });

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
} catch (e) {
  report.defects.push(String(e?.message || e).slice(0, 240));
}

await browser.close();
fs.writeFileSync(
  path.join(outDir, "gate-and-theme-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      picker: report.pickerVisibility?.status,
      gate: report.recordingGate?.status,
      arm: report.consciousArm?.status,
      mockRec: report.mockRec?.status,
      theme: report.themeRoundTrip,
      ihdrFail: report.ihdr.filter((x) => !x.ok).length,
      defects: report.defects.length,
    },
    null,
    2,
  ),
);
process.exit(report.defects.length ? 1 : 0);
