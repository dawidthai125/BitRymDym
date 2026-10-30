import { describe, expect, it } from "vitest";

import { maxRecordingTracksForTier } from "@/config/plan-policy";
import { countRecordingTracks, studioTrackRowCap } from "@/lib/studio/studio-track-capacity";

describe("recording-track cap (Bit not counted)", () => {
  it("counts every track except the Bit", () => {
    expect(countRecordingTracks([{ trackType: "BEAT" }, { trackType: "VOCAL" }])).toBe(1);
    expect(countRecordingTracks([{ track_type: "BEAT" }, { track_type: "VOCAL" }, { track_type: "ADLIB" }])).toBe(2);
    expect(countRecordingTracks([])).toBe(0);
  });

  it("RPC row cap = plan recording tracks + Bit rows", () => {
    expect(studioTrackRowCap({ maxRecordingTracks: maxRecordingTracksForTier("FREE"), beatTrackCount: 1 })).toBe(2);
    expect(studioTrackRowCap({ maxRecordingTracks: maxRecordingTracksForTier("FREE"), beatTrackCount: 0 })).toBe(1);
    expect(studioTrackRowCap({ maxRecordingTracks: maxRecordingTracksForTier("GOLD"), beatTrackCount: 1 })).toBe(8);
    expect(() => studioTrackRowCap({ maxRecordingTracks: 0, beatTrackCount: 1 })).toThrow();
  });

  it("Bronze project already above the cap keeps its tracks, but adding is blocked (DB: count >= cap)", () => {
    const existing = [{ track_type: "BEAT" }, { track_type: "VOCAL" }, { track_type: "VOCAL" }, { track_type: "VOCAL" }];
    const cap = studioTrackRowCap({
      maxRecordingTracks: maxRecordingTracksForTier("BRONZE"),
      beatTrackCount: existing.length - countRecordingTracks(existing),
    });
    expect(cap).toBe(3);
    // studio_cas_add_track / studio_cas_duplicate_track raise TRACK_CAPACITY_REACHED when count >= cap;
    // nothing trims existing rows, so the 4 tracks stay and only new ones are refused.
    expect(existing.length >= cap).toBe(true);
  });
});
