import { describe, expect, it } from "vitest";

import {
  coverBriefPrompt,
  sanitizeCoverColors,
  sanitizeCoverLettering,
} from "@/lib/beats/ai-beat/cover-brief";

describe("cover brief", () => {
  it("keeps an empty cover free of writing and uses dark colors", () => {
    const brief = coverBriefPrompt({ style: "mroczny trap", lettering: "", colors: "  " });
    expect(brief.ok).toBe(true);
    if (!brief.ok) return;
    expect(brief.prompt).toContain("No writing, no letters.");
    expect(brief.prompt).toContain("Dark colors.");
    expect(brief.prompt).toContain("No real faces.");
    expect(brief.prompt).toContain("mroczny trap");
  });

  it("puts the exact lettering and the palette into the prompt", () => {
    const brief = coverBriefPrompt({
      style: null,
      lettering: "  NOC  ",
      colors: "czerń i złoto",
    });
    expect(brief.ok).toBe(true);
    if (!brief.ok) return;
    expect(brief.prompt).toContain('The only text is exactly "NOC".');
    expect(brief.prompt).toContain("No other words.");
    expect(brief.prompt).toContain("Colors: czerń i złoto.");
    expect(brief.prompt.length).toBeLessThanOrEqual(300);
  });

  it("cuts long fields and drops quotes", () => {
    expect(sanitizeCoverLettering(`"${"N".repeat(40)}"`)).toHaveLength(24);
    expect(sanitizeCoverColors("złoto ".repeat(30)).length).toBeLessThanOrEqual(60);
  });

  it("returns the rule message when the lettering names a brand", () => {
    const brief = coverBriefPrompt({
      style: "hip-hop",
      lettering: "nike",
      colors: "czerń",
    });
    expect(brief.ok).toBe(false);
    if (brief.ok) return;
    expect(brief.message.length).toBeGreaterThan(10);
  });
});
