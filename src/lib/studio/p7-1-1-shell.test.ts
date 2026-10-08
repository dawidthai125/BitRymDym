/**
 * Phase 7.1.1 — DAW shell / edit toolbar / testid foundation contracts.
 * Does not re-test Precision Foundation geometry (frozen).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const editor = readFileSync(
  join(root, "src/components/studio/studio-editor.tsx"),
  "utf8",
);
const page = readFileSync(
  join(root, "src/app/studio/p/[projectId]/page.tsx"),
  "utf8",
);

describe("Phase 7.1.1 shell landmarks", () => {
  it("keeps studio-daw-shell and marks shell regions", () => {
    expect(editor).toMatch(/data-testid="studio-daw-shell"/);
    expect(editor).toMatch(/data-studio-shell="true"/);
    expect(editor).toMatch(/data-testid="studio-header"/);
    expect(editor).toMatch(/data-testid="studio-transport"/);
    expect(editor).toMatch(/data-testid="studio-edit-toolbar"/);
    expect(editor).toMatch(/data-testid="studio-track-list"/);
    expect(editor).toMatch(/data-testid="studio-timeline"/);
    expect(editor).toMatch(/data-testid="studio-inspector-desktop"/);
    expect(editor).toMatch(/data-testid="studio-mixer-drawer"/);
  });

  it("separates track-header testids from mixer channel testids", () => {
    expect(editor).toMatch(/data-testid="studio-track-header"/);
    expect(editor).toMatch(/data-testid="studio-track-header-select"/);
    expect(editor).toMatch(/data-testid="studio-mix-track"/);
    expect(editor).toMatch(/data-testid="studio-mix-track-select"/);
    // Header no longer reuses mixer track testids.
    const headerBlock = editor.slice(
      editor.indexOf("renderTrackHeader"),
      editor.indexOf("data-testid=\"studio-inspector-desktop\""),
    );
    expect(headerBlock).toMatch(/studio-track-header/);
    expect(headerBlock).not.toMatch(/data-testid="studio-mix-track"/);
  });
});

describe("Phase 7.1.1 edit toolbar hit targets", () => {
  it("primary edit-toolbar controls declare min-h-11", () => {
    const toolbarStart = editor.indexOf('data-testid="studio-edit-toolbar"');
    expect(toolbarStart).toBeGreaterThan(0);
    const toolbarEnd = editor.indexOf(
      'className="flex min-h-0 flex-col gap-3 xl:flex-row',
      toolbarStart,
    );
    const toolbar = editor.slice(toolbarStart, toolbarEnd);
    const buttonCount = (toolbar.match(/<Button[\s\S]*?<\/Button>/g) ?? [])
      .length;
    expect(buttonCount).toBeGreaterThanOrEqual(10);
    expect(toolbar.match(/className="min-h-11/g)?.length ?? 0).toBe(
      buttonCount,
    );
    for (const label of [
      "Zaznacz",
      "Edycja",
      "Podziel",
      "Usuń",
      "Snap",
      "zoom−",
      "zoom+",
      "Fit",
      "Mixer",
    ]) {
      expect(toolbar).toContain(label);
    }
    expect(toolbar).toMatch(/studio-add-track/);
  });

  it("track chips and reorder use ≥44px hit area classes", () => {
    expect(editor).toMatch(
      /STUDIO_DAW_CHIP_CLASS = "h-11 min-h-11 min-w-11 w-11 px-0"/,
    );
    expect(editor).toMatch(/className="h-11 min-h-11 min-w-11 px-0"/);
  });
});

describe("Phase 7.1.1 layout / precision freeze", () => {
  it("page and shell block page-level horizontal overflow", () => {
    expect(page).toMatch(/overflow-x-hidden/);
    expect(editor).toMatch(/data-testid="studio-daw-shell"[\s\S]*?overflow-x-hidden/);
  });

  it("does not invent a second StudioAudioEngine or AudioContext", () => {
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(editor).not.toMatch(/new AudioContext/);
  });

  it("preserves existing timeline scroll and mixer drawer contracts", () => {
    expect(editor).toMatch(/data-testid="studio-timeline-scroll"/);
    expect(editor).toMatch(/data-testid="studio-playhead"/);
    expect(editor).toMatch(/data-testid="studio-mixer-drawer"/);
  });
});
