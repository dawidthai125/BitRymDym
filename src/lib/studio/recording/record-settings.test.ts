import { describe, expect, it } from "vitest";

import {
  countInPlan,
  countInPlayheadMoved,
  readRecordSettings,
  resolveRecordTrackId,
  writeRecordSettings,
} from "@/lib/studio/recording/record-settings";

const t = (id: string, recordArmed = false) => ({ id, recordArmed });

describe("record settings", () => {
  it("survive an unmount, per project", () => {
    writeRecordSettings("p1", { ...readRecordSettings("p1"), recMode: "loop", countInBars: 2 });
    expect(readRecordSettings("p1")).toMatchObject({ recMode: "loop", countInBars: 2 });
    expect(readRecordSettings("p2").recMode).toBe("single");
  });

  it("records on the picked track, then the armed one, then the selected one", () => {
    const tracks = [t("a"), t("b", true), t("c")];
    expect(resolveRecordTrackId({ tracks, manualId: "c", selectedId: "a" })).toBe("c");
    expect(resolveRecordTrackId({ tracks, manualId: null, selectedId: "a" })).toBe("b");
    expect(resolveRecordTrackId({ tracks: [t("a"), t("c")], manualId: null, selectedId: "c" })).toBe("c");
    expect(resolveRecordTrackId({ tracks: [t("a", true), t("b", true)], manualId: null, selectedId: "b" })).toBe("b");
    expect(resolveRecordTrackId({ tracks: [], manualId: null, selectedId: "x" })).toBe("");
  });

  it("count-in: clicks alone when there is no room before the start", () => {
    expect(countInPlan({ startMs: 0, countMs: 2000 })).toBe("clicks");
    expect(countInPlan({ startMs: 2000, countMs: 2000 })).toBe("transport");
    expect(countInPlan({ startMs: 9000, countMs: 0 })).toBe("none");
  });

  it("notices when the user moves the playhead during the count-in", () => {
    const base = { fromMs: 8000, targetMs: 10_000 };
    expect(countInPlayheadMoved({ ...base, playheadMs: 9000 })).toBe(false);
    expect(countInPlayheadMoved({ ...base, playheadMs: 0 })).toBe(true);
    expect(countInPlayheadMoved({ ...base, playheadMs: 30_000 })).toBe(true);
  });
});
