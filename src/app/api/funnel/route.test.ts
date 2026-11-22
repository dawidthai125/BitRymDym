import { beforeEach, describe, expect, it, vi } from "vitest";

const recordFunnelEvent = vi.fn(async (_input: unknown) => true);
vi.mock("@/lib/funnel/funnel-events", () => ({ recordFunnelEvent }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => void fn() };
});

import { createFunnelRateLimiter, isLikelyBot, parseFunnelBody } from "@/lib/funnel/funnel-request";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/funnel", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA, "x-real-ip": "203.0.113.9", ...headers },
    body,
  });
}

describe("parseFunnelBody", () => {
  it("accepts buy_click with a known product and optional plan tier", () => {
    expect(parseFunnelBody('{"event":"buy_click","product":"plan","tier":"GOLD"}')).toEqual({
      event: "buy_click",
      product: "plan",
      tier: "GOLD",
    });
    expect(parseFunnelBody('{"event":"buy_click","product":"youtube"}')).toEqual({
      event: "buy_click",
      product: "youtube",
      tier: null,
    });
  });

  it("rejects anything else", () => {
    for (const raw of [
      "",
      "not json",
      "[]",
      "null",
      '{"event":"premium_view"}',
      '{"event":"paid","product":"plan"}',
      '{"event":"buy_click"}',
      '{"event":"buy_click","product":"vip"}',
      '{"event":"buy_click","product":"take","tier":"GOLD"}',
      '{"event":"buy_click","product":"plan","tier":"FREE"}',
      '{"event":"buy_click","product":"plan","userId":"u1"}',
      JSON.stringify({ event: "buy_click", product: "plan", tier: "GOLD", x: "y".repeat(300) }),
    ]) {
      expect(parseFunnelBody(raw), raw.slice(0, 60)).toBeNull();
    }
  });
});

describe("isLikelyBot", () => {
  it("flags empty and automated user agents", () => {
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("")).toBe(true);
    expect(isLikelyBot("Googlebot/2.1")).toBe(true);
    expect(isLikelyBot("curl/8.0")).toBe(true);
    expect(isLikelyBot("BitRymDym-smoke/1")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 HeadlessChrome/130")).toBe(true);
    expect(isLikelyBot(UA)).toBe(false);
  });
});

describe("createFunnelRateLimiter", () => {
  it("limits per key within the window and resets after it", () => {
    const allow = createFunnelRateLimiter(2, 1000);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 10)).toBe(true);
    expect(allow("a", 20)).toBe(false);
    expect(allow("b", 20)).toBe(true);
    expect(allow("a", 1000)).toBe(true);
  });
});

describe("POST /api/funnel", () => {
  beforeEach(() => {
    recordFunnelEvent.mockClear();
    vi.resetModules();
  });

  it("records a valid click without any user data", async () => {
    const { POST } = await import("@/app/api/funnel/route");
    const res = await POST(post('{"event":"buy_click","product":"pack"}'));
    expect(res.status).toBe(204);
    expect(recordFunnelEvent).toHaveBeenCalledWith({ event: "buy_click", product: "pack", tier: null });
  });

  it("rejects invalid bodies with 400 and oversized ones with 413", async () => {
    const { POST } = await import("@/app/api/funnel/route");
    expect((await POST(post('{"event":"paid","product":"plan"}'))).status).toBe(400);
    expect((await POST(post("x".repeat(300)))).status).toBe(413);
    expect(recordFunnelEvent).not.toHaveBeenCalled();
  });

  it("ignores bots silently", async () => {
    const { POST } = await import("@/app/api/funnel/route");
    const res = await POST(post('{"event":"buy_click","product":"addon"}', { "user-agent": "Googlebot" }));
    expect(res.status).toBe(204);
    expect(recordFunnelEvent).not.toHaveBeenCalled();
  });

  it("rate limits one IP", async () => {
    const { POST } = await import("@/app/api/funnel/route");
    const statuses: number[] = [];
    for (let i = 0; i < 22; i += 1) {
      statuses.push((await POST(post('{"event":"buy_click","product":"plan","tier":"SILVER"}'))).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 204)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);
    expect(recordFunnelEvent).toHaveBeenCalledTimes(20);
  });
});
