import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAIN_CONTENT_ID,
  MAIN_CONTENT_LANDMARK_CLASS,
} from "@/components/site/skip-to-main";

describe("skip-to-main (WCAG 2.4.1)", () => {
  const root = process.cwd();

  it("exposes a single stable main content id and landmark class", () => {
    expect(MAIN_CONTENT_ID).toBe("main-content");
    expect(MAIN_CONTENT_LANDMARK_CLASS).toContain("scroll-mt-[calc(4.5rem+env(safe-area-inset-top))]");
    expect(MAIN_CONTENT_LANDMARK_CLASS).toContain("outline-none");
  });

  it("SkipToMainContent is Polish, focus-visible, and targets MAIN_CONTENT_ID", () => {
    const src = readFileSync(
      join(root, "src/components/site/skip-to-main.tsx"),
      "utf8",
    );
    expect(src).toContain("Przejdź do treści");
    expect(src).toContain("sr-only");
    expect(src).toContain("focus:not-sr-only");
    expect(src).toContain("focus:ring-2");
    expect(src).toContain("focus:ring-[var(--brd-focus)]");
    expect(src).toContain("`#${MAIN_CONTENT_ID}`");
  });

  it("SiteHeader renders SkipToMainContent before sticky header", () => {
    const src = readFileSync(
      join(root, "src/components/site/site-header.tsx"),
      "utf8",
    );
    const skipIdx = src.indexOf("<SkipToMainContent");
    const headerIdx = src.indexOf("<header");
    expect(skipIdx).toBeGreaterThan(-1);
    expect(headerIdx).toBeGreaterThan(skipIdx);
  });

  it("every SiteHeader surface wires MAIN_CONTENT_ID exactly once per render branch", () => {
    const files = [
      "src/components/site/app-shell.tsx",
      "src/app/admin/layout.tsx",
      "src/app/beat/[id]/not-found.tsx",
      "src/app/account/downloads/page.tsx",
      "src/app/account/shared/page.tsx",
      "src/app/beats/upload/page.tsx",
    ] as const;

    for (const rel of files) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).toContain("MAIN_CONTENT_ID");
      expect(src, rel).toContain("MAIN_CONTENT_LANDMARK_CLASS");
      expect(src, rel).toContain("tabIndex={-1}");
      // AppShell + admin authorized wrap children that already own <main>;
      // those two targets stay <div>. Other SiteHeader-only surfaces use <main>.
      expect(src, rel).toMatch(
        /<(?:main|div)\b[\s\S]*?\bid=\{MAIN_CONTENT_ID\}/,
      );
    }

    const appShell = readFileSync(
      join(root, "src/components/site/app-shell.tsx"),
      "utf8",
    );
    expect(appShell).toMatch(/<div\b[\s\S]*?\bid=\{MAIN_CONTENT_ID\}/);
    expect(appShell).not.toMatch(/<main\b[\s\S]*?\bid=\{MAIN_CONTENT_ID\}/);


    const admin = readFileSync(join(root, "src/app/admin/layout.tsx"), "utf8");
    // Deny branch + authorized branch — two targets, mutually exclusive at runtime.
    expect([...admin.matchAll(/\bid=\{MAIN_CONTENT_ID\}/g)]).toHaveLength(2);
  });
});
