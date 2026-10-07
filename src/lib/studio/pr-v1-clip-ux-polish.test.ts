/**
 * POST-RECORDING V1 PR-05 — ClipEditPanel capability controls + mobile targets.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const editor = readFileSync(
  join(process.cwd(), "src/components/studio/studio-editor.tsx"),
  "utf8",
);

describe("PR-05 ClipEditPanel UX polish", () => {
  it("exposes Edit capabilities: Gain, Mute, Fade, Trim, Split, Duplicate, Delete", () => {
    expect(editor).toMatch(/Zapisz głośność/);
    expect(editor).toMatch(/Wycisz klip/);
    expect(editor).toMatch(/Zapisz fade/);
    expect(editor).toMatch(/Przytnij początek/);
    expect(editor).toMatch(/Przytnij koniec/);
    expect(editor).toMatch(/Podziel/);
    expect(editor).toMatch(/Powiel/);
    expect(editor).toMatch(/Usuń/);
  });

  it("primary clip controls use min-h-11 (≥44px) touch targets", () => {
    const panelStart = editor.indexOf("function ClipEditPanel");
    const panel = editor.slice(panelStart, panelStart + 12_000);
    expect(panel.match(/min-h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("reuses ClipEditPanel / StudioMixControl / StudioToggleChip (no second Studio UI)", () => {
    expect(editor).toMatch(/function ClipEditPanel/);
    expect(editor).toMatch(/StudioMixControl/);
    expect(editor).toMatch(/StudioToggleChip/);
    expect(editor).not.toMatch(/VocalEditorEngine/);
    expect(editor).not.toMatch(/PostProductionEngine/);
    expect(editor).not.toMatch(/function MobileClipEditor/);
  });

  it("keeps layout mobile-safe (min-w-0, no fixed desktop-only clip editor)", () => {
    const panelStart = editor.indexOf("function ClipEditPanel");
    const panel = editor.slice(panelStart, panelStart + 12_000);
    expect(panel).toMatch(/min-w-0/);
    expect(panel).not.toMatch(/w-\[720px\]|min-w-\[800px\]/);
  });
});
