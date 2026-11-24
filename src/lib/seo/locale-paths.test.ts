import { describe, expect, it } from "vitest";

import { EN_LANDING_PAGES, englishLandingPath } from "@/lib/seo/landing-pages-en";
import { landingPath } from "@/lib/seo/landing-pages";
import { polishPathOf } from "@/lib/seo/locale-paths";

describe("polishPathOf (language switch on /en)", () => {
  it("opens the Polish address of a localized page", () => {
    expect(polishPathOf("/en")).toBe("/");
    expect(polishPathOf("/en/beats")).toBe("/beats");
    expect(polishPathOf("/en/beat/abc")).toBe("/beat/abc");
  });
  it("knows the twin of every English landing", () => {
    for (const p of EN_LANDING_PAGES) expect(polishPathOf(englishLandingPath(p.slug))).toBe(landingPath(p.plSlug));
  });
  it("leaves other addresses to the cookie switch", () => {
    for (const path of ["/", "/beats", "/english", "/en/studio"]) expect(polishPathOf(path)).toBeNull();
  });
});
