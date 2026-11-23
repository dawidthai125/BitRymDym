import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { config, middleware } from "@/middleware";
import {
  createRequestGuard,
  GUEST_LIMIT,
  isGuardExempt,
  isOverloadRequest,
  resetRequestGuardForTests,
  SIGNED_IN_LIMIT,
} from "@/lib/security/request-guard";

const headers = (ip: string) => new Headers({ "x-vercel-forwarded-for": ip });
const hit = (ip: string, hasSession = false, pathname = "/beats") => isOverloadRequest({ headers: headers(ip), pathname, hasSession }, {});

beforeEach(() => resetRequestGuardForTests());

describe("overload guard", () => {
  it("refuses only the address that floods, and lets it back after the window", () => {
    const guard = createRequestGuard({ windowMs: 1000 });
    for (let i = 0; i < 5; i += 1) expect(guard.allow("a", 5, 0)).toBe(true);
    expect(guard.allow("a", 5, 10)).toBe(false);
    expect(guard.allow("b", 5, 10)).toBe(true);
    expect(guard.allow("a", 5, 1000)).toBe(true);
  });

  it("guests have a lower limit than signed-in users, counted apart", () => {
    for (let i = 0; i < GUEST_LIMIT; i += 1) expect(hit("1.1.1.1")).toBe(false);
    expect(hit("1.1.1.1")).toBe(true);
    expect(hit("1.1.1.1", true)).toBe(false);
    for (let i = 1; i < SIGNED_IN_LIMIT; i += 1) hit("1.1.1.1", true);
    expect(hit("1.1.1.1", true)).toBe(true);
  });

  it("never refuses payments, cron, health checks, an unknown address, or when turned off", () => {
    for (const path of ["/api/webhooks/payu", "/api/cron/takes-janitor", "/api/health/queues"]) expect(isGuardExempt(path)).toBe(true);
    expect(isGuardExempt("/api/community/rate")).toBe(false);
    for (let i = 0; i < GUEST_LIMIT + 5; i += 1) expect(hit("2.2.2.2", false, "/api/webhooks/payu")).toBe(false);
    for (let i = 0; i < GUEST_LIMIT + 5; i += 1) {
      expect(isOverloadRequest({ headers: new Headers(), pathname: "/", hasSession: false }, {})).toBe(false);
      expect(isOverloadRequest({ headers: headers("3.3.3.3"), pathname: "/", hasSession: false }, { OVERLOAD_GUARD: "0" })).toBe(false);
    }
  });

  it("middleware answers 429 without touching anything else", async () => {
    const request = () => new NextRequest("https://www.bitrymdym.pl/beats", { headers: headers("4.4.4.4") });
    let last = 0;
    for (let i = 0; i <= GUEST_LIMIT; i += 1) last = (await middleware(request())).status;
    expect(last).toBe(429);
    const refused = await middleware(request());
    expect(refused.headers.get("retry-after")).toBe("60");
    expect(refused.headers.get("cache-control")).toBe("no-store");
  });

  it("sitemap and robots skip the middleware so the CDN can cache them", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    expect(matcher.test("/sitemap.xml")).toBe(false);
    expect(matcher.test("/robots.txt")).toBe(false);
    expect(matcher.test("/beats")).toBe(true);
    expect(matcher.test("/rymy/kasa")).toBe(true);
  });
});
