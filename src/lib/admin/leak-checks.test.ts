import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { leakFileName } from "@/lib/admin/leak-checks";

describe("leak check file names", () => {
  it("keeps a safe name with the extension", () => {
    expect(leakFileName("Mój numer (TikTok).mp4")).toBe("Moj_numer_TikTok_.mp4");
    expect(leakFileName("../../etc/passwd")).toBe("etc_passwd");
    expect(leakFileName("...")).toBe("plik");
    expect(leakFileName("a".repeat(200) + ".mp3").length).toBe(80);
  });
});
