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

  it("marks Studio for the /studio tree only", () => {
    expect(isSiteNavHrefActive("/studio", "/studio")).toBe(true);
    expect(isSiteNavHrefActive("/studio/p/abc", "/studio")).toBe(true);
    expect(isSiteNavHrefActive("/account", "/studio")).toBe(false);
    expect(isSiteNavHrefActive("/studios", "/studio")).toBe(false);
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

  it("SiteMainNav and MobileBottomNav hand off at lg (no tablet nav gap)", () => {
    const mainNav = readFileSync(
      join(root, "src/components/site/site-main-nav.tsx"),
      "utf8",
    );
    const bottomNav = readFileSync(
      join(root, "src/components/site/mobile-bottom-nav.tsx"),
      "utf8",
    );
    const appShell = readFileSync(
      join(root, "src/components/site/app-shell.tsx"),
      "utf8",
    );
    const miniPlayer = readFileSync(
      join(root, "src/components/player/sticky-mini-player.tsx"),
      "utf8",
    );
    expect(mainNav).toMatch(/\blg:flex\b/);
    expect(bottomNav).toMatch(/\blg:hidden\b/);
    // Desktop: small padding normally, room for the mini player only while it exists.
    expect(appShell).toMatch(/ lg:pb-2 /);
    expect(appShell).toContain(
      "lg:[[data-app-shell]:has([data-sticky-player])_&]:pb-28",
    );
    expect(appShell).toContain("data-app-shell");
    expect(miniPlayer).toContain("data-sticky-player");
    expect(miniPlayer).toMatch(/\blg:bottom-0\b/);
  });

  it("user-menu uses disclosure semantics, not APG menu roles", () => {
    const src = readFileSync(
      join(root, "src/components/site/user-menu.tsx"),
      "utf8",
    );
    expect(src).toContain("aria-expanded={open}");
    expect(src).toContain("aria-controls={open ? panelId : undefined}");
    expect(src).toContain("Menu konta:");
    expect(src).toContain('aria-label="Menu konta"');
    expect(src).toContain("buttonRef.current?.focus()");
    expect(src).toMatch(/if\s*\(\s*!open\s*\)\s*return/);
    expect(src).toMatch(/},\s*\[\s*open\s*\]\s*\)/);
    expect(src).not.toContain('aria-haspopup="menu"');
    expect(src).not.toMatch(/role="menu"/);
    expect(src).not.toMatch(/role="menuitem"/);
  });
});


describe("profile pages in the phone menu", () => {
  const lit = (path: string) => ["/beats", "/studio", "/library", "/profile"].filter((href) => isSiteNavHrefActive(path, href));
  it("lights exactly Library or Profile, never Studio", () => {
    for (const path of ["/account/favorites", "/account/downloads", "/account/purchased", "/account/shared"]) {
      expect(lit(path), path).toEqual(["/library"]);
    }
    for (const path of ["/account", "/account/takes", "/account/catalog", "/account/beats/x/edit", "/account/settings", "/account/profil"]) {
      expect(lit(path), path).toEqual(["/profile"]);
    }
    expect(lit("/studio/p/1")).toEqual(["/studio"]);
  });
});
