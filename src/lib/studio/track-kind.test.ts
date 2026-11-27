import { describe, expect, it } from "vitest";

import { cleanTrackName, nextKindTrackName, STUDIO_NEW_TRACK_ROLE } from "@/lib/studio/track-kind";

describe("track kind", () => {
  it("numbers each kind after the highest one taken", () => {
    expect(nextKindTrackName("Wokal", [])).toBe("Wokal 1");
    expect(nextKindTrackName("Wokal", ["Wokal"])).toBe("Wokal 2");
    expect(nextKindTrackName("Wokal", ["Wokal 1", "Wokal 3", "Adlib 1"])).toBe("Wokal 4");
    expect(nextKindTrackName("Adlib", ["Wokal 1", "adlib 2"])).toBe("Adlib 3");
    expect(nextKindTrackName("Podbicie", ["Podbicie (1)"])).toBe("Podbicie 1");
  });

  it("cleans the typed name", () => {
    expect(cleanTrackName("  Refren   chór ", "X")).toBe("Refren chór");
    expect(cleanTrackName("   ", "Wokal 2")).toBe("Wokal 2");
    expect(cleanTrackName("a".repeat(99), "X")).toHaveLength(40);
  });

  it("maps kinds to roles", () => {
    expect(STUDIO_NEW_TRACK_ROLE).toEqual({ vocal: "lead_vocal", double: "double", adlib: "adlib" });
  });
});
