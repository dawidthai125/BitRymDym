/**
 * Phase 7.1.2 — brand typography + token contracts (OD-P7.1-01 = B).
 * Does not re-test shell/precision product logic.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tokens = readFileSync(join(root, "src/styles/tokens.css"), "utf8");
const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
const editor = readFileSync(
  join(root, "src/components/studio/studio-editor.tsx"),
  "utf8",
);

describe("Phase 7.1.2 brand font wiring", () => {
  it("loads Source Serif 4, Schibsted Grotesk, IBM Plex Mono via next/font", () => {
    expect(layout).toMatch(/Source_Serif_4/);
    expect(layout).toMatch(/Schibsted_Grotesk/);
    expect(layout).toMatch(/IBM_Plex_Mono/);
    expect(layout).toMatch(/variable:\s*"--font-brd-display"/);
    expect(layout).toMatch(/variable:\s*"--font-brd-ui"/);
    expect(layout).toMatch(/variable:\s*"--font-brd-meta"/);
  });

  it("does not use Geist as primary brand font", () => {
    expect(layout).not.toMatch(/\bGeist\b/);
    expect(layout).toMatch(/from "next\/font\/google"/);
  });

  it("defines non-circular semantic font tokens", () => {
    expect(tokens).toMatch(
      /--font-display:\s*var\(--font-brd-display\),[\s\S]*?"Source Serif 4"/,
    );
    expect(tokens).toMatch(
      /--font-ui:\s*var\(--font-brd-ui\),[\s\S]*?"Schibsted Grotesk"/,
    );
    expect(tokens).toMatch(
      /--font-meta:\s*var\(--font-brd-meta\),[\s\S]*?"IBM Plex Mono"/,
    );
    // No self-reference cycles in tokens.
    expect(tokens).not.toMatch(/--font-display:\s*var\(--font-display\)/);
    expect(tokens).not.toMatch(/--font-ui:\s*var\(--font-ui\)/);
    expect(tokens).not.toMatch(/--font-meta:\s*var\(--font-meta\)/);
  });

  it("removes circular @theme font redeclarations", () => {
    expect(globals).toMatch(/--font-heading:\s*var\(--font-display\)/);
    expect(globals).toMatch(/--font-sans:\s*var\(--font-ui\)/);
    expect(globals).toMatch(/--font-mono:\s*var\(--font-meta\)/);
    expect(globals).not.toMatch(/--font-display:\s*var\(--font-display\)/);
    expect(globals).not.toMatch(/--font-ui:\s*var\(--font-ui\)/);
    expect(globals).not.toMatch(/--font-meta:\s*var\(--font-meta\)/);
  });
});

describe("Phase 7.1.2 color tokens", () => {
  it("defines --brd-bg as alias of existing paper-deep (no duplicate hex)", () => {
    expect(tokens).toMatch(/--brd-bg:\s*var\(--brd-paper-deep\)/);
    expect(tokens).toMatch(/--brd-paper:\s*#f2ebe0/);
    expect(tokens).toMatch(/--brd-green:\s*#1a3a30/);
    expect(tokens).toMatch(/--brd-paper-deep:\s*#e4dccf/);
  });

  it("exposes --brd-bg to Tailwind theme", () => {
    expect(globals).toMatch(/--color-brd-bg:\s*var\(--brd-bg\)/);
  });
});

describe("Phase 7.1.2 preserves 7.1.1 shell contracts", () => {
  it("keeps shell landmarks and ≥44px toolbar hit targets", () => {
    expect(editor).toMatch(/data-testid="studio-daw-shell"/);
    expect(editor).toMatch(/data-testid="studio-edit-toolbar"/);
    expect(editor).toMatch(/data-testid="studio-track-header"/);
    expect(editor).toMatch(/STUDIO_DAW_CHIP_CLASS = "h-11 min-h-11/);
    expect(editor).toMatch(/overflow-x-hidden/);
  });
});
