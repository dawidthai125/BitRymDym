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
      expect(JSON.stringify(page)).not.toMatch(/\d\s?zł|PayU/);
    }
  });

  it("FAQPage JSON-LD mirrors the visible questions", () => {
    const ld = faqPageJsonLd("https://www.bitrymdym.pl", { path: "/x", items: [{ q: "Q?", a: "A." }] });
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld["@id"]).toBe("https://www.bitrymdym.pl/x#faq");
    expect(ld.mainEntity).toEqual([{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } }]);
  });
});

describe("poradniki", () => {
  it("have unique slugs distinct from landing pages and search-sized meta", async () => {
    const { GUIDES } = await import("@/lib/seo/guides");
    const all = [...GUIDES.map((g) => g.slug), ...LANDING_PAGES.map((p) => p.slug)];
    expect(new Set(all).size).toBe(all.length);
    for (const g of GUIDES) {
      expect(g.slug).toMatch(/^[a-z0-9-]+$/);
      expect(g.metaDescription.length).toBeLessThanOrEqual(165);
      expect(g.metaTitle.length).toBeLessThanOrEqual(70);
      expect(g.faq.length).toBeGreaterThanOrEqual(3);
      expect(g.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(JSON.stringify(g)).not.toMatch(/\d\s?zł|PayU/);
    }
  });
});

describe("English URLs", () => {
  it("map /en paths only for localized pages", async () => {
    const m = await import("@/lib/seo/locale-paths");
    expect(m.stripEnglishPrefix("/en")).toBe("/");
    expect(m.stripEnglishPrefix("/en/beats")).toBe("/beats");
    expect(m.stripEnglishPrefix("/en/beat/abc")).toBe("/beat/abc");
    expect(m.stripEnglishPrefix("/en/beats/gatunek/trap")).toBe("/beats/gatunek/trap");
    expect(m.stripEnglishPrefix("/en/studio")).toBeNull();
    expect(m.stripEnglishPrefix("/en/darmowe-bity-do-rapu")).toBeNull();
    expect(m.stripEnglishPrefix("/english")).toBeNull();
    expect(m.stripEnglishPrefix("/beats")).toBeNull();
    expect(m.localizedPath("en", "/")).toBe("/en");
    expect(m.localizedPath("en", "/poradniki")).toBe("/poradniki");
    expect(m.localeAlternates("en", "/beats")).toEqual({
      canonical: "/en/beats",
      languages: { pl: "/beats", en: "/en/beats", "x-default": "/beats" },
    });
    expect(m.localeAlternates("pl", "/darmowe-bity-do-rapu")).toEqual({ canonical: "/darmowe-bity-do-rapu" });
  });
});
