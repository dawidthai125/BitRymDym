/**
 * "Tryb aplikacji ze sklepu": pure rules, the middleware entry (`?app=`), the server
 * helper and the checkout refusal (defence in depth).
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", async (orig) => ({
  ...(await orig<typeof import("next/headers")>()),
  cookies: async () => ({
    get: (name: string) => (name === "brd_app" && cookieJar.value !== undefined ? { name, value: cookieJar.value } : undefined),
  }),
}));

const getUser = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser }, rpc }),
}));

const loadPlanSnapshot = vi.hoisted(() => vi.fn());
const loadAddonSnapshot = vi.hoisted(() => vi.fn());
const registerPayuOrder = vi.hoisted(() => vi.fn());
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payments/snapshots", () => ({ loadPlanSnapshot, loadAddonSnapshot }));
vi.mock("@/lib/payments/payu-client", () => ({ registerPayuOrder }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  requireUser,
}));

import {
  decideStoreAppEntry,
  isStoreAppCookieValue,
  parseStoreAppPlatform,
  STORE_APP_CHECKOUT_CODE,
  STORE_APP_COOKIE,
  STORE_APP_COOKIE_MAX_AGE_SECONDS,
  storeAppCookieOptions,
} from "@/lib/site/store-app";
import { isStoreApp, isStoreAppRequest } from "@/lib/site/store-app-server";
import { middleware, resetMaintenanceCacheForTests } from "@/middleware";
import { startCheckout } from "@/lib/payments/checkout-service";
import { POST as checkoutPost } from "@/app/api/payments/p24/checkout/route";

const SITE = "https://www.bitrymdym.pl";

describe("store-app rules", () => {
  it("accepts only android / ios", () => {
    expect(parseStoreAppPlatform("android")).toBe("android");
    expect(parseStoreAppPlatform(" IOS ")).toBe("ios");
    expect(parseStoreAppPlatform("web")).toBeNull();
    expect(parseStoreAppPlatform("windows")).toBeNull();
    expect(parseStoreAppPlatform(undefined)).toBeNull();
    expect(isStoreAppCookieValue("android")).toBe(true);
    expect(isStoreAppCookieValue("")).toBe(false);
  });

  it("cookie: 1 year, Lax, path /, httpOnly", () => {
    expect(storeAppCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
    expect(STORE_APP_COOKIE_MAX_AGE_SECONDS).toBe(31_536_000);
  });

  it("decideStoreAppEntry: set + redirect without the param, other params kept", () => {
    const d = decideStoreAppEntry({ method: "GET", url: new URL(`${SITE}/beats?app=ios&ref=ABCDEFGH`) });
    expect(d?.kind).toBe("set");
    expect(d && d.kind === "set" ? d.platform : null).toBe("ios");
    expect(d?.redirectTo.toString()).toBe(`${SITE}/beats?ref=ABCDEFGH`);
  });

  it("decideStoreAppEntry: ignores APIs, non-GET, unknown values and no param", () => {
    expect(decideStoreAppEntry({ method: "GET", url: new URL(`${SITE}/api/x?app=android`) })).toBeNull();
    expect(decideStoreAppEntry({ method: "POST", url: new URL(`${SITE}/?app=android`) })).toBeNull();
    expect(decideStoreAppEntry({ method: "GET", url: new URL(`${SITE}/?app=desktop`) })).toBeNull();
    expect(decideStoreAppEntry({ method: "GET", url: new URL(`${SITE}/`) })).toBeNull();
  });

  it("decideStoreAppEntry: ?app=web clears", () => {
    const d = decideStoreAppEntry({ method: "HEAD", url: new URL(`${SITE}/?app=web`) });
    expect(d?.kind).toBe("clear");
    expect(d?.redirectTo.toString()).toBe(`${SITE}/`);
  });
});

describe("middleware — ?app=", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "unit-test-anon");
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } });
    rpc.mockResolvedValue({ data: { enabled: false, message: null, until: null, viewerIsAdmin: false }, error: null });
    resetMaintenanceCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    getUser.mockReset();
    rpc.mockReset();
  });

  it("/?app=android → redirect to / + brd_app=android cookie (1 year)", async () => {
    const res = await middleware(new NextRequest(new URL(`${SITE}/?app=android`)));
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toBe(`${SITE}/`);
    const cookie = res.cookies.get(STORE_APP_COOKIE);
    expect(cookie?.value).toBe("android");
    expect(cookie?.maxAge).toBe(STORE_APP_COOKIE_MAX_AGE_SECONDS);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
    expect(cookie?.httpOnly).toBe(true);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // The redirect never touched Supabase (decided before auth / maintenance).
    expect(getUser).not.toHaveBeenCalled();
  });

  it("/studio?app=ios keeps the path", async () => {
    const res = await middleware(new NextRequest(new URL(`${SITE}/studio?app=ios`)));
    expect(res.headers.get("location")).toBe(`${SITE}/studio`);
    expect(res.cookies.get(STORE_APP_COOKIE)?.value).toBe("ios");
  });

  it("?app=web drops the cookie", async () => {
    const res = await middleware(new NextRequest(new URL(`${SITE}/?app=web`), { headers: { cookie: "brd_app=android" } }));
    expect(res.headers.get("location")).toBe(`${SITE}/`);
    expect(res.cookies.get(STORE_APP_COOKIE)?.value).toBe("");
    expect(res.cookies.get(STORE_APP_COOKIE)?.maxAge).toBe(0);
  });

  it("unknown value or no param → normal pass-through, no cookie", async () => {
    for (const path of ["/?app=desktop", "/beats"]) {
      const res = await middleware(new NextRequest(new URL(`${SITE}${path}`)));
      expect(res.headers.get("location")).toBeNull();
      expect(res.cookies.get(STORE_APP_COOKIE)).toBeUndefined();
    }
  });
});

describe("isStoreApp (server helper)", () => {
  afterEach(() => {
    cookieJar.value = undefined;
  });

  it("reads the brd_app cookie", async () => {
    cookieJar.value = undefined;
    expect(await isStoreApp()).toBe(false);
    cookieJar.value = "android";
    expect(await isStoreApp()).toBe(true);
    cookieJar.value = "ios";
    expect(await isStoreApp()).toBe(true);
    cookieJar.value = "something";
    expect(await isStoreApp()).toBe(false);
  });

  it("isStoreAppRequest parses the Cookie header", () => {
    const req = (cookie?: string) => new Request(`${SITE}/api/x`, { headers: cookie ? { cookie } : {} });
    expect(isStoreAppRequest(req())).toBe(false);
    expect(isStoreAppRequest(req("a=1; brd_app=ios; b=2"))).toBe(true);
    expect(isStoreAppRequest(req("brd_app=nope"))).toBe(false);
    expect(isStoreAppRequest(req("xbrd_app=android"))).toBe(false);
  });
});

describe("checkout refuses in the store app", () => {
  const context = { userId: "33333333-3333-4333-8333-333333333333", email: "a@b.pl", profile: {} as never, permissions: [] };

  beforeEach(() => {
    vi.stubEnv("PLAN_PAYMENTS_AVAILABLE", "1");
    vi.stubEnv("PAYU_POS_ID", "4510332");
    vi.stubEnv("PAYU_CLIENT_SECRET", "client-secret");
    vi.stubEnv("PAYU_MD5_KEY", "md5");
    vi.stubEnv("PAYU_SANDBOX", "true");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    loadPlanSnapshot.mockReset();
    registerPayuOrder.mockReset();
    requireUser.mockReset();
  });

  it("startCheckout({ storeApp: true }) → STORE_APP, no order, no provider call", async () => {
    const result = await startCheckout({
      context,
      body: { product: { kind: "pack", pack: "take" }, consent: { acceptTerms: true, immediatePerformance: true } },
      locale: "pl",
      customerIp: "203.0.113.7",
      storeApp: true,
    });
    expect(result).toEqual({ ok: false, code: STORE_APP_CHECKOUT_CODE });
    expect(loadPlanSnapshot).not.toHaveBeenCalled();
    expect(registerPayuOrder).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("POST /api/payments/p24/checkout with brd_app cookie → 403 STORE_APP", async () => {
    const res = await checkoutPost(
      new Request(`${SITE}/api/payments/p24/checkout`, {
        method: "POST",
        headers: { cookie: "brd_app=android", origin: SITE, "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
        body: JSON.stringify({ product: { kind: "pack", pack: "take" } }),
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, code: STORE_APP_CHECKOUT_CODE });
    expect(requireUser).not.toHaveBeenCalled();
    expect(registerPayuOrder).not.toHaveBeenCalled();
  });
});
