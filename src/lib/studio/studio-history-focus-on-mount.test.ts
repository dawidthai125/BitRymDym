import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Audit 2026-11-21: focusing the "Historia miksu" trigger on mount scrolled the transport bar
// to its end and hid Play/Stop/Record. Focus may be restored only after the dialog was open.
describe("mix history focus restore", () => {
  const src = readFileSync("src/components/studio/studio-mix-revision-history-control.tsx", "utf8");
  it("guards focus restore with wasOpenRef", () => {
    expect(src).toMatch(/const wasOpenRef = useRef\(false\)/);
    expect(src).toMatch(/if \(!wasOpenRef\.current\) return;/);
  });
  it("full-view toggle keeps one label and shows state via aria-pressed", () => {
    const nav = readFileSync("src/components/studio/studio-step-nav.tsx", "utf8");
    expect(nav).not.toMatch(/recordFullView \? tMix\("prostyWidok"\)/);
    expect(nav).toMatch(/aria-pressed=\{recordFullView\}/);
  });
});
