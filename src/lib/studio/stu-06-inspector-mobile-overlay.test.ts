/**
 * STU-06 — Inspector mobile sheet layering (Visual Parity V2 §12 SM).
 * Source contracts only; real stacking / hit-testing is verified in a browser.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const editor = read("src/components/studio/studio-editor.tsx");
const inspectorShell = read("src/components/studio/studio-inspector-shell.tsx");
const mixerShell = read("src/components/studio/studio-mixer-shell.tsx");
const bottomNav = read("src/components/site/mobile-bottom-nav.tsx");
const appShell = read("src/components/site/app-shell.tsx");
const fxEditor = read("src/components/studio/studio-fx-chain-editor.tsx");

/** First static class string of the JSX element whose opening tag matches `anchor`. */
function classesOf(source: string, anchor: RegExp): string {
  const match = anchor.exec(source);
  if (!match) throw new Error(`anchor not found: ${anchor}`);
  const tagStart = source.lastIndexOf("<", match.index);
  const cls = /className=(?:\{cn\(\s*)?"([^"]+)"/.exec(source.slice(tagStart));
  if (!cls) throw new Error(`className not found for ${anchor}`);
  return cls[1]!;
}

function zIndexOf(cls: string): number {
  const m = /(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/.exec(cls);
  if (!m) throw new Error(`no z-index in: ${cls}`);
  return Number(m[1] ?? m[2]);
}

const has = (cls: string, token: string) =>
  new RegExp(`(?:^|\\s)${token.replace(/[[\]()]/g, "\\$&")}(?:\\s|$)`).test(cls);

const overlay = classesOf(
  inspectorShell,
  /data-testid="studio-inspector-overlay"/,
);
const sheet = classesOf(inspectorShell, /data-testid="studio-inspector-mobile"/);
const scroller = classesOf(inspectorShell, /\{children\}/);
const nav = classesOf(bottomNav, /aria-label="Nawigacja mobilna"/);
const mixerOverlay = classesOf(mixerShell, /data-testid="studio-mixer-overlay"/);
const fxOverlay = classesOf(fxEditor, /className="fixed inset-0 z-50/);

describe("STU-06-A — Inspector overlay layering", () => {
  it("MobileBottomNav is fixed, mobile-only and rendered after page content", () => {
    expect(has(nav, "fixed")).toBe(true);
    expect(has(nav, "lg:hidden")).toBe(true);
    expect(appShell.indexOf("<MobileBottomNav")).toBeGreaterThan(
      appShell.indexOf("{children}"),
    );
  });

  it("overlay is fixed full-screen and only below xl", () => {
    expect(has(overlay, "fixed")).toBe(true);
    expect(has(overlay, "inset-0")).toBe(true);
    expect(has(overlay, "xl:hidden")).toBe(true);
  });

  it("overlay stacks strictly above MobileBottomNav (later DOM wins on ties)", () => {
    expect(zIndexOf(overlay)).toBeGreaterThan(zIndexOf(nav));
  });

  it("overlay stays below StudioFxSheet so FX opens on top of the Inspector", () => {
    expect(zIndexOf(overlay)).toBeLessThan(zIndexOf(fxOverlay));
  });

  it("overlay shares the Mixer layer (surfaces are XOR, never stacked)", () => {
    expect(zIndexOf(overlay)).toBe(zIndexOf(mixerOverlay));
    expect(editor).toMatch(
      /function openInspectorOverlay\(\) \{\s*setMixerOpen\(false\);\s*setInspectorOverlayOpen\(true\);/,
    );
    // STU-10 — Mixer closes the Inspector through the shared close gate.
    expect(editor).toMatch(
      /function openMixerSurface\(\) \{\s*if \(!closeInspectorOverlay\(\)\) return;\s*setMixerOpen\(true\);/,
    );
  });
});

describe("STU-06-B — bottom controls reachability", () => {
  it("mobile sheet is bottom-anchored, height-capped and pads the bottom safe area", () => {
    expect(has(sheet, "max-md:mt-auto")).toBe(true);
    expect(has(sheet, "max-md:max-h-[70vh]")).toBe(true);
    expect(has(sheet, "max-md:pb-[env(safe-area-inset-bottom)]")).toBe(true);
  });

  it("sheet body scrolls inside the sheet so the last control can be reached", () => {
    expect(has(scroller, "overflow-y-auto")).toBe(true);
    expect(has(scroller, "min-h-0")).toBe(true);
    expect(has(scroller, "flex-1")).toBe(true);
  });

  it("recording panel and Nagraj actions live inside the Inspector content", () => {
    const start = editor.indexOf('data-testid="studio-inspector-content"');
    const end = editor.indexOf("const mixerChannels = (");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const content = editor.slice(start, end);
    expect(content).toMatch(/<StudioRecordingPanel\b/);
    expect(content).toMatch(/>\s*Nagraj\s*</);
    expect(content).toMatch(/data-testid="studio-inspector-empty"/);
  });
});

describe("STU-06-C — close paths, focus and breakpoints", () => {
  it("keeps backdrop / Escape close paths, focus trap and focus return", () => {
    expect(inspectorShell).toMatch(/data-testid="studio-inspector-backdrop"/);
    expect(inspectorShell).toMatch(/event\.key === "Escape"/);
    expect(inspectorShell).toMatch(/event\.key !== "Tab"/);
    expect(inspectorShell).toMatch(
      /previouslyFocusedRef\.current\?\.focus\?\.\(\)/,
    );
    expect(inspectorShell).toMatch(/role="dialog"/);
    expect(inspectorShell).toMatch(/aria-modal="true"/);
  });

  it("tablet keeps the right drawer and desktop keeps the xl rail", () => {
    expect(has(sheet, "md:ml-auto")).toBe(true);
    expect(has(sheet, "md:h-full")).toBe(true);
    expect(has(sheet, "md:w-[min(22rem,92vw)]")).toBe(true);
    expect(
      classesOf(editor, /data-testid="studio-inspector-desktop"/),
    ).toMatch(/(?:^|\s)hidden(?:\s|$)[\s\S]*xl:flex/);
    expect(editor).toMatch(
      /open=\{inspectorOverlayOpen && !inspectorDesktopRail\}/,
    );
  });

  it("sheet never exceeds the viewport width (no horizontal overflow)", () => {
    expect(has(sheet, "w-full")).toBe(true);
    expect(sheet).not.toMatch(/(?:^|\s)(?:min-)?w-\[\d+px\]/);
    expect(sheet).not.toMatch(/(?:^|\s)w-screen(?:\s|$)/);
  });

  it("noBeat keeps the Inspector toolbar entry and the empty-state Nagraj", () => {
    expect(editor).toMatch(/aria-controls=\{inspectorPanelId\}/);
    expect(editor).toMatch(/data-testid="studio-inspector-empty"/);
  });
});
