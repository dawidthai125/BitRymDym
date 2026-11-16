import { describe, expect, it } from "vitest";

import { opsExportExtension, opsExportFileName } from "@/lib/beats/audio-types";

describe("opsExportExtension", () => {
  it("maps common master content types", () => {
    expect(opsExportExtension("audio/wav")).toBe("wav");
    expect(opsExportExtension("audio/x-wav; charset=binary")).toBe("wav");
    expect(opsExportExtension("audio/mpeg")).toBe("mp3");
    expect(opsExportExtension(null)).toBe("bin");
  });
});

describe("opsExportFileName", () => {
  it("keeps a readable title and the right extension", () => {
    expect(opsExportFileName("Cień ulicy", "audio/wav")).toBe("Cień ulicy.wav");
    expect(opsExportFileName("!!!", "audio/mpeg")).toBe("bitrymdym-platform.mp3");
  });
});
