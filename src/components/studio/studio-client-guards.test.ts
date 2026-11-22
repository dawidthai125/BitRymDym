import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const playStudio = read("src/components/studio/play/play-studio.tsx");
const playKeys = read("src/components/studio/studio-play-keys.tsx");
const masterStep = read("src/components/studio/studio-master-step.tsx");
const sampleLab = read("src/components/studio/sample-lab/sample-lab.tsx");

describe("studio client guards", () => {
  it("Play studio ignores keys typed into fields (shared guard from studio-play-keys)", () => {
    expect(playKeys).toContain("export function isTypingTarget");
    expect(playStudio).toContain('from "@/components/studio/studio-play-keys"');
    expect(playStudio.match(/isTypingTarget\(ev\.target\)/g)).toHaveLength(2);
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
