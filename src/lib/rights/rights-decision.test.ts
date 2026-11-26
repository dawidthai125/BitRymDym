import { describe, expect, it } from "vitest";

import { catalogMinSeconds, decideWorkRights, type RightsFileResult } from "@/lib/rights/rights-decision";

const clean = (over: Partial<RightsFileResult> = {}): RightsFileResult => ({
  kind: "take", ref: "t1", durationSeconds: 60, catalog: [], external: [], externalError: null, error: null, ...over,
});

describe("decideWorkRights", () => {
  it("passes when nothing matches", () => {
    const v = decideWorkRights({ files: [clean({ kind: "master" }), clean()] });
    expect(v.passed).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it("holds on a known recording (AcoustID ≥ 0.9)", () => {
    const v = decideWorkRights({ files: [clean({ kind: "master", external: [{ score: 0.95, title: "Song", artist: "Artist", url: null }] })] });
    expect(v.passed).toBe(false);
    expect(v.reasons[0]).toContain("Artist – Song");
  });

  it("ignores weak external scores", () => {
    expect(decideWorkRights({ files: [clean({ external: [{ score: 0.5, title: "x", artist: null, url: null }] })] }).passed).toBe(true);
  });

  it("holds on our beat inside an uploaded stem", () => {
    const v = decideWorkRights({ files: [clean({ kind: "stem", catalog: [{ source: "beat", id: "b", title: "Iskry", score: 0.92, matchedSeconds: 50 }] })] });
    expect(v.passed).toBe(false);
    expect(v.reasons[0]).toContain("bitu z katalogu");
  });

  it("a short file needs 80 % of its length, not 20 s", () => {
    expect(catalogMinSeconds(10)).toBe(8);
    expect(catalogMinSeconds(120)).toBe(20);
    expect(catalogMinSeconds(null)).toBe(20);
    const hit = { source: "beat" as const, id: "b", title: null, score: 0.9, matchedSeconds: 9 };
    expect(decideWorkRights({ files: [clean({ durationSeconds: 10, catalog: [hit] })] }).passed).toBe(false);
  });

  it("errors and an unanswered AcoustID never pass", () => {
    expect(decideWorkRights({ files: [clean({ error: "download_failed" })] }).passed).toBe(false);
    expect(decideWorkRights({ files: [clean({ externalError: "acoustid_timeout" })] }).passed).toBe(false);
    expect(decideWorkRights({ files: [] }).passed).toBe(false);
  });

  it("too many files to check holds the work", () => {
    expect(decideWorkRights({ files: [clean()], truncated: true }).passed).toBe(false);
  });

  it("a rejected own beat holds the work", () => {
    expect(decideWorkRights({ files: [clean()], ownBeatRejected: true }).passed).toBe(false);
  });
});
