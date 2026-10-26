/**
 * Source contract for Studio edit-toolbar hit classes.
 * Real DOM bbox: studio-edit-toolbar.mount.browser.test.ts (React mount).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const TOOLBAR = path.resolve(
  process.cwd(),
  "src/components/studio/studio-edit-toolbar.tsx",
);
const EDITOR = path.resolve(
  process.cwd(),
  "src/components/studio/studio-editor.tsx",
);

describe("studio edit-toolbar hit-area source contract", () => {
  it("editor wires presentational StudioEditToolbar", () => {
    const editor = readFileSync(EDITOR, "utf8");
    expect(editor).toMatch(/StudioEditToolbar/);
    expect(editor).not.toMatch(/data-testid="studio-edit-toolbar"/);
  });

  it("StudioEditToolbar Buttons declare min-h-11 min-w-11", () => {
    const src = readFileSync(TOOLBAR, "utf8");
    const buttons = src.match(/<Button[\s\S]*?<\/Button>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(10);
    expect(src.match(/className="min-h-11 min-w-11/g)?.length ?? 0).toBe(
      buttons.length,
    );
    expect(src).toContain("Fit");
  });
});
