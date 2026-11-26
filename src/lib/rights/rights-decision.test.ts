import { describe, expect, it } from "vitest";

import {
  catalogMinSeconds,
  decideWorkRights,
  isHardCatalogHit,
  isLongCatalogHit,
  RIGHTS_LONG_MATCH,
  sameAudioBeatIds,
  type RightsFileResult,
} from "@/lib/rights/rights-decision";

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
    expect(v.findings).toHaveLength(1);
  });

  it("a short file needs 80 % of its length, not 20 s", () => {
    expect(catalogMinSeconds(10)).toBe(8);
    expect(catalogMinSeconds(120)).toBe(20);
    expect(catalogMinSeconds(null)).toBe(20);
    const hit = { source: "beat" as const, id: "b", title: null, score: 0.9, matchedSeconds: 9 };
    expect(decideWorkRights({ files: [clean({ durationSeconds: 10, catalog: [hit] })] }).passed).toBe(false);
  });

  it("holds a long match below the strict score (production case: Klatka Schodowa, 0.8202 over 120.8 s)", () => {
    const hit = { source: "beat" as const, id: "b", title: "Klatka Schodowa", score: 0.8202, matchedSeconds: 120.8 };
    expect(isHardCatalogHit(hit, 150)).toBe(false);
    expect(isLongCatalogHit(hit, 150)).toBe(true);
    const v = decideWorkRights({ files: [clean({ kind: "stem", durationSeconds: 150, catalog: [hit] })] });
    expect(v.passed).toBe(false);
    expect(v.reasons).toEqual(["Wgrana ścieżka pasuje do bitu z katalogu „Klatka Schodowa”."]);
    expect(v.findings).toEqual(v.reasons);
    const m = decideWorkRights({ files: [clean({ kind: "master", durationSeconds: 150, catalog: [hit] })] });
    expect(m.reasons).toEqual(["Gotowy utwór pasuje do bitu z katalogu „Klatka Schodowa”."]);
    expect(m.summaryPl).toContain("„Klatka Schodowa”");
  });

  it("a weak score passes even over a long span", () => {
    const hit = { source: "beat" as const, id: "b", title: "x", score: RIGHTS_LONG_MATCH.minScore - 0.05, matchedSeconds: 120 };
    expect(decideWorkRights({ files: [clean({ kind: "stem", durationSeconds: 150, catalog: [hit] })] }).passed).toBe(true);
  });

  it("a strong score over a few seconds of a long file still passes (strict rule unchanged)", () => {
    const hit = { source: "beat" as const, id: "b", title: "x", score: 0.9, matchedSeconds: 3 };
    expect(decideWorkRights({ files: [clean({ kind: "stem", durationSeconds: 150, catalog: [hit] })] }).passed).toBe(true);
  });

  it("a short looped one-shot keeps the strict rule only", () => {
    // fingerprintFile loops a too-short file to 12 s and reports the looped length.
    const near = { source: "sample" as const, id: "s", title: "Kick", score: 0.82, matchedSeconds: 9.8 };
    expect(isLongCatalogHit(near, 12)).toBe(false);
    expect(decideWorkRights({ files: [clean({ durationSeconds: 12, catalog: [near] })] }).passed).toBe(true);
    const strict = { ...near, score: 0.9, matchedSeconds: 10.8 };
    expect(decideWorkRights({ files: [clean({ durationSeconds: 12, catalog: [strict] })] }).passed).toBe(false);
    expect(isLongCatalogHit(near, null)).toBe(false);
  });

  it("errors and an unanswered AcoustID never pass, but are not findings", () => {
    const v = decideWorkRights({ files: [clean({ error: "download_failed" }), clean({ externalError: "acoustid_timeout" })] });
    expect(v.passed).toBe(false);
    expect(v.findings).toEqual([]);
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

  it("a catalogue copy of the project's own beat (remix entry) is skipped, a different beat is not", () => {
    // Fake compare: the fingerprint's first item names the recording; same recording = full match.
    const compare = (a: number[], b: number[]) =>
      a[0] === b[0] ? { score: 1, matchedSeconds: 104.7 } : { score: 0.5, matchedSeconds: 0.2 };
    const refs = [
      { source: "beat" as const, id: "orig", fingerprint: [1] },
      { source: "beat" as const, id: "remix", fingerprint: [1] },
      { source: "beat" as const, id: "other", fingerprint: [2] },
      { source: "sample" as const, id: "smp", fingerprint: [1] },
    ];
    expect(sameAudioBeatIds({ id: "orig", fingerprint: [1], durationSeconds: 107 }, refs, compare)).toEqual(["remix"]);
    // A long but weak overlap (another beat sharing a loop) is not "the same recording".
    const weak = () => ({ score: 0.8, matchedSeconds: 120 });
    expect(sameAudioBeatIds({ id: "orig", fingerprint: [1], durationSeconds: 150 }, refs, weak)).toEqual([]);
  });
});
