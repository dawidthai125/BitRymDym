/**
 * STU-02 — mobile sticky transport + Mixer sheet layering (Visual Parity V2 §12 SM).
 * Source contracts only; real sticky/stacking behaviour is verified in a browser.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const editor = read("src/components/studio/studio-editor.tsx");
const page = read("src/app/studio/p/[projectId]/page.tsx");
const mixerShell = read("src/components/studio/studio-mixer-shell.tsx");
const bottomNav = read("src/components/site/mobile-bottom-nav.tsx");
const siteHeader = read("src/components/site/site-header.tsx");
const fxEditor = read("src/components/studio/studio-fx-chain-editor.tsx");

const REM_PX = 16;
/** Rendered SiteHeader height without safe area (< sm / ≥ sm). */
const SITE_HEADER_PX_BASE = 66.4;
const SITE_HEADER_PX_SM = 82.8;
const MAX_GAP_PX = 8;

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

function stickyTopPx(cls: string, prefix: "" | "sm:"): number {
  const m = new RegExp(
    `(?:^|\\s)${prefix}top-\\[calc\\(([\\d.]+)rem\\+env\\(safe-area-inset-top\\)\\)\\]`,
  ).exec(cls);
  if (!m) throw new Error(`no ${prefix}top calc offset in: ${cls}`);
  return Number(m[1]) * REM_PX;
}

/** Classes that turn an element into a scroll container and trap `position: sticky`. */
const SCROLL_CONTAINER =
  /(?:^|\s)overflow(?:-[xy])?-(?:hidden|auto|scroll)(?:\s|$)/;

const transport = classesOf(editor, /data-testid="studio-transport"/);
const header = classesOf(siteHeader, /<header\b/);
const overlay = classesOf(mixerShell, /data-testid="studio-mixer-overlay"/);
const sheet = classesOf(mixerShell, /data-testid="studio-mixer-sheet"/);
const nav = classesOf(bottomNav, /aria-label="Nawigacja mobilna"/);
const fxOverlay = classesOf(fxEditor, /className="fixed inset-0 z-50/);

describe("STU-02-A — sticky transport", () => {
  const ancestors: Array<[string, string]> = [
    ["page <main>", classesOf(page, /<main\b/)],
    ["page <PageFrame>", classesOf(page, /<PageFrame\b/)],
    ["studio-daw-shell", classesOf(editor, /data-testid="studio-daw-shell"/)],
  ];

  it("transport stays position: sticky", () => {
    expect(transport).toMatch(/(?:^|\s)sticky(?:\s|$)/);
  });

  it.each(ancestors)(
    "%s does not create a scroll container that would trap sticky",
    (_name, cls) => {
      expect(cls).not.toMatch(SCROLL_CONTAINER);
    },
  );

  it.each(ancestors)("%s still clips horizontal overflow", (_name, cls) => {
    expect(cls).toMatch(/(?:^|\s)overflow-x-clip(?:\s|$)/);
  });

  it("SiteHeader is sticky at top-0 and stacks above the transport", () => {
    expect(header).toMatch(/(?:^|\s)sticky top-0(?:\s|$)/);
    expect(zIndexOf(header)).toBeGreaterThan(zIndexOf(transport));
  });

  it("sticky offsets clear the SiteHeader at < sm and ≥ sm without a large gap", () => {
    const base = stickyTopPx(transport, "");
    const sm = stickyTopPx(transport, "sm:");
    expect(base).toBeGreaterThanOrEqual(SITE_HEADER_PX_BASE);
    expect(base - SITE_HEADER_PX_BASE).toBeLessThanOrEqual(MAX_GAP_PX);
    expect(sm).toBeGreaterThanOrEqual(SITE_HEADER_PX_SM);
    expect(sm - SITE_HEADER_PX_SM).toBeLessThanOrEqual(MAX_GAP_PX);
  });

  it("noBeat keeps the full transport shell with beat controls disabled", () => {
    expect(editor).toMatch(
      /data-studio-transport-empty=\{noBeat \? "true" : "false"\}/,
    );
    expect(editor).toMatch(/const beatControlsDisabled = noBeat \|\| busy;/);
    expect(editor).toMatch(/data-testid="studio-transport-choose-beat"/);
  });
});

describe("STU-02-B — Mixer sheet layering", () => {
  it("overlay is fixed full-screen and only below xl", () => {
    expect(overlay).toMatch(/(?:^|\s)fixed inset-0(?:\s|$)/);
    expect(overlay).toMatch(/(?:^|\s)xl:hidden(?:\s|$)/);
  });

  it("overlay stacks above MobileBottomNav and below StudioFxSheet", () => {
    expect(nav).toMatch(/(?:^|\s)fixed(?:\s|$)/);
    expect(zIndexOf(overlay)).toBeGreaterThan(zIndexOf(nav));
    expect(zIndexOf(overlay)).toBeLessThan(zIndexOf(fxOverlay));
  });

  it("sheet is bottom-anchored, height-capped and pads the bottom safe area", () => {
    expect(sheet).toMatch(/(?:^|\s)mt-auto(?:\s|$)/);
    expect(sheet).toMatch(/(?:^|\s)max-h-\[min\(70vh,/);
    expect(sheet).toMatch(/pb-\[env\(safe-area-inset-bottom\)\]/);
  });

  it("keeps backdrop / Escape close paths and focus return", () => {
    expect(mixerShell).toMatch(/data-testid="studio-mixer-backdrop"/);
    expect(mixerShell).toMatch(/event\.key === "Escape"/);
    expect(mixerShell).toMatch(/previouslyFocusedRef\.current\?\.focus\?\.\(\)/);
  });

  it("desktop dock stays xl-only with matchMedia default-expand", () => {
    expect(classesOf(mixerShell, /data-testid="studio-mixer-dock"/)).toMatch(
      /(?:^|\s)hidden(?:\s|$)[\s\S]*xl:flex/,
    );
    expect(editor).toMatch(/window\.matchMedia\("\(min-width: 1280px\)"\)/);
  });
});
