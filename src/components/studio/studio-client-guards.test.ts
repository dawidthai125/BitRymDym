import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const playStudio = read("src/components/studio/play/play-studio.tsx");
const playKeys = read("src/components/studio/studio-play-keys.tsx");
const masterStep = read("src/components/studio/studio-master-step.tsx");
const sampleLab = read("src/components/studio/sample-lab/sample-lab.tsx");

describe("studio client guards", () => {
  it("Play studio ignores keys typed into fields (playKeysBlocked, behaviour in play-keys-blocked.test.ts)", () => {
    expect(playKeys).toContain("export function isTypingTarget");
    expect(playStudio).toMatch(/playKeysBlocked[^\n]*from "@\/lib\/studio\/play\/keyboard-map"/);
    // keydown: typing never starts a note. keyup only ends a note that is already sounding (M63),
    // so a key released inside a field cannot hang it and typing cannot play anything.
    expect(playStudio).toMatch(/const down = [\s\S]{0,220}playKeysBlocked\(ev\.target, ev\.code\)\) return;/);
    expect(playStudio).toMatch(/const up = [\s\S]{0,80}if \(pressed\.current\.has\(ev\.code\)\) keyHandlers\.current\.noteOff/);
  });

  it("Master A/B detaches the old source's onended before stopping it", () => {
    expect(masterStep).toContain("a.src.onended = null;");
    expect(masterStep).toContain("audioRef.current?.src === src");
  });

  it("Sample Lab unmount clears timers, clicks, beat audio and late engines", () => {
    expect(sampleLab).toContain("countIns.forEach((id) => window.clearTimeout(id))");
    expect(sampleLab).toContain("stopClicks.current?.();");
    expect(sampleLab).toContain('audio.removeAttribute("src")');
    expect(sampleLab).toMatch(/if \(!mounted\.current\) \{\s*\/\/[^\n]*\n\s*void opened\.close\(\);/);
  });
});
