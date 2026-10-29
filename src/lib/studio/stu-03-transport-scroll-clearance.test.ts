/**
 * STU-03 — focus / scrollIntoView must not land content under the sticky transport.
 * Source contracts only; real scroll positions are verified in a browser.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const editor = read("src/components/studio/studio-editor.tsx");
const globalsCss = read("src/app/globals.css");

const transportBar = (() => {
  const start = editor.indexOf("function StudioTransportBar(");
  if (start < 0) throw new Error("StudioTransportBar not found");
  const end = editor.indexOf("\nfunction ", start + 1);
  return editor.slice(start, end < 0 ? undefined : end);
})();

const clearanceVar = (() => {
  const m = /const STUDIO_TRANSPORT_CLEARANCE_VAR = "(--[a-z-]+)";/.exec(editor);
  if (!m) throw new Error("STUDIO_TRANSPORT_CLEARANCE_VAR not found");
  return m[1]!;
})();

const effectBody = (() => {
  const m = /const transportRef = useRef<HTMLDivElement>\(null\);\s*useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[\]\);/.exec(
    transportBar,
  );
  if (!m) throw new Error("transport clearance effect not found");
  return m[1]!;
})();

const transportClass = (() => {
  const m = /ref=\{transportRef\}\s*className="([^"]+)"/.exec(transportBar);
  if (!m) throw new Error("transport className not found");
  return m[1]!;
})();

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("STU-03 — scroll clearance source of truth", () => {
  it("clearance is measured from the sticky element itself (sticky top + rendered height)", () => {
    expect(effectBody).toMatch(/getComputedStyle\(transport\)\.top/);
    expect(effectBody).toMatch(/Math\.ceil\(stickyTop \+ transport\.offsetHeight\)/);
  });

  it("re-measures on transport size changes and viewport resizes", () => {
    expect(effectBody).toMatch(/new ResizeObserver\(sync\)/);
    expect(effectBody).toMatch(/observer\.observe\(transport\)/);
    expect(effectBody).toMatch(/window\.addEventListener\("resize", sync\)/);
  });

  it("document scroll-padding reads the same variable the effect writes", () => {
    expect(effectBody).toMatch(
      /root\.style\.setProperty\(\s*STUDIO_TRANSPORT_CLEARANCE_VAR,/,
    );
    expect(effectBody).toMatch(
      /root\.style\.scrollPaddingTop = `var\(\$\{STUDIO_TRANSPORT_CLEARANCE_VAR\}\)`/,
    );
    expect(effectBody).toMatch(/const root = document\.documentElement;/);
  });

  it("cleanup restores the document exactly (scoped to Studio lifetime)", () => {
    const cleanup = /return \(\) => \{([\s\S]*?)\};/.exec(effectBody)?.[1] ?? "";
    expect(cleanup).toMatch(/observer\.disconnect\(\)/);
    expect(cleanup).toMatch(/window\.removeEventListener\("resize", sync\)/);
    expect(cleanup).toMatch(/root\.style\.removeProperty\(STUDIO_TRANSPORT_CLEARANCE_VAR\)/);
    expect(cleanup).toMatch(/root\.style\.scrollPaddingTop = previousPadding/);
    expect(effectBody).toMatch(/const previousPadding = root\.style\.scrollPaddingTop;/);
  });

  it("no global stylesheet scroll-padding (app-wide scrolling unchanged)", () => {
    expect(globalsCss).not.toMatch(/scroll-padding/);
    expect(globalsCss).not.toMatch(new RegExp(esc(clearanceVar)));
  });
});

describe("STU-03 — transport opts out of its own clearance", () => {
  const negMargin = `scroll-mt-[calc(-1*var(${clearanceVar},0px))]`;

  it("transport and all descendants carry the negative scroll-margin of the same variable", () => {
    const tokens = transportClass.split(/\s+/);
    expect(tokens).toContain(negMargin);
    expect(tokens).toContain(`[&_*]:${negMargin}`);
  });

  it("STU-02 sticky contract is unchanged", () => {
    const tokens = transportClass.split(/\s+/);
    expect(tokens).toContain("sticky");
    expect(tokens).toContain("top-[calc(4.25rem+env(safe-area-inset-top))]");
    expect(tokens).toContain("sm:top-[calc(5.25rem+env(safe-area-inset-top))]");
    expect(tokens).toContain("z-20");
  });

  it("noBeat transport state is unchanged", () => {
    expect(transportBar).toMatch(/const beatControlsDisabled = noBeat \|\| busy;/);
    expect(transportBar).toMatch(
      /data-studio-transport-empty=\{noBeat \? "true" : "false"\}/,
    );
  });
});
