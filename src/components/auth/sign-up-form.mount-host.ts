/**
 * Node host: esbuild IIFE + Playwright Chromium for SignUpForm mount.
 * Excluded from production tsconfig (playwright is a devDependency).
 */
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "sign-up-form.mount-entry.tsx");
const STUBS = path.join(HERE, "sign-up-form.mount-stubs.tsx");
const CSS_PATH = path.join(HERE, "sign-up-form.mount.css");
const SRC_ROOT = path.resolve(HERE, "../..");

const MISMATCH_TEXT = "Hasła nie są takie same.";

let bundleCache: string | null = null;
let cssCache: string | null = null;
let browserPromise: Promise<Browser> | null = null;

export function getSignUpFormMountCss(): string {
  if (!cssCache) cssCache = readFileSync(CSS_PATH, "utf8");
  return cssCache;
}

export async function getSignUpFormMountBundle(): Promise<string> {
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
        name: "sign-up-form-mount-stubs",
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "sign-up-form-mount:next-link",
            namespace: "sign-up-form-mount",
          }));
          build.onResolve({ filter: /^@\/lib\/auth\/actions$/ }, () => ({
            path: "sign-up-form-mount:auth-actions",
            namespace: "sign-up-form-mount",
          }));
          build.onLoad(
            { filter: /.*/, namespace: "sign-up-form-mount" },
            (args) => {
              if (args.path === "sign-up-form-mount:next-link") {
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
    throw new Error("esbuild produced empty SignUpForm mount bundle");
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

export async function closeSignUpFormMountHost(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
  bundleCache = null;
}

export function invalidateSignUpFormMountBundle(): void {
  bundleCache = null;
  cssCache = null;
}

export type SignUpMismatchMountProbe = {
  mounted: boolean;
  mockCalls: number;
  alertText: string | null;
  alertVisible: boolean;
  alertInAxTree: boolean;
  statusVisible: boolean;
  networkNonLocal: number;
  authShapedAttempts: number;
};

export async function probeSignUpFormPasswordMismatch(): Promise<SignUpMismatchMountProbe> {
  const [js, css] = await Promise.all([
    getSignUpFormMountBundle(),
    Promise.resolve(getSignUpFormMountCss()),
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
      <div id="sign-up-form-mount-root"></div>
      <script>${js}</script>
      <script>window.__BRD_SIGN_UP_FORM_MOUNT__.mount();</script>
    </body></html>`,
    { waitUntil: "domcontentloaded" },
  );

  const formVisible = await page.locator("form").count();
  const empty: SignUpMismatchMountProbe = {
    mounted: formVisible > 0,
    mockCalls: 0,
    alertText: null,
    alertVisible: false,
    alertInAxTree: false,
    statusVisible: false,
    networkNonLocal,
    authShapedAttempts,
  };

  if (formVisible < 1) {
    await context.close();
    return empty;
  }

  // Synthetic values only — HTML5 must allow submit (valid email + minLength).
  await page.locator('input[name="displayName"]').fill("ProbeUi");
  await page.locator('input[name="email"]').fill("probe@example.invalid");
  await page.locator('input[name="password"]').fill("fake-password-A");
  await page.locator('input[name="confirmPassword"]').fill("fake-password-B");
  await page.locator('input[name="acceptTerms"]').check();

  await page.getByRole("button", { name: /Załóż konto/i }).click();
  await page.getByRole("alert").waitFor({ state: "visible", timeout: 10_000 });

  const alert = page.getByRole("alert");
  const alertText = ((await alert.textContent()) || "").trim();
  const alertVisible = await alert.isVisible();
  const statusVisible = (await page.getByRole("status").count()) > 0;

  const mockCalls = await page.evaluate(
    () => window.__BRD_SIGN_UP_MOCK_CALLS__ ?? 0,
  );

  // CDP AX: alert name may be empty; text often lives on a StaticText child.
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
  const alertInAxTree = nodes.some((n) => {
    if (n.ignored) return false;
    if ((n.role?.value || "") !== "alert") return false;
    return collectName(n.nodeId).includes(MISMATCH_TEXT);
  });

  await context.close();

  return {
    mounted: true,
    mockCalls,
    alertText: alertText || null,
    alertVisible,
    alertInAxTree,
    statusVisible,
    networkNonLocal,
    authShapedAttempts,
  };
}

export type SignUpPasswordVisibilityProbe = {
  mounted: boolean;
  passwordInitialType: string | null;
  confirmInitialType: string | null;
  passwordAfterOwnToggle: string | null;
  confirmAfterPasswordToggle: string | null;
  confirmAfterOwnToggle: string | null;
  passwordAfterConfirmToggle: string | null;
  passwordValuePreserved: boolean;
  confirmValuePreserved: boolean;
  passwordToggleLabelHidden: string | null;
  passwordToggleLabelShown: string | null;
  confirmToggleLabelHidden: string | null;
  confirmToggleLabelShown: string | null;
  passwordPressedAfterClick: string | null;
  passwordTypeAfterKeyboard: string | null;
  mockCallsAfterToggles: number;
  passwordToggleMinSideMobile: number;
  confirmToggleMinSideMobile: number;
  passwordToggleMinSideDesktop: number;
  confirmToggleMinSideDesktop: number;
  usedRealButton: boolean;
  networkNonLocal: number;
  authShapedAttempts: number;
};

async function mountSignUpPage(viewport: {
  width: number;
  height: number;
  isMobile?: boolean;
}) {
  const [js, css] = await Promise.all([
    getSignUpFormMountBundle(),
    Promise.resolve(getSignUpFormMountCss()),
  ]);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile ?? false,
    hasTouch: viewport.isMobile ?? false,
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
      <div id="sign-up-form-mount-root"></div>
      <script>${js}</script>
      <script>window.__BRD_SIGN_UP_FORM_MOUNT__.mount();</script>
    </body></html>`,
    { waitUntil: "domcontentloaded" },
  );

  return {
    context,
    page,
    networkNonLocal: () => networkNonLocal,
    authShapedAttempts: () => authShapedAttempts,
  };
}

export async function probeSignUpFormPasswordVisibility(): Promise<SignUpPasswordVisibilityProbe> {
  invalidateSignUpFormMountBundle();
  const mobile = await mountSignUpPage({
    width: 390,
    height: 844,
    isMobile: true,
  });

  const formVisible = await mobile.page.locator("form").count();
  if (formVisible < 1) {
    await mobile.context.close();
    return {
      mounted: false,
      passwordInitialType: null,
      confirmInitialType: null,
      passwordAfterOwnToggle: null,
      confirmAfterPasswordToggle: null,
      confirmAfterOwnToggle: null,
      passwordAfterConfirmToggle: null,
      passwordValuePreserved: false,
      confirmValuePreserved: false,
      passwordToggleLabelHidden: null,
      passwordToggleLabelShown: null,
      confirmToggleLabelHidden: null,
      confirmToggleLabelShown: null,
      passwordPressedAfterClick: null,
      passwordTypeAfterKeyboard: null,
      mockCallsAfterToggles: 0,
      passwordToggleMinSideMobile: 0,
      confirmToggleMinSideMobile: 0,
      passwordToggleMinSideDesktop: 0,
      confirmToggleMinSideDesktop: 0,
      usedRealButton: false,
      networkNonLocal: mobile.networkNonLocal(),
      authShapedAttempts: mobile.authShapedAttempts(),
    };
  }

  const password = mobile.page.locator('input[name="password"]');
  const confirm = mobile.page.locator('input[name="confirmPassword"]');
  const passwordToggleShow = mobile.page.getByRole("button", {
    name: "Pokaż hasło",
    exact: true,
  });
  const confirmToggleShow = mobile.page.getByRole("button", {
    name: "Pokaż powtórzone hasło",
    exact: true,
  });

  await password.fill("fake-password-A");
  await confirm.fill("fake-password-B");

  const passwordInitialType = await password.getAttribute("type");
  const confirmInitialType = await confirm.getAttribute("type");
  const passwordToggleLabelHidden = await passwordToggleShow.getAttribute(
    "aria-label",
  );
  const confirmToggleLabelHidden = await confirmToggleShow.getAttribute(
    "aria-label",
  );

  const pwBox = await passwordToggleShow.boundingBox();
  const cfBox = await confirmToggleShow.boundingBox();

  await passwordToggleShow.click();
  const passwordAfterOwnToggle = await password.getAttribute("type");
  const confirmAfterPasswordToggle = await confirm.getAttribute("type");
  const passwordToggleHide = mobile.page.getByRole("button", {
    name: "Ukryj hasło",
    exact: true,
  });
  const passwordToggleLabelShown = await passwordToggleHide.getAttribute(
    "aria-label",
  );
  const passwordValuePreserved =
    (await password.inputValue()) === "fake-password-A";

  await confirmToggleShow.click();
  const confirmAfterOwnToggle = await confirm.getAttribute("type");
  const passwordAfterConfirmToggle = await password.getAttribute("type");
  const confirmValuePreserved =
    (await confirm.inputValue()) === "fake-password-B";
  const confirmToggleHide = mobile.page.getByRole("button", {
    name: "Ukryj powtórzone hasło",
    exact: true,
  });
  const confirmToggleLabelShown = await confirmToggleHide.getAttribute(
    "aria-label",
  );
  const passwordPressedAfterClick =
    await passwordToggleHide.getAttribute("aria-pressed");
  const usedRealButton =
    (await passwordToggleHide.getAttribute("data-slot")) === "button";

  await passwordToggleHide.focus();
  await mobile.page.keyboard.press("Space");
  const passwordTypeAfterKeyboard = await password.getAttribute("type");

  const mockCallsAfterToggles = await mobile.page.evaluate(
    () => window.__BRD_SIGN_UP_MOCK_CALLS__ ?? 0,
  );
  const networkMobile = mobile.networkNonLocal();
  const authMobile = mobile.authShapedAttempts();
  await mobile.context.close();

  const desktop = await mountSignUpPage({
    width: 1280,
    height: 800,
    isMobile: false,
  });
  const desktopPw = desktop.page.getByRole("button", {
    name: "Pokaż hasło",
    exact: true,
  });
  const desktopCf = desktop.page.getByRole("button", {
    name: "Pokaż powtórzone hasło",
    exact: true,
  });
  await desktopPw.waitFor({ state: "visible", timeout: 10_000 });
  const dPw = await desktopPw.boundingBox();
  const dCf = await desktopCf.boundingBox();
  const networkDesktop = desktop.networkNonLocal();
  const authDesktop = desktop.authShapedAttempts();
  await desktop.context.close();

  const minSide = (box: { width: number; height: number } | null) =>
    Math.round(Math.min(box?.width ?? 0, box?.height ?? 0));

  return {
    mounted: true,
    passwordInitialType,
    confirmInitialType,
    passwordAfterOwnToggle,
    confirmAfterPasswordToggle,
    confirmAfterOwnToggle,
    passwordAfterConfirmToggle,
    passwordValuePreserved,
    confirmValuePreserved,
    passwordToggleLabelHidden,
    passwordToggleLabelShown,
    confirmToggleLabelHidden,
    confirmToggleLabelShown,
    passwordPressedAfterClick,
    passwordTypeAfterKeyboard,
    mockCallsAfterToggles,
    passwordToggleMinSideMobile: minSide(pwBox),
    confirmToggleMinSideMobile: minSide(cfBox),
    passwordToggleMinSideDesktop: minSide(dPw),
    confirmToggleMinSideDesktop: minSide(dCf),
    usedRealButton,
    networkNonLocal: networkMobile + networkDesktop,
    authShapedAttempts: authMobile + authDesktop,
  };
}
