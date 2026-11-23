import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { faqPageJsonLd } from "@/lib/seo/json-ld";
import { LANDING_PAGES, landingPath } from "@/lib/seo/landing-pages";

describe("keyword landing pages", () => {
  it("have unique slugs, a route file and search-sized meta", () => {
    const slugs = LANDING_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const page of LANDING_PAGES) {
      expect(page.slug).toMatch(/^[a-z0-9-]+$/);
      expect(existsSync(path.join(process.cwd(), "src/app", page.slug, "page.tsx"))).toBe(true);
      expect(page.metaDescription.length).toBeLessThanOrEqual(165);
      expect(page.metaDescription.length).toBeGreaterThan(80);
      expect(page.metaTitle.length).toBeLessThanOrEqual(70);
      expect(page.faq.length).toBeGreaterThanOrEqual(3);
      expect(page.sections.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("link only to existing landing pages", () => {
    const paths = new Set(LANDING_PAGES.map((p) => landingPath(p.slug)));
    for (const page of LANDING_PAGES) {
      for (const c of page.cta) {
        if (/^\/[a-z0-9-]+$/.test(c.href) && c.href !== "/jak-nagrac") expect(paths.has(c.href) || existsSync(path.join(process.cwd(), "src/app", c.href, "page.tsx"))).toBe(true);
      }
    }
  });

  it("only the exclusive-sale page is web-only (store apps sell nothing)", () => {
    expect(LANDING_PAGES.filter((p) => p.webOnly).map((p) => p.slug)).toEqual(["bity-na-wylacznosc"]);
    for (const page of LANDING_PAGES.filter((p) => !p.webOnly)) {
      expect(JSON.stringify(page)).not.toMatch(/zł|PayU/);
    }
  });

  it("FAQPage JSON-LD mirrors the visible questions", () => {
    const ld = faqPageJsonLd("https://www.bitrymdym.pl", { path: "/x", items: [{ q: "Q?", a: "A." }] });
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld["@id"]).toBe("https://www.bitrymdym.pl/x#faq");
    expect(ld.mainEntity).toEqual([{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } }]);
  });
});
