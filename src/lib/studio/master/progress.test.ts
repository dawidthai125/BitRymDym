import { describe, expect, it } from "vitest";

import { isStudioJobStage, jobProgressOf, studioJobProgress } from "./progress";

describe("studioJobProgress", () => {
  it("is monotonic across the stages of a master job", () => {
    const seq = [
      studioJobProgress("master", false, "queued"),
      studioJobProgress("master", false, "decode", 0),
      studioJobProgress("master", false, "decode", 1),
      studioJobProgress("master", false, "render", 0.5),
      studioJobProgress("master", false, "master", 0),
      studioJobProgress("master", false, "master", 1),
      studioJobProgress("master", false, "upload", 0.5),
      studioJobProgress("master", false, "done"),
    ];
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]!);
    expect(seq[0]).toBe(0);
    expect(seq.at(-1)).toBe(100);
    expect(studioJobProgress("master", false, "upload", 1)).toBeLessThan(100);
  });

  it("clamps fractions and ignores stages a kind does not run", () => {
    expect(studioJobProgress("master", false, "render", 7)).toBe(studioJobProgress("master", false, "master", 0));
    expect(studioJobProgress("master", false, "render", Number.NaN)).toBe(studioJobProgress("master", false, "decode", 1));
    expect(studioJobProgress("transcode", true, "render", 0.5)).toBe(0);
    expect(studioJobProgress("transcode", true, "encode", 0)).toBe(25);
  });

  it("validates stage names", () => {
    expect(isStudioJobStage("render")).toBe(true);
    expect(isStudioJobStage("hack")).toBe(false);
    expect(isStudioJobStage(3)).toBe(false);
  });
});

describe("jobProgressOf", () => {
  it("never moves the bar backwards and tolerates old rows", () => {
    expect(jobProgressOf({ status: "queued" }, null)).toEqual({ stage: "queued", progress: 0 });
    expect(jobProgressOf({ status: "running" }, { stage: "queued", progress: 0 })).toEqual({ stage: "decode", progress: 0 });
    const a = jobProgressOf({ status: "running", stage: "render", progress: 40 }, null);
    expect(a).toEqual({ stage: "render", progress: 40 });
    expect(jobProgressOf({ status: "running", stage: "master", progress: 30 }, a)).toEqual({ stage: "master", progress: 40 });
    expect(jobProgressOf({ status: "running", stage: "bogus", progress: 500 }, a)).toEqual({ stage: "render", progress: 100 });
  });
});
