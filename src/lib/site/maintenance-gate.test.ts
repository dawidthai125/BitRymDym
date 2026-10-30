import { describe, expect, it, vi } from "vitest";

import {
  classifyMaintenancePath,
  createMaintenanceStateCache,
  decideMaintenance,
  MAINTENANCE_OFF,
  parseMaintenanceRpc,
} from "@/lib/site/maintenance-gate";
import { isoToWarsawLocalInput, warsawLocalInputToIso } from "@/lib/site/warsaw-datetime";

const ON = { enabled: true, message: null, until: null };

describe("classifyMaintenancePath", () => {
  it.each([
    ["/admin", "exempt"],
    ["/admin/site", "exempt"],
    ["/admin/users", "exempt"],
    ["/sign-in", "exempt"],
    ["/forgot-password", "exempt"],
    ["/auth/callback", "exempt"],
    ["/auth/reset-password", "exempt"],
    ["/maintenance", "exempt"],
    ["/robots.txt", "exempt"],
    ["/favicon.ico", "exempt"],
    ["/_next/static/chunks/a.js", "exempt"],
    ["/bitek/bitek-hero.webp", "exempt"],
    ["/brand/bitrymdym-logo.png", "exempt"],
    ["/api/health", "exempt"],
    ["/api/admin/beats/audio/session", "exempt"],
    ["/api/cron/takes-janitor", "exempt"],
    ["/api/mix/worker/claim", "exempt"],
    ["/api/webhooks/payments", "exempt"],
    ["/", "page"],
    ["/beats", "page"],
    ["/studio/abc", "page"],
    ["/sign-up", "page"],
    ["/account", "page"],
    ["/sitemap.xml", "exempt"],
    ["/listen/tok", "page"],
    ["/administrator", "page"],
    ["/api/studio/projects", "api"],
    ["/api/takes/anon/session", "api"],
    ["/api/listen/x/audio", "api"],
    ["/api/mix/session", "api"],
    ["/api/studio/tune-worklet.js", "api"],
  ] as const)("%s → %s", (path, kind) => {
    expect(classifyMaintenancePath(path)).toBe(kind);
  });
});

describe("decideMaintenance", () => {
  const d = (over: Partial<Parameters<typeof decideMaintenance>[0]>) =>
    decideMaintenance({ state: ON, pathname: "/", method: "GET", isAdmin: false, ...over }).kind;

  it("site up → always pass", () => {
    expect(d({ state: MAINTENANCE_OFF })).toBe("pass");
    expect(d({ state: MAINTENANCE_OFF, pathname: "/api/studio/projects" })).toBe("pass");
  });
  it("admins pass everywhere", () => {
    expect(d({ isAdmin: true })).toBe("pass");
    expect(d({ isAdmin: true, pathname: "/api/studio/projects", method: "POST" })).toBe("pass");
  });
  it("guests / non-admins: pages → maintenance page, APIs → 503", () => {
    expect(d({})).toBe("page");
    expect(d({ method: "HEAD", pathname: "/beats" })).toBe("page");
    expect(d({ pathname: "/api/studio/projects" })).toBe("unavailable");
    expect(d({ pathname: "/sign-up", method: "POST" })).toBe("unavailable");
  });
  it("exempt paths keep working for everyone", () => {
    expect(d({ pathname: "/sign-in", method: "POST" })).toBe("pass");
    expect(d({ pathname: "/api/mix/worker/claim", method: "POST" })).toBe("pass");
    expect(d({ pathname: "/api/cron/takes-janitor" })).toBe("pass");
  });
});

describe("parseMaintenanceRpc", () => {
  it("normalises and defaults to site up", () => {
    expect(parseMaintenanceRpc(null)).toEqual({ ...MAINTENANCE_OFF, viewerIsAdmin: false });
    expect(parseMaintenanceRpc({ enabled: "true" }).enabled).toBe(false);
    expect(
      parseMaintenanceRpc({ enabled: true, message: "  hej ", until: "2026-10-30T17:00:00+00:00", viewerIsAdmin: true }),
    ).toEqual({ enabled: true, message: "hej", until: "2026-10-30T17:00:00+00:00", viewerIsAdmin: true });
    expect(parseMaintenanceRpc({ enabled: true, message: " ", until: "nope" })).toMatchObject({
      message: null,
      until: null,
    });
  });
});

describe("createMaintenanceStateCache", () => {
  it("caches within TTL and refreshes after it", async () => {
    let now = 1000;
    const cache = createMaintenanceStateCache({ ttlMs: 5000, now: () => now });
    const fetchState = vi.fn().mockResolvedValue(ON);
    expect(await cache.get(fetchState)).toEqual(ON);
    now += 4999;
    await cache.get(fetchState);
    expect(fetchState).toHaveBeenCalledTimes(1);
    now += 2;
    await cache.get(fetchState);
    expect(fetchState).toHaveBeenCalledTimes(2);
  });

  it("fails OPEN (site up) and reports the error, caching the failure", async () => {
    const onError = vi.fn();
    const cache = createMaintenanceStateCache({ onError, now: () => 0 });
    const fetchState = vi.fn().mockRejectedValue(new Error("db down"));
    expect(await cache.get(fetchState)).toEqual(MAINTENANCE_OFF);
    expect(await cache.get(fetchState)).toEqual(MAINTENANCE_OFF);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fetchState).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent fetches", async () => {
    const cache = createMaintenanceStateCache({});
    const fetchState = vi.fn(() => new Promise<typeof ON>((r) => setTimeout(() => r(ON), 5)));
    await Promise.all([cache.get(fetchState), cache.get(fetchState), cache.get(fetchState)]);
    expect(fetchState).toHaveBeenCalledTimes(1);
  });
});

describe("Warsaw datetime-local helpers", () => {
  it("round-trips in winter (UTC+1) and summer (UTC+2)", () => {
    expect(warsawLocalInputToIso("2026-11-02T18:30")).toBe("2026-11-02T17:30:00.000Z");
    expect(warsawLocalInputToIso("2026-07-01T09:00")).toBe("2026-07-01T07:00:00.000Z");
    expect(isoToWarsawLocalInput("2026-11-02T17:30:00.000Z")).toBe("2026-11-02T18:30");
    expect(isoToWarsawLocalInput("2026-07-01T07:00:00Z")).toBe("2026-07-01T09:00");
  });
  it("empty / invalid → null / empty", () => {
    expect(warsawLocalInputToIso("")).toBeNull();
    expect(warsawLocalInputToIso("jutro")).toBeNull();
    expect(isoToWarsawLocalInput(null)).toBe("");
    expect(isoToWarsawLocalInput("x")).toBe("");
  });
});
