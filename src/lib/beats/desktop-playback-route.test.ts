import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("desktop beat playback route", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/app/api/beats/audio/playback/route.ts"),
    "utf8",
  );

  it("asks the existing gate for PLAYBACK and not DOWNLOAD", () => {
    expect(src).toMatch(/purpose:\s*"PLAYBACK"/);
    expect(src).not.toMatch(/previewOnly/);
    expect(src).not.toMatch(/purpose:\s*"DOWNLOAD"/);
    expect(src).not.toMatch(/createSignedUrl/);
    expect(src).toContain("requestBeatAudioAccess");
  });

  it("rejects a client-chosen purpose or storage key", () => {
    expect(src).toContain("Niedozwolone parametry odsłuchu.");
    expect(src).toContain('"purpose"');
    expect(src).toContain('"objectKey"');
    expect(src).toContain('"bucket"');
  });
});
