import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminWaitingBeats", () => {
  it("wires play, style/opis, WAV export and delete on the waiting row", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/admin/admin-waiting-beats.tsx"),
      "utf8",
    );
    expect(src).toContain("AdminBeatPlayButton");
    expect(src).toContain("Na podstawie czego powstał");
    expect(src).toContain("AdminPlatformOpsExportButton");
    expect(src).toContain("compactWav");
    expect(src).toContain("AdminBeatDelete");
    expect(src).toContain('redirectTo="/admin/beats/waiting"');
  });
});
