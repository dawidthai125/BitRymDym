import { describe, expect, it } from "vitest";

import { watchMasterManual, watchMixManual, type WatchTrack } from "./manual-watch";

const vocal = (over: Partial<WatchTrack> = {}): WatchTrack => ({
  id: "v",
  name: "Wokal",
  role: "lead_vocal",
  gainDb: 0,
  pan: 0,
  muted: false,
  hasAudio: true,
  eqGainDb: null,
  compressorRatio: null,
  ...over,
});
const beat = (over: Partial<WatchTrack> = {}): WatchTrack => ({
  id: "b",
  name: "Bit",
  role: "beat",
  gainDb: 0,
  pan: 0,
  muted: false,
  hasAudio: true,
  eqGainDb: null,
  compressorRatio: null,
  ...over,
});

describe("manual mix watch", () => {
  it("stays quiet without a measurement and when the vocal is only a little low", () => {
    expect(watchMixManual({ lang: "pl", tracks: [vocal({ gainDb: -2 }), beat()], baseline: null })).toBeNull();
    const mild = watchMixManual({
      lang: "pl",
      tracks: [vocal({ gainDb: -2 }), beat()],
      baseline: { vocalVsBeatLu: 1, vocalGainDb: 0, beatGainDb: 0, masterTruePeakDbtp: -2, tracks: [] },
    });
    expect(mild).toBeNull();
  });

  it("flags a vocal buried under the beat and offers the corrected fader", () => {
    const issue = watchMixManual({
      lang: "pl",
      tracks: [vocal({ gainDb: -10 }), beat()],
      baseline: { vocalVsBeatLu: 1, vocalGainDb: 0, beatGainDb: 0, masterTruePeakDbtp: -2, tracks: [] },
    });
    expect(issue?.key).toBe("balance-buried");
    expect(issue?.text).toContain("\u22129");
    expect(issue?.fix).toEqual({ kind: "controls", trackId: "v", gainDb: 0.5 });
  });

  it("flags the only vocal when it is muted, and an extreme lead pan", () => {
    const muted = watchMixManual({ lang: "pl", tracks: [vocal({ muted: true }), beat()], baseline: null });
    expect(muted?.key).toBe("mute-vocal");
    expect(muted?.fix).toEqual({ kind: "controls", trackId: "v", muted: false });
    const pan = watchMixManual({ lang: "en", tracks: [vocal({ pan: 0.9 }), beat()], baseline: null });
    expect(pan?.key).toBe("pan-lead");
    expect(pan?.fix).toEqual({ kind: "controls", trackId: "v", pan: 0 });
  });
});

describe("manual master watch", () => {
  it("stays quiet at or under the ceiling", () => {
    expect(watchMasterManual({ lang: "pl", measuredLufs: -14, truePeakDb: -1.2, targetLufs: -14, ceilingDb: -1, loudness: 0 })).toBeNull();
    expect(watchMasterManual({ lang: "pl", measuredLufs: -14, truePeakDb: null, targetLufs: -14, ceilingDb: -1, loudness: 2 })).toBeNull();
  });

  it("names the peak over the ceiling and lowers the loudness fader", () => {
    const issue = watchMasterManual({ lang: "pl", measuredLufs: -11, truePeakDb: -0.2, targetLufs: -14, ceilingDb: -1, loudness: 2 });
    expect(issue?.key).toBe("master-tp");
    expect(issue?.text).toContain("\u22120.2");
    expect(issue?.text).toContain("\u22121");
    expect(issue?.fix).toEqual({ kind: "masterLoudness", value: 1.2 });
  });
});
