import { describe, expect, it } from "vitest";

import type { MasterMetrics } from "./dsp";
import { buildStreamingReadiness } from "./streaming-readiness";

const base = (over: Partial<MasterMetrics>): MasterMetrics => ({
  lufs: -14,
  lraLu: 5,
  truePeakDb: -1.2,
  plr: 12,
  correlation: 0.8,
  sideToMid: 0.4,
  tonal: {} as MasterMetrics["tonal"],
  durationS: 180,
  ...over,
});

describe("streaming readiness", () => {
  it("scores a -14 LUFS / -1.2 dBTP master as ready", () => {
    const r = buildStreamingReadiness(base({}));
    expect(r?.score).toBe(100);
    expect(r?.notes[0]?.key).toBe("ok");
    expect(r?.rows.find((x) => x.id === "spotify")?.action).toBe("none");
    expect(r?.rows.find((x) => x.id === "apple")?.gainDb).toBe(-2);
  });
  it("flags an over-loud, squashed, clipping master", () => {
    const r = buildStreamingReadiness(base({ lufs: -8, truePeakDb: 0.4, plr: 5 }));
    expect(r?.truePeakOk).toBe(false);
    expect(r?.notes.map((n) => n.key)).toEqual(expect.arrayContaining(["tpOver", "loud", "squashed"]));
    expect(r!.score).toBeLessThan(60);
    expect(r?.rows[0]?.action).toBe("down");
  });
  it("returns null for silence", () => {
    expect(buildStreamingReadiness(base({ lufs: -Infinity }))).toBeNull();
  });
});
