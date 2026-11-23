import { describe, expect, it } from "vitest";

import robots, { AI_CRAWLERS, SEO_CRAWLERS } from "@/app/robots";

describe("robots.txt", () => {
  const rules = robots().rules as Array<{ userAgent: string | string[]; disallow: string[] }>;

  it("keeps search engines in and private areas out", () => {
    const all = rules.find((r) => r.userAgent === "*")!;
    expect(all.disallow).toContain("/admin");
    expect(all.disallow).not.toContain("/");
    const named = [...AI_CRAWLERS, ...SEO_CRAWLERS].join(" ").toLowerCase();
    for (const bot of ["googlebot", "bingbot", "duckduckbot", "facebookexternalhit", "twitterbot"]) expect(named).not.toContain(bot);
  });

  it("every named group still hides private areas", () => {
    for (const rule of rules) {
      expect(rule.disallow.includes("/") || ["/admin", "/account", "/studio", "/api/"].every((p) => rule.disallow.includes(p))).toBe(true);
    }
  });
});
