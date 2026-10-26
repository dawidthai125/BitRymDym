/**
 * Node host: esbuild IIFE + Playwright for ChangePasswordForm mount.
 * Excluded from production tsconfig. Reuses sign-up-form.mount.css.
 */
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

import {
  CHANGE_PASSWORD_MISMATCH_MESSAGE,
  CHANGE_PASSWORD_SUCCESS_MESSAGE,
} from "@/components/auth/change-password-form.mount-stubs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "change-password-form.mount-entry.tsx");
const STUBS = path.join(HERE, "change-password-form.mount-stubs.tsx");
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
    plugins: [
      {
        name: "change-password-form-mount-stubs",
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "cp-mount:next-link",
            namespace: "cp-mount",
          }));
          build.onResolve({ filter: /^@\/lib\/auth\/actions$/ }, () => ({
            path: "cp-mount:auth-actions",
            namespace: "cp-mount",
          }));
          build.onLoad({ filter: /.*/, namespace: "cp-mount" }, (args) => {
            if (args.path === "cp-mount:next-link") {
              return {
                contents: `import { NextLink } from ${JSON.stringify(STUBS)}; export default NextLink;`,
                loader: "tsx",
                resolveDir: HERE,
              };
            }
            return {
              contents: `export {
                signUpAction, signInAction, changePasswordAction, deleteAccountAction,
                requestEmailChangeAction, requestPasswordResetAction,
                updatePasswordAfterResetAction, type AuthActionState,
              } from ${JSON.stringify(STUBS)};`,
              loader: "tsx",
              resolveDir: HERE,
            };
          });
        },
      },
    ],
  });
  const text = result.outputFiles?.[0]?.text;
  if (!text) throw new Error("esbuild produced empty ChangePasswordForm mount bundle");
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

export async function closeChangePasswordFormMountHost(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
  bundleCache = null;
}

export function invalidateChangePasswordFormMountBundle(): void {
  bundleCache = null;
  cssCache = null;
}

type Probe = {
  mounted: boolean;
  mockCalls: number;
  statusText: string | null;
  statusVisible: boolean;
  statusInAxTree: boolean;
  alertText: string | null;
  alertVisible: boolean;
  alertInAxTree: boolean;
  providerSpecificLeak: boolean;
  networkNonLocal: number;
  authShapedAttempts: number;
};

async function openMountedPage() {
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
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head>
    <body>
      <div id="change-password-form-mount-root"></div>
      <script>${js}</script>
      <script>window.__BRD_CHANGE_PASSWORD_FORM_MOUNT__.mount();</script>
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

function leak(pageText: string): boolean {
  return /invalid login|user not found|supabase|auth\/v1|email not confirmed/i.test(
    pageText,
  );
}

export async function probeChangePasswordFormSuccess(): Promise<Probe> {
  invalidateChangePasswordFormMountBundle();
  const { context, page, counters } = await openMountedPage();
  const formVisible = await page.locator("form").count();
  if (formVisible < 1) {
    const c = counters();
    await context.close();
    return {
      mounted: false,
      mockCalls: 0,
      statusText: null,
      statusVisible: false,
      statusInAxTree: false,
      alertText: null,
      alertVisible: false,
      alertInAxTree: false,
      providerSpecificLeak: false,
      ...c,
    };
  }

  await page.locator('input[name="currentPassword"]').fill("fake-current-A");
  await page.locator('input[name="newPassword"]').fill("fake-password-A");
  await page.locator('input[name="confirmPassword"]').fill("fake-password-A");
  await page.getByRole("button", { name: /Zmień hasło/i }).click();
  await page.getByRole("status").waitFor({ state: "visible", timeout: 10_000 });

  const statusText = ((await page.getByRole("status").textContent()) || "").trim();
  const alertVisible = (await page.getByRole("alert").count()) > 0;
  const mockCalls = await page.evaluate(
    () => window.__BRD_CHANGE_PASSWORD_MOCK_CALLS__ ?? 0,
  );
  const pageText = ((await page.locator("body").innerText()) || "").trim();
  const statusInAxTree = await axHasRoleText(
    page,
    context,
    "status",
    CHANGE_PASSWORD_SUCCESS_MESSAGE,
  );
  const c = counters();
  await context.close();
  return {
    mounted: true,
    mockCalls,
    statusText: statusText || null,
    statusVisible: true,
    statusInAxTree,
    alertText: null,
    alertVisible,
    alertInAxTree: false,
    providerSpecificLeak: leak(pageText),
    ...c,
  };
}

export async function probeChangePasswordFormMismatchAlert(): Promise<Probe> {
  invalidateChangePasswordFormMountBundle();
  const { context, page, counters } = await openMountedPage();
  const formVisible = await page.locator("form").count();
  if (formVisible < 1) {
    const c = counters();
    await context.close();
    return {
      mounted: false,
      mockCalls: 0,
      statusText: null,
      statusVisible: false,
      statusInAxTree: false,
      alertText: null,
      alertVisible: false,
      alertInAxTree: false,
      providerSpecificLeak: false,
      ...c,
    };
  }

  await page.locator('input[name="currentPassword"]').fill("fake-current-A");
  await page.locator('input[name="newPassword"]').fill("fake-password-A");
  await page.locator('input[name="confirmPassword"]').fill("fake-password-B");
  await page.getByRole("button", { name: /Zmień hasło/i }).click();
  await page.getByRole("alert").waitFor({ state: "visible", timeout: 10_000 });

  const alertText = ((await page.getByRole("alert").textContent()) || "").trim();
  const statusVisible = (await page.getByRole("status").count()) > 0;
  const mockCalls = await page.evaluate(
    () => window.__BRD_CHANGE_PASSWORD_MOCK_CALLS__ ?? 0,
  );
  const pageText = ((await page.locator("body").innerText()) || "").trim();
  const alertInAxTree = await axHasRoleText(
    page,
    context,
    "alert",
    CHANGE_PASSWORD_MISMATCH_MESSAGE,
  );
  const c = counters();
  await context.close();
  return {
    mounted: true,
    mockCalls,
    statusText: null,
    statusVisible,
    statusInAxTree: false,
    alertText: alertText || null,
    alertVisible: true,
    alertInAxTree,
    providerSpecificLeak: leak(pageText),
    ...c,
  };
}
