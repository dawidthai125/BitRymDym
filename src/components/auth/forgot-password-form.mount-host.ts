/**
 * Node host: esbuild IIFE + Playwright Chromium for ForgotPasswordForm mount.
 * Excluded from production tsconfig (playwright is a devDependency).
 * Reuses sign-up-form.mount.css (same AUTH_FIELD_CLASS + Button utilities).
 */
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

import { FORGOT_PASSWORD_NEUTRAL_MESSAGE } from "@/components/auth/forgot-password-form.mount-stubs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "forgot-password-form.mount-entry.tsx");
const STUBS = path.join(HERE, "forgot-password-form.mount-stubs.tsx");
const CSS_PATH = path.join(HERE, "sign-up-form.mount.css");
const SRC_ROOT = path.resolve(HERE, "../..");

const NEUTRAL_TEXT = FORGOT_PASSWORD_NEUTRAL_MESSAGE;

let bundleCache: string | null = null;
let cssCache: string | null = null;
let browserPromise: Promise<Browser> | null = null;

export function getForgotPasswordFormMountCss(): string {
  if (!cssCache) cssCache = readFileSync(CSS_PATH, "utf8");
  return cssCache;
}

export async function getForgotPasswordFormMountBundle(): Promise<string> {
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
    alias: {
      "@": SRC_ROOT,
    },
    plugins: [
      {
        name: "forgot-password-form-mount-stubs",
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "forgot-password-form-mount:next-link",
            namespace: "forgot-password-form-mount",
          }));
          build.onResolve({ filter: /^@\/lib\/auth\/actions$/ }, () => ({
            path: "forgot-password-form-mount:auth-actions",
            namespace: "forgot-password-form-mount",
          }));
          build.onLoad(
            { filter: /.*/, namespace: "forgot-password-form-mount" },
            (args) => {
              if (args.path === "forgot-password-form-mount:next-link") {
                return {
                  contents: `
                    import { NextLink } from ${JSON.stringify(STUBS)};
                    export default NextLink;
                  `,
                  loader: "tsx",
                  resolveDir: HERE,
                };
              }
              return {
                contents: `
                  export {
                    signUpAction,
                    signInAction,
                    changePasswordAction,
                    deleteAccountAction,
                    requestEmailChangeAction,
                    requestPasswordResetAction,
                    updatePasswordAfterResetAction,
                    type AuthActionState,
                  } from ${JSON.stringify(STUBS)};
                `,
                loader: "tsx",
                resolveDir: HERE,
              };
            },
          );
        },
      },
    ],
  });

  const text = result.outputFiles?.[0]?.text;
  if (!text) {
    throw new Error("esbuild produced empty ForgotPasswordForm mount bundle");
  }
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

export async function closeForgotPasswordFormMountHost(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
  bundleCache = null;
}

export function invalidateForgotPasswordFormMountBundle(): void {
  bundleCache = null;
  cssCache = null;
}

export type ForgotPasswordNeutralMountProbe = {
  mounted: boolean;
  mockCalls: number;
  statusText: string | null;
  statusVisible: boolean;
  statusInAxTree: boolean;
  alertVisible: boolean;
  providerSpecificLeak: boolean;
  networkNonLocal: number;
  authShapedAttempts: number;
};

export async function probeForgotPasswordFormNeutralSuccess(): Promise<ForgotPasswordNeutralMountProbe> {
  const [js, css] = await Promise.all([
    getForgotPasswordFormMountBundle(),
    Promise.resolve(getForgotPasswordFormMountCss()),
  ]);
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
      <div id="forgot-password-form-mount-root"></div>
      <script>${js}</script>
      <script>window.__BRD_FORGOT_PASSWORD_FORM_MOUNT__.mount();</script>
    </body></html>`,
    { waitUntil: "domcontentloaded" },
  );

  const formVisible = await page.locator("form").count();
  const empty: ForgotPasswordNeutralMountProbe = {
    mounted: formVisible > 0,
    mockCalls: 0,
    statusText: null,
    statusVisible: false,
    statusInAxTree: false,
    alertVisible: false,
    providerSpecificLeak: false,
    networkNonLocal,
    authShapedAttempts,
  };

  if (formVisible < 1) {
    await context.close();
    return empty;
  }

  // Synthetic .invalid only — HTML5 must allow submit (valid email shape).
  await page.locator('input[name="email"]').fill("probe@example.invalid");

  await page.getByRole("button", { name: /Wyślij link resetu/i }).click();
  await page.getByRole("status").waitFor({ state: "visible", timeout: 10_000 });

  const status = page.getByRole("status");
  const statusText = ((await status.textContent()) || "").trim();
  const statusVisible = await status.isVisible();
  const alertVisible = (await page.getByRole("alert").count()) > 0;

  const mockCalls = await page.evaluate(
    () => window.__BRD_FORGOT_PASSWORD_MOCK_CALLS__ ?? 0,
  );

  const leakPattern =
    /user not found|email not found|nie znaleziono|konto nie istnieje|already registered/i;
  const pageText = ((await page.locator("body").innerText()) || "").trim();
  const providerSpecificLeak =
    leakPattern.test(statusText) || leakPattern.test(pageText);

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
  const statusInAxTree = nodes.some((n) => {
    if (n.ignored) return false;
    if ((n.role?.value || "") !== "status") return false;
    return collectName(n.nodeId).includes(NEUTRAL_TEXT);
  });

  await context.close();

  return {
    mounted: true,
    mockCalls,
    statusText: statusText || null,
    statusVisible,
    statusInAxTree,
    alertVisible,
    providerSpecificLeak,
    networkNonLocal,
    authShapedAttempts,
  };
}
