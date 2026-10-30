import { describe, expect, it } from "vitest";

import { bitekDockPlacement } from "@/lib/studio/bitek-dock-placement";
import {
  LIVE_TAKE_MAX_BUCKETS,
  appendLivePeak,
  createLiveTakeStore,
  liveTakeColumns,
  liveTakeStatusForPhase,
} from "@/lib/studio/studio-live-take";

describe("live take — peaks", () => {
  it("bucketizes by timeline offset, keeps max per bucket, bridges gaps", () => {
    let p = appendLivePeak([], 0, 0.2);
    p = appendLivePeak(p, 20, 0.5); // same 50 ms bucket → max
    expect(p).toEqual([0.5]);
    p = appendLivePeak(p, 210, 0.1); // bucket 4; 1..3 bridged with last value
    expect(p).toEqual([0.5, 0.5, 0.5, 0.5, 0.1]);
  });
  it("clamps, ignores negatives/NaN offsets and caps length", () => {
    expect(appendLivePeak([], -5, 1)).toEqual([]);
    expect(appendLivePeak([], Number.NaN, 1)).toEqual([]);
    expect(appendLivePeak([], 0, 7)).toEqual([1]);
    expect(appendLivePeak([], 0, Number.NaN)).toEqual([0]);
    expect(appendLivePeak([], 1e12, 0.3).length).toBe(LIVE_TAKE_MAX_BUCKETS);
  });
  it("downsamples to columns with max per column", () => {
    expect(liveTakeColumns([0.1, 0.9, 0.2, 0.4], 2)).toEqual([0.9, 0.4]);
    expect(liveTakeColumns([0.3], 3)).toEqual([0.3, 0.3, 0.3]); // upsample repeats
    expect(liveTakeColumns([], 4)).toEqual([]);
  });
});

describe("live take — phases & store", () => {
  it("maps recording phases to region status", () => {
    expect(liveTakeStatusForPhase("RECORDING")).toBe("recording");
    expect(liveTakeStatusForPhase("STOPPING")).toBe("saving");
    expect(liveTakeStatusForPhase("UPLOADING")).toBe("saving");
    expect(liveTakeStatusForPhase("PROCESSING")).toBe("saving");
    expect(liveTakeStatusForPhase("READY_TAKE")).toBe("pending");
    for (const ph of [
      "IDLE",
      "READY",
      "REQUESTING_MIC",
      "UPLOAD_ERROR",
      "RECORDING_ERROR",
    ] as const) {
      expect(liveTakeStatusForPhase(ph)).toBeNull();
    }
  });
  it("grows with the playhead, ignores count-in, freezes after stop, clears on end", () => {
    const s = createLiveTakeStore();
    const seen: Array<number | null> = [];
    s.subscribe((snap) => seen.push(snap ? snap.elapsedMs : null));
    s.begin("track-1", 4000);
    s.sample(3500, 0.9); // count-in before start → ignored
    expect(s.get()!.peaks).toEqual([]);
    s.sample(4100, 0.4);
    s.sample(4600, 0.6);
    expect(s.get()!.elapsedMs).toBe(600);
    expect(s.get()!.peaks.length).toBe(13);
    s.setStatus("saving");
    s.sample(5000, 1); // frozen
    expect(s.get()!.elapsedMs).toBe(600);
    expect(s.get()!.status).toBe("saving");
    s.end();
    expect(s.get()).toBeNull();
    expect(seen.at(-1)).toBeNull();
  });
});

describe("BITEK dock never covers record UI", () => {
  it("hides while recording or when the inspector sheet is open", () => {
    expect(
      bitekDockPlacement({
        recording: true,
        recordContext: true,
        inspectorSheetOpen: false,
      }).hidden,
    ).toBe(true);
    expect(
      bitekDockPlacement({
        recording: false,
        recordContext: false,
        inspectorSheetOpen: true,
      }).hidden,
    ).toBe(true);
  });
  it("moves left and folds the bubble in record context", () => {
    expect(
      bitekDockPlacement({
        recording: false,
        recordContext: true,
        inspectorSheetOpen: false,
      }),
    ).toEqual({
      hidden: false,
      side: "left",
      bubble: false,
      compact: true,
    });
  });
  it("narrow record context stays right (track headers live on the left), compact + folded", () => {
    expect(
      bitekDockPlacement({
        recording: false,
        recordContext: true,
        inspectorSheetOpen: false,
        narrow: true,
      }),
    ).toEqual({ hidden: false, side: "right", bubble: false, compact: true });
  });
  it("default placement elsewhere", () => {
    expect(
      bitekDockPlacement({
        recording: false,
        recordContext: false,
        inspectorSheetOpen: false,
      }),
    ).toEqual({
      hidden: false,
      side: "right",
      bubble: true,
      compact: false,
    });
  });
});
