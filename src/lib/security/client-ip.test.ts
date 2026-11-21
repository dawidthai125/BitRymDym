import { describe, expect, it } from "vitest";

import { clientIpFromHeaders, clientIpOrNull, isPlausibleIp } from "@/lib/security/client-ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("client ip (canonical)", () => {
  it("prefers x-vercel-forwarded-for over a client-supplied x-forwarded-for", () => {
    expect(clientIpOrNull(h({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "10.0.0.1", "x-vercel-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("then x-real-ip, then the first x-forwarded-for hop", () => {
    expect(clientIpOrNull(h({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "10.0.0.1" }))).toBe("10.0.0.1");
    expect(clientIpOrNull(h({ "x-forwarded-for": " 6.6.6.6 , 1.1.1.1" }))).toBe("6.6.6.6");
    expect(clientIpOrNull(h({ "x-vercel-forwarded-for": "2001:db8::1, 10.0.0.1" }))).toBe("2001:db8::1");
  });
  it("does not fall through to x-forwarded-for when a platform header is garbage", () => {
    expect(clientIpOrNull(h({ "x-vercel-forwarded-for": "evil<script>", "x-forwarded-for": "6.6.6.6" }))).toBeNull();
  });
  it("returns null / unknown when nothing usable is present", () => {
    expect(clientIpOrNull(h({}))).toBeNull();
    expect(clientIpFromHeaders(h({}))).toBe("unknown");
    expect(clientIpFromHeaders(h({ "x-real-ip": "1".repeat(65) }))).toBe("unknown");
  });
  it("accepts only IP-shaped literals", () => {
    expect(isPlausibleIp("91.102.183.87")).toBe(true);
    expect(isPlausibleIp("::1")).toBe(true);
    expect(isPlausibleIp("example.com")).toBe(false);
    expect(isPlausibleIp("")).toBe(false);
  });
});
