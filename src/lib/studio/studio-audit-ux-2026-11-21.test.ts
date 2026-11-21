import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { bitekDockPlacement } from "@/lib/studio/bitek-dock-placement";

const read = (p: string) => readFileSync(p, "utf8");
const editor = read("src/components/studio/studio-editor.tsx");
const transport = read("src/components/studio/studio-transport-bar.tsx");
const dock = read("src/components/studio/studio-bitek-dock.tsx");
const mixStep = read("src/components/studio/studio-mix-step.tsx");
const list = read("src/components/studio/studio-project-list.tsx");
const css = read("src/app/globals.css");

describe("Studio UX audit 2026-11-21", () => {
  it("transport rows wrap instead of scrolling; clip tools only while something is selected", () => {
    expect(transport).toMatch(/data-testid="studio-transport-row-main"/);
    expect(transport).not.toMatch(/overflow-x-auto/);
    expect(transport).toMatch(/hasSelection \|\| \(showFragmentTools && \(fragmentEnabled \|\| fragmentConfirmDelete\)\)/);
  });

  it("sticky works: no overflow-x-hidden scroll container above the transport", () => {
    expect(editor).toMatch(/studio-desk flex min-h-\[calc\(100dvh-7rem\)\] flex-col gap-0\.5 overflow-x-clip/);
    expect(transport).toMatch(/sm:sticky sm:top-2/);
    expect(transport).toMatch(/new IntersectionObserver/);
  });

  it("BITEK auto mix-mastering switch lives in the Mix step, not over the tracks", () => {
    expect(dock).not.toMatch(/studio-bitek-auto/);
    expect(mixStep).toMatch(/data-testid="studio-bitek-auto"/);
    expect(dock).toMatch(/lg:left-\[20rem\]/);
    expect(bitekDockPlacement({ recording: false, recordContext: true, inspectorSheetOpen: false }).side).toBe("left");
  });

  it("locked Mastering step shows why, visibly", () => {
    expect(editor).toMatch(/data-testid=\{!active && s === "master" \? "studio-tab-master-locked" : undefined\}/);
    expect(editor).toMatch(/tMix\("krokMasteringZamek"\)/);
  });

  it("beat picker shows the beat title; lane chip is readable", () => {
    expect(editor).toMatch(/beatTitle \|\| doc\.tracks\.find/);
    expect(css).toMatch(/\.studio-desk \[data-testid="studio-timeline"\] \.studio-lane-title\.sticky \{\s*background: #f2a93b !important;/);
  });

  it("new projects get the creation time in the title; dates are not read twice", () => {
    expect(list).toMatch(/formatProjectDateTime\(new Date\(\)\.toISOString\(\), listTag\)/);
    expect(list).toMatch(/<span aria-hidden className="text-\[var\(--brd-mute\)\]">\{t\("utworzono"\)\}/);
  });

  it("save status says what is ready", () => {
    expect(editor).toMatch(/tr\("wszystkoZapisane"\)/);
  });
});
