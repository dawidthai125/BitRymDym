/**
 * Node host: esbuild IIFE + Playwright for EmailChangeNotice mount (props only).
 * Excluded from production tsconfig. Reuses sign-up-form.mount.css.
 */
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

import { EMAIL_CHANGE_NOTICE_COPY } from "@/lib/auth/email-change";
import type { EmailChangeNoticeMountStatus } from "@/components/auth/email-change-notice.mount-entry";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "email-change-notice.mount-entry.tsx");
const CSS_PATH = path.join(HERE, "sign-up-form.mount.css");
const SRC_ROOT = path.resolve(HERE, "../..");

let bundleCache: string | null = null;
let cssCache: string | null = null;
let browserPromise: Promise<Browser> | null = null;

function getCss(): string {
  if (!cssCache) cssCache = readFileSync(CSS_PATH, "utf8");
  return cssCache;
}

async function getBundle(): Promise<string> {
  if (bundleCache) return bundleCache;
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    jsx: "automatic",
    sourcemap: false,
    logLevel: "silent",
    alias: { "@": SRC_ROOT },
  });
  const text = result.outputFiles?.[0]?.text;
  if (!text) throw new Error("esbuild produced empty EmailChangeNotice mount bundle");
  bundleCache = text;
  return text;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--no-sandbox"],
    });
  }
  return browserPromise;
}

export async function closeEmailChangeNoticeMountHost(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
  bundleCache = null;
}

export function invalidateEmailChangeNoticeMountBundle(): void {
  bundleCache = null;
  cssCache = null;
}

type Probe = {
  mounted: boolean;
  roleVisible: boolean;
  roleInAxTree: boolean;
  oppositeRoleVisible: boolean;
  titleMatch: boolean;
  networkNonLocal: number;
  authShapedAttempts: number;
};

function expectedRole(
  status: EmailChangeNoticeMountStatus,
): "alert" | "status" | null {
  if (status === null) return null;
  return status === "invalid" ? "alert" : "status";
}

async function openMountedPage(status: EmailChangeNoticeMountStatus) {
  const [js, css] = await Promise.all([getBundle(), Promise.resolve(getCss())]);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  let networkNonLocal = 0;
  let authShapedAttempts = 0;
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (
      url.startsWith("data:") ||
      url.startsWith("blob:") ||
      url === "about:blank"
    ) {
      await route.continue();
      return;
    }
    if (/\/auth\/v1\//i.test(url) || /supabase\.co/i.test(url)) {
      authShapedAttempts += 1;
    }
    networkNonLocal += 1;
    await route.abort("blockedbyclient");
  });
  const statusLiteral = JSON.stringify(status);
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head>
    <body>
      <div id="email-change-notice-mount-root"></div>
      <script>${js}</script>
      <script>window.__BRD_EMAIL_CHANGE_NOTICE_MOUNT__.mount(${statusLiteral});</script>
    </body></html>`,
    { waitUntil: "domcontentloaded" },
  );
  return {
    context,
    page,
    counters: () => ({ networkNonLocal, authShapedAttempts }),
  };
}

async function axHasRoleText(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  context: Awaited<ReturnType<Browser["newContext"]>>,
  role: "status" | "alert",
  text: string,
): Promise<boolean> {
  const client = await context.newCDPSession(page);
  await client.send("Accessibility.enable");
  const { nodes } = await client.send("Accessibility.getFullAXTree");
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  function collectName(nodeId: number | undefined, depth = 0): string {
    if (nodeId == null || depth > 6) return "";
    const n = byId.get(nodeId);
    if (!n || n.ignored) return "";
    const self = n.name?.value || "";
    const kids = (n.childIds || [])
      .map((id) => collectName(id, depth + 1))
      .join(" ");
    return `${self} ${kids}`.trim();
  }
  return nodes.some((n) => {
    if (n.ignored) return false;
    if ((n.role?.value || "") !== role) return false;
    return collectName(n.nodeId).includes(text);
  });
}

export async function probeEmailChangeNotice(
  status: EmailChangeNoticeMountStatus,
): Promise<Probe> {
  invalidateEmailChangeNoticeMountBundle();
  const { context, page, counters } = await openMountedPage(status);
  const role = expectedRole(status);
  const expectedTitle =
    status !== null ? EMAIL_CHANGE_NOTICE_COPY[status].title : null;

  const rootCount = await page.locator("#email-change-notice-mount-root").count();
  const alertCount = await page.getByRole("alert").count();
  const statusCount = await page.getByRole("status").count();

  if (rootCount < 1) {
    const c = counters();
    await context.close();
    return {
      mounted: false,
      roleVisible: false,
      roleInAxTree: false,
      oppositeRoleVisible: false,
      titleMatch: false,
      ...c,
    };
  }

  if (status === null) {
    const c = counters();
    await context.close();
    return {
      mounted: alertCount === 0 && statusCount === 0,
      roleVisible: false,
      roleInAxTree: false,
      oppositeRoleVisible: false,
      titleMatch: false,
      ...c,
    };
  }

  const titleMatch = expectedTitle
    ? (await page.getByRole("heading", { level: 2, name: expectedTitle }).count()) >
      0
    : false;

  const roleVisible =
    role === "alert" ? alertCount > 0 : role === "status" ? statusCount > 0 : false;

  const oppositeRoleVisible =
    role === "alert"
      ? statusCount > 0
      : role === "status"
        ? alertCount > 0
        : false;

  let roleInAxTree = false;
  if (role && expectedTitle) {
    roleInAxTree = await axHasRoleText(page, context, role, expectedTitle);
  }

  const c = counters();
  await context.close();
  return {
    mounted: titleMatch && roleVisible,
    roleVisible,
    roleInAxTree,
    oppositeRoleVisible,
    titleMatch,
    ...c,
  };
}
