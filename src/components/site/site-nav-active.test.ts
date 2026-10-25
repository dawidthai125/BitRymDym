import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isSiteNavHrefActive } from "@/components/site/site-nav-active";

describe("isSiteNavHrefActive", () => {
  it("marks exact and nested paths for catalog/about/premium", () => {
    expect(isSiteNavHrefActive("/beats", "/beats")).toBe(true);
    expect(isSiteNavHrefActive("/beats/upload", "/beats")).toBe(true);
    expect(isSiteNavHrefActive("/about", "/about")).toBe(true);
    expect(isSiteNavHrefActive("/premium", "/premium")).toBe(true);
    expect(isSiteNavHrefActive("/beats", "/about")).toBe(false);
  });

  it("marks Studio for /studio tree only by default", () => {
    expect(isSiteNavHrefActive("/studio", "/studio")).toBe(true);
    expect(isSiteNavHrefActive("/studio/p/abc", "/studio")).toBe(true);
    expect(isSiteNavHrefActive("/account", "/studio")).toBe(false);
    expect(isSiteNavHrefActive("/studios", "/studio")).toBe(false);
  });

  it("optionally includes /account under Studio (mobile tab)", () => {
    expect(
      isSiteNavHrefActive("/account/takes", "/studio", {
        studioIncludesAccount: true,
      }),
    ).toBe(true);
  });

  it("marks library and profile prefixes", () => {
    expect(isSiteNavHrefActive("/library/favorites", "/library")).toBe(true);
    expect(isSiteNavHrefActive("/profile/settings", "/profile")).toBe(true);
  });
});

describe("desktop SiteMainNav aria-current contract", () => {
  const root = process.cwd();

  it("site-header delegates primary nav to SiteMainNav", () => {
    const src = readFileSync(
      join(root, "src/components/site/site-header.tsx"),
      "utf8",
    );
    expect(src).toContain("SiteMainNav");
    expect(src).not.toMatch(/aria-label="Główne menu"/);
  });

  it("SiteMainNav sets aria-current=page from shared active helper", () => {
    const src = readFileSync(
      join(root, "src/components/site/site-main-nav.tsx"),
      "utf8",
    );
    expect(src).toContain('aria-current={active ? "page" : undefined}');
    expect(src).toContain("isSiteNavHrefActive");
    expect(src).toContain('href: "/premium"');
  });

  it("mobile bottom nav reuses the same active helper", () => {
    const src = readFileSync(
      join(root, "src/components/site/mobile-bottom-nav.tsx"),
      "utf8",
    );
    expect(src).toContain("isSiteNavHrefActive");
    expect(src).toContain('aria-current={active ? "page" : undefined}');
  });

  it("user-menu trigger has aria-label when visible name is hidden on mobile", () => {
    const src = readFileSync(
      join(root, "src/components/site/user-menu.tsx"),
      "utf8",
    );
    expect(src).toContain("aria-label={displayName}");
    expect(src).toContain('aria-haspopup="menu"');
  });
});

