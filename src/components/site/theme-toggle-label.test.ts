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

  it("Motyw eyebrow uses readable size and ink-soft, not 10px mute", () => {
    const motyw = src.match(
      /className="([^"]*)"[\s\S]*?>\s*Motyw\s*</,
    );
    expect(motyw?.[1]).toMatch(/(?:^|\s)text-xs(?:\s|$)/);
    expect(motyw?.[1]).toContain("text-[var(--brd-ink-soft)]");
    expect(motyw?.[1]).not.toMatch(/text-\[10px\]/);
    expect(motyw?.[1]).not.toContain("text-[var(--brd-mute)]");
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
