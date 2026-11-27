import { describe, expect, it } from "vitest";

import { autoLevelForQuietTake } from "@/lib/studio/bitek/record-handoff";

describe("autoLevelForQuietTake", () => {
  it("raises the vocal first, then lowers the beat", () => {
    expect(autoLevelForQuietTake({ vocalGainDb: 0, beatGainDb: 0, peakDb: -16 })).toEqual({ vocalGainDb: 4, beatGainDb: null });
    expect(autoLevelForQuietTake({ vocalGainDb: 0, beatGainDb: 0, peakDb: -21 })).toEqual({ vocalGainDb: 6, beatGainDb: -3 });
    expect(autoLevelForQuietTake({ vocalGainDb: 0, beatGainDb: -1, peakDb: -40 })).toEqual({ vocalGainDb: 6, beatGainDb: -4 });
    expect(autoLevelForQuietTake({ vocalGainDb: 12, beatGainDb: 0, peakDb: -20 })).toEqual({ vocalGainDb: null, beatGainDb: -3 });
    expect(autoLevelForQuietTake({ vocalGainDb: 0, beatGainDb: null, peakDb: -30 })).toEqual({ vocalGainDb: 6, beatGainDb: null });
    expect(autoLevelForQuietTake({ vocalGainDb: 0, beatGainDb: 0, peakDb: -11 })).toEqual({ vocalGainDb: null, beatGainDb: null });
  });
});
