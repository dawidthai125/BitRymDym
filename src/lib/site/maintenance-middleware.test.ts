/**
 * Regression: middleware gating for maintenance mode ("Trwają prace").
 * Supabase is mocked; asserts on the real NextResponse produced by middleware.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser }, rpc }),
}));

import { middleware, resetMaintenanceCacheForTests } from "@/middleware";

const SITE = "https://www.bitrymdym.pl";
const ADMIN = { id: "a-1" };
const USER = { id: "u-1" };

function req(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, SITE), { method: init.method ?? "GET", headers: init.headers });
}

function signedIn(user: { id: string } | null) {
  getUser.mockResolvedValue(
    user
      ? { data: { user }, error: null }
      : { data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } },
  );
}

function maintenance(enabled: boolean, viewerIsAdmin = false) {
  rpc.mockResolvedValue({
    data: { enabled, message: enabled ? "Nowe Studio" : null, until: null, viewerIsAdmin },
    error: null,
  });
}

const rewriteOf = (res: Response) => res.headers.get("x-middleware-rewrite");
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "unit-test-anon");
  getUser.mockReset();
  rpc.mockReset();
  resetMaintenanceCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("middleware — maintenance OFF", () => {
  it("passes through untouched", async () => {
    signedIn(null);
    maintenance(false);
    const res = await middleware(req("/beats"));
    expect(res.status).toBe(200);
    expect(rewriteOf(res)).toBeNull();
    expect(forwarded(res, "x-brd-maintenance")).toBeNull();
  });

  it("strips spoofed maintenance headers from the client", async () => {
    signedIn(null);
    maintenance(false);
    const res = await middleware(
      req("/beats", { headers: { "x-brd-maintenance": "1", "x-brd-maintenance-admin": "1" } }),
    );
    expect(res.headers.get("x-middleware-override-headers")).not.toContain("x-brd-maintenance-admin,");
    expect(forwarded(res, "x-brd-maintenance-admin")).toBeNull();
    expect(forwarded(res, "x-brd-maintenance")).toBeNull();
  });

  it("guest Studio gate still redirects to sign-in", async () => {
    signedIn(null);
    maintenance(false);
    const res = await middleware(req("/studio"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in?next=%2Fstudio");
  });
});

describe("middleware — maintenance ON", () => {
  it("guest page → rewritten to /maintenance (no-store, Retry-After)", async () => {
    signedIn(null);
    maintenance(true);
    const res = await middleware(req("/beats?x=1"));
    expect(res.status).toBe(503);
    expect(new URL(rewriteOf(res)!).pathname).toBe("/maintenance");
    expect(new URL(rewriteOf(res)!).search).toBe("");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(forwarded(res, "x-brd-maintenance")).toBe("1");
    expect(forwarded(res, "x-brd-maintenance-admin")).toBeNull();
  });

  it("guest Studio → maintenance page, not the sign-in redirect", async () => {
    signedIn(null);
    maintenance(true);
    const res = await middleware(req("/studio"));
    expect(new URL(rewriteOf(res)!).pathname).toBe("/maintenance");
  });

  it("sign-up is unavailable (page → maintenance, POST → 503)", async () => {
    signedIn(null);
    maintenance(true);
    expect(new URL(rewriteOf(await middleware(req("/sign-up")))!).pathname).toBe("/maintenance");
    expect((await middleware(req("/sign-up", { method: "POST" }))).status).toBe(503);
  });

  it("guest API → 503 JSON MAINTENANCE", async () => {
    signedIn(null);
    maintenance(true);
    const res = await middleware(req("/api/studio/projects", { method: "POST" }));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(await res.json()).toMatchObject({ code: "MAINTENANCE" });
  });

  it("signed-in non-admin sees the maintenance page and API 503", async () => {
    signedIn(USER);
    maintenance(true, false);
    expect(new URL(rewriteOf(await middleware(req("/account")))!).pathname).toBe("/maintenance");
    expect((await middleware(req("/api/takes/session", { method: "POST" }))).status).toBe(503);
  });

  it("admin browses normally with the banner header", async () => {
    signedIn(ADMIN);
    maintenance(true, true);
    const res = await middleware(req("/beats"));
    expect(rewriteOf(res)).toBeNull();
    expect(res.status).toBe(200);
    expect(forwarded(res, "x-brd-maintenance")).toBe("1");
    expect(forwarded(res, "x-brd-maintenance-admin")).toBe("1");
    const api = await middleware(req("/api/studio/projects", { method: "POST" }));
    expect(api.status).toBe(200);
  });

  it.each([
    ["/sign-in", "GET"],
    ["/sign-in", "POST"],
    ["/admin", "GET"],
    ["/admin/site", "POST"],
    ["/auth/callback", "GET"],
    ["/robots.txt", "GET"],
    ["/api/cron/takes-janitor", "GET"],
    ["/api/mix/worker/claim", "POST"],
    ["/api/webhooks/payments", "POST"],
    ["/api/health", "GET"],
  ])("exempt %s %s keeps working for guests", async (path, method) => {
    signedIn(null);
    maintenance(true);
    const res = await middleware(req(path, { method }));
    expect(res.status).toBe(200);
    expect(rewriteOf(res)).toBeNull();
  });

  it("sign-in page gets the maintenance header (notice, no sign-up link)", async () => {
    signedIn(null);
    maintenance(true);
    const res = await middleware(req("/sign-in"));
    expect(forwarded(res, "x-brd-maintenance")).toBe("1");
  });
});

describe("middleware — cache and fail-open", () => {
  it("reads the flag at most once per TTL for guests", async () => {
    signedIn(null);
    maintenance(true);
    await middleware(req("/"));
    await middleware(req("/beats"));
    await middleware(req("/api/studio/projects"));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("DB unreachable → site stays up and the error is logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    signedIn(null);
    rpc.mockRejectedValue(new Error("fetch failed"));
    const res = await middleware(req("/beats"));
    expect(rewriteOf(res)).toBeNull();
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("failing open"), "fetch failed");
  });

  it("RPC error payload → fail open", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedIn(null);
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const res = await middleware(req("/api/mix/session"));
    expect(res.status).toBe(200);
  });

  it("role check failure for a signed-in user fails open too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedIn(USER);
    rpc
      .mockResolvedValueOnce({ data: { enabled: true }, error: null })
      .mockRejectedValueOnce(new Error("timeout"));
    const res = await middleware(req("/beats"));
    expect(rewriteOf(res)).toBeNull();
  });
});
