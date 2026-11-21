import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(join(process.cwd(), "src/components/studio/studio-recording-panel.tsx"), "utf8");

describe("samples go on instrument tracks, not vocal tracks", () => {
  it("resolves a sample track with the instrument role for both placement paths", () => {
    expect(panel).toContain("resolveSampleTrackId");
    expect(panel).toContain('trackRole: "instrument"');
    expect(panel).toContain("trackId: target.trackId");
    expect(panel).toContain("trackId: placeTrackId");
  });
});
