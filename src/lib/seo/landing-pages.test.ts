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

describe("paged catalogues", () => {
  it("keep ?strona=N in canonical and hreflang from page 2", async () => {
    const { localeAlternates, withCatalogPage } = await import("@/lib/seo/locale-paths");
    expect(withCatalogPage(localeAlternates("pl", "/beats"), 1)).toEqual(localeAlternates("pl", "/beats"));
    expect(withCatalogPage(localeAlternates("en", "/beats"), 2)).toEqual({
      canonical: "/en/beats?strona=2",
      languages: { pl: "/beats?strona=2", en: "/en/beats?strona=2", "x-default": "/beats?strona=2" },
    });
  });
});

describe("free tools", () => {
  it("have unique slugs, search-sized meta and a FAQ", async () => {
    const { TOOL_PAGES } = await import("@/lib/seo/tool-pages");
    expect(new Set(TOOL_PAGES.map((t) => t.slug)).size).toBe(TOOL_PAGES.length);
    for (const t of TOOL_PAGES) {
      expect(t.metaTitle.length).toBeLessThanOrEqual(70);
      expect(t.metaDescription.length).toBeLessThanOrEqual(170);
      expect(t.faq.length).toBeGreaterThanOrEqual(3);
    }
  });
  it("content pages link only to existing tools and guides", async () => {
    const { TOOL_PAGES, toolPath } = await import("@/lib/seo/tool-pages");
    const { GUIDES, guidePath } = await import("@/lib/seo/guides");
    const known = new Set([...TOOL_PAGES.map((t) => toolPath(t.slug)), ...GUIDES.map((g) => guidePath(g.slug)), ...LANDING_PAGES.map((p) => landingPath(p.slug))]);
    for (const p of [...LANDING_PAGES, ...GUIDES]) {
      for (const c of p.cta) if (/^\/(narzedzia|poradniki)\//.test(c.href)) expect(known.has(c.href), c.href).toBe(true);
    }
  });
});

describe("English domains", () => {
  it("send bitrymdym.com and .eu to /en on the main domain", async () => {
    const { englishHostRedirect } = await import("@/lib/seo/locale-paths");
    const o = "https://www.bitrymdym.pl";
    expect(englishHostRedirect("bitrymdym.com", "/", "", o)).toBe(`${o}/en`);
    expect(englishHostRedirect("www.bitrymdym.com", "/beats", "?q=x", o)).toBe(`${o}/en/beats?q=x`);
    expect(englishHostRedirect("bitrymdym.eu", "/poradniki", "", o)).toBe(`${o}/poradniki`);
    expect(englishHostRedirect("www.bitrymdym.pl", "/", "", o)).toBeNull();
    expect(englishHostRedirect(null, "/", "", o)).toBeNull();
  });
});

describe("app and video JSON-LD", () => {
  it("describe the free Windows recorder and the promo film", async () => {
    const { recorderAppJsonLd, promoVideoJsonLd } = await import("@/lib/seo/json-ld");
    const o = "https://www.bitrymdym.pl";
    const app = recorderAppJsonLd(o, { name: "N", description: "D" });
    expect(app["@type"]).toBe("SoftwareApplication");
    expect(app.operatingSystem).toBe("Windows 10, Windows 11");
    expect(app.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "PLN" });
    const v = promoVideoJsonLd(o, { name: "F", description: "D", uploadDate: "2026-11-19" });
    expect(v.contentUrl).toBe(`${o}/promo/jak-to-dziala.mp4`);
    expect(v.thumbnailUrl).toEqual([`${o}/promo/jak-to-dziala-poster.jpg`]);
  });
});

describe("English keyword landings", () => {
  it("have a route, a Polish twin, search-sized meta and no prices", async () => {
    const { EN_LANDING_PAGES, isEnglishLandingPath, englishTwinOf } = await import("@/lib/seo/landing-pages-en");
    const { stripEnglishPrefix } = await import("@/lib/seo/locale-paths");
    for (const p of EN_LANDING_PAGES) {
      expect(existsSync(path.join(process.cwd(), "src/app/en", p.slug, "page.tsx"))).toBe(true);
      expect(LANDING_PAGES.some((pl) => pl.slug === p.plSlug)).toBe(true);
      expect(englishTwinOf(p.plSlug)?.slug).toBe(p.slug);
      expect(p.metaDescription.length).toBeLessThanOrEqual(170);
      expect(p.metaTitle.length).toBeLessThanOrEqual(70);
      expect(JSON.stringify(p)).not.toMatch(/\d\s?zł|PayU|PLN/);
      expect(isEnglishLandingPath(`/en/${p.slug}`)).toBe(true);
      // Not mistaken for an /en twin of a Polish route.
      expect(stripEnglishPrefix(`/en/${p.slug}`)).toBeNull();
    }
    expect(isEnglishLandingPath("/en/beats")).toBe(false);
  });
});
