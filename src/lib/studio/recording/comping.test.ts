import { describe, expect, it } from "vitest";

import {
  addPassesToLane,
  buildCompClipSpecs,
  compSegments,
  defaultComp,
  parseTakeLane,
  setLineChoice,
  setSectionChoice,
  toggleStar,
  type LanePass,
  type TakeLane,
} from "@/lib/studio/recording/comping";

const BAR = 2000;

function pass(id: string, takeId: string, offset: number, extra: Partial<LanePass> = {}): Omit<LanePass, "number"> {
  return {
    id,
    takeId,
    kind: "loop",
    rangeStartMs: 8000,
    rangeEndMs: 16000,
    sourceOffsetMs: offset,
    takeDurationMs: 40000,
    starred: false,
    complete: true,
    createdAt: "2026-10-29T20:00:00Z",
    ...extra,
  };
}

function emptyLane(): TakeLane {
  return {
    id: "lane1",
    trackId: "track1",
    sectionStartMs: 8000,
    sectionEndMs: 16000,
    lineMs: BAR,
    passes: [],
    comp: [],
    clipIds: [],
    updatedAt: "",
  };
}

describe("take lanes", () => {
  it("newest pass wins, star wins in default", () => {
    let lane = addPassesToLane(emptyLane(), [pass("p1", "t1", 2000), pass("p2", "t1", 10000)]);
    expect(lane.passes.map((p) => p.number)).toEqual([1, 2]);
    expect(lane.comp).toEqual(["p2", "p2", "p2", "p2"]);
    lane = toggleStar(lane, "p1");
    expect(defaultComp(lane)).toEqual(["p1", "p1", "p1", "p1"]);
  });

  it("merges same-pass lines into one clip with edge fades", () => {
    const lane = addPassesToLane(emptyLane(), [pass("p1", "t1", 2000)]);
    expect(compSegments(lane)).toEqual([{ passId: "p1", startMs: 8000, endMs: 16000 }]);
    const [c] = buildCompClipSpecs(lane, { crossfadeMs: 12, edgeFadeMs: 4 });
    expect(c).toEqual({
      passId: "p1",
      takeId: "t1",
      timelineStartMs: 8000,
      durationMs: 8000,
      sourceOffsetMs: 2000,
      fadeInMs: 4,
      fadeOutMs: 4,
    });
  });

  it("comps per line with overlapping crossfades", () => {
    let lane = addPassesToLane(emptyLane(), [pass("p1", "t1", 2000), pass("p2", "t1", 10000)]);
    lane = setSectionChoice(lane, "p1");
    lane = setLineChoice(lane, 2, "p2");
    const specs = buildCompClipSpecs(lane, { crossfadeMs: 12, edgeFadeMs: 4 });
    expect(specs.map((s) => [s.passId, s.timelineStartMs, s.durationMs, s.sourceOffsetMs, s.fadeInMs, s.fadeOutMs])).toEqual([
      ["p1", 8000, 4006, 2000, 4, 12],
      ["p2", 11994, 2012, 13994, 12, 12],
      ["p1", 13994, 2006, 7994, 12, 4],
    ]);
    // Source continuity: timeline t maps to pass offset + (t - 8000).
    specs.forEach((s) => {
      const p = lane.passes.find((x) => x.id === s.passId)!;
      expect(s.sourceOffsetMs).toBe(p.sourceOffsetMs + (s.timelineStartMs - p.rangeStartMs));
    });
  });

  it("clamps crossfade at the start of recorded audio", () => {
    let lane = addPassesToLane(emptyLane(), [pass("p1", "t1", 2000), pass("p2", "t2", 0, { rangeStartMs: 10000, kind: "punch", sourceOffsetMs: 0 })]);
    lane = setSectionChoice(lane, "p1");
    lane = setLineChoice(lane, 1, "p2");
    const specs = buildCompClipSpecs(lane, { crossfadeMs: 12, edgeFadeMs: 4 });
    // p2 has no audio before 10000 → no pre-roll overlap, p1 overlaps after.
    expect(specs[1]).toMatchObject({ passId: "p2", timelineStartMs: 10000, sourceOffsetMs: 0 });
    expect(specs[0]!.timelineStartMs + specs[0]!.durationMs).toBe(10006);
    expect(specs[1]!.fadeInMs).toBe(6);
  });

  it("refuses choices a pass can't cover and leaves gaps silent", () => {
    let lane = addPassesToLane(emptyLane(), [pass("p1", "t1", 2000, { rangeEndMs: 12000, complete: false })]);
    expect(lane.comp).toEqual(["p1", "p1", null, null]);
    expect(setLineChoice(lane, 3, "p1")).toBe(lane);
    lane = setLineChoice(lane, 0, null);
    expect(buildCompClipSpecs(lane).map((s) => s.timelineStartMs)).toEqual([10000]);
  });

  it("validates stored lanes", () => {
    const lane = addPassesToLane(emptyLane(), [pass("p1", "t1", 2000)]);
    expect(parseTakeLane(JSON.parse(JSON.stringify(lane)))).toEqual(lane);
    expect(parseTakeLane({ ...lane, sectionEndMs: 1 })).toBeNull();
    expect(parseTakeLane({ ...lane, passes: [{ ...lane.passes[0], sourceOffsetMs: -5 }] })).toBeNull();
  });
});
