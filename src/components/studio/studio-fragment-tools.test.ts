import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("timeline fragment tools", () => {
  it("puts cut, move and delete on the record transport", () => {
    const root = process.cwd();
    const editor = readFileSync(join(root, "src/components/studio/studio-editor.tsx"), "utf8");
    const tools = readFileSync(join(root, "src/components/studio/studio-fragment-tools.tsx"), "utf8");
    expect(editor).toContain("showFragmentTools={studioStep === \"record\"}");
    expect(editor).toContain("onFragmentSplit");
    expect(editor).toContain("onFragmentNudge");
    expect(editor).toContain("onFragmentDelete");
    expect(editor).toContain("beatDurationMs");
    expect(editor).toContain("deleteSelectedClip()");
    expect(tools).toContain('data-testid="studio-fragment-split"');
    expect(tools).toContain('data-testid="studio-fragment-nudge-left"');
    expect(tools).toContain('data-testid="studio-fragment-nudge-right"');
    expect(tools).toContain('data-testid="studio-fragment-delete"');
    expect(tools).toContain('data-testid="studio-fragment-trim-start"');
    expect(tools).toContain('data-testid="studio-fragment-trim-end"');
    expect(tools).toContain('data-testid="studio-fragment-duplicate"');
    expect(tools).toContain('data-testid="studio-fragment-reverse"');
    expect(tools).toContain('data-testid="studio-fragment-stretch"');
    expect(tools).toContain('data-testid="studio-fragment-pitch"');
    // fs mock resolves t("…") → pl copy for contract greps
    expect(tools).toContain('aria-label="Tempo klipu, wysokość zostaje"');
    expect(tools).toContain('aria-label="Wysokość klipu, tempo zostaje"');
    expect(tools).toContain("aria-pressed={reverseOn}");
    expect(editor).toContain("onFragmentReverse");
    expect(editor).toContain('op: "set_scratch"');
    expect(editor).toContain("fragmentConfirmDelete");
    expect(editor).toContain("onFragmentDuplicate");
    const lane = readFileSync(join(root, "src/components/studio/studio-clip-lane.tsx"), "utf8");
    expect(lane).toContain("data-studio-clip-body");
    expect(lane).toContain('beginDrag("move"');
  });

  it("wires EN copy for clip tempo and pitch controls", () => {
    const en = JSON.parse(
      readFileSync(join(process.cwd(), "messages/en.json"), "utf8"),
    ) as { studio: { studioEditor: Record<string, string> } };
    const ed = en.studio.studioEditor;
    expect(ed.tempoKlipuAria).toBe("Clip tempo, pitch stays the same");
    expect(ed.wysokoscKlipuAria).toBe("Clip pitch, tempo stays the same");
    expect(ed.wysokoscKlipuOdSilver).toBe("Pitch from Silver. Tempo stays.");
    expect(ed.wyzerujWysokosc).toBe("Reset pitch");
  });
});
