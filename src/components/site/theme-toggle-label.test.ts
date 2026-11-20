import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("ThemeToggle Motyw label readability", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/site/theme-toggle.tsx"),
    "utf8",
  );

  it("keeps accessible name and pressed state on the control", () => {
    expect(src).toContain("aria-label={nextHint}");
    expect(src).toContain("aria-pressed={theme === \"dark\"}");
  });

  it("header icon-only mode keeps the theme name for screen readers; visible label elsewhere is readable", () => {
    expect(src).toContain("iconOnly");
    expect(src).toMatch(/iconOnly \? "sr-only" : "font-medium text-\[var\(--brd-ink\)\]"/);
    expect(src).not.toMatch(/text-\[10px\]/);
    const header = readFileSync(
      join(process.cwd(), "src/components/site/site-header.tsx"),
      "utf8",
    );
    expect(header).toContain("<ThemeToggle iconOnly");
  });
});

describe("premium page heading hierarchy", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/premium/page.tsx"),
    "utf8",
  );

  it("exposes a single h1 and section h2s without skipping levels", () => {
    const h1 = [...src.matchAll(/<h1\b/g)];
    const h2 = [...src.matchAll(/<h2\b/g)];
    const h3 = [...src.matchAll(/<h[3-6]\b/g)];
    expect(h1).toHaveLength(1);
    expect(h2.length).toBeGreaterThanOrEqual(4);
    expect(h3).toHaveLength(0);
  });
});
