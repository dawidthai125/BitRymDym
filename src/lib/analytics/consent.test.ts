import { describe, expect, it } from "vitest";

import { analyticsCookieNames, consentCookie, GA_MEASUREMENT_ID, parseConsent } from "@/lib/analytics/consent";

describe("analytics consent", () => {
  it("reads only valid choices", () => {
    expect(parseConsent("a=1; brd_consent=all; b=2")).toBe("all");
    expect(parseConsent("brd_consent=necessary")).toBe("necessary");
    expect(parseConsent("brd_consent=yes")).toBeNull();
    expect(parseConsent("")).toBeNull();
    expect(parseConsent(null)).toBeNull();
  });
  it("writes a 12-month first-party cookie", () => {
    expect(consentCookie("all", true)).toBe("brd_consent=all; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });
  it("lists GA cookies to expire on withdrawal", () => {
    expect(analyticsCookieNames("_ga=1; x=2; _ga_ABC=3; _gid=4")).toEqual(["_ga", "_ga_ABC", "_gid"]);
  });
  it("has a GA4 measurement id", () => {
    expect(GA_MEASUREMENT_ID).toMatch(/^G-[A-Z0-9]+$/);
  });
});
