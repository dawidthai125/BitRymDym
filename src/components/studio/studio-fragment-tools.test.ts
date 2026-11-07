import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const editor = readFileSync(join(process.cwd(), "src/components/studio/studio-editor.tsx"), "utf8");
const tools = readFileSync(join(process.cwd(), "src/components/studio/studio-fragment-tools.tsx"), "utf8");

describe("timeline fragment tools", () => {
  it("puts cut, move and delete on the record transport", () => {
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
    expect(tools).toContain("aria-pressed={reverseOn}");
    expect(editor).toContain("onFragmentReverse");
    expect(editor).toContain('op: "set_scratch"');
    expect(editor).toContain("fragmentConfirmDelete");
    expect(editor).toContain("onFragmentDuplicate");
    const lane = readFileSync(join(process.cwd(), "src/components/studio/studio-clip-lane.tsx"), "utf8");
    expect(lane).toContain("data-studio-clip-body");
    expect(lane).toContain('beginDrag("move"');
  });
});
