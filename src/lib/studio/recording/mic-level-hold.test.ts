import { describe, expect, it } from "vitest";

import { MIC_HOLD_MS, MIC_SILENCE_AFTER_MS, nextMicHold, startMicHold } from "@/lib/studio/recording/mic-level-hold";

describe("mic level hold", () => {
  it("says 'checking' before anything was heard and 'silent' only after a while", () => {
    let hold = startMicHold(0);
    hold = nextMicHold(hold, "silent", 1_000);
    expect(hold.status).toBe("checking");
    hold = nextMicHold(hold, "silent", MIC_SILENCE_AFTER_MS);
    expect(hold.status).toBe("silent");
  });

  it("keeps the level between words and recovers from silence at once", () => {
    let hold = nextMicHold(startMicHold(0), "good", 100);
    hold = nextMicHold(hold, "silent", 1_500);
    expect(hold.status).toBe("good");
    hold = nextMicHold(hold, "quiet", 1_000);
    expect(hold.status).toBe("good");
    hold = nextMicHold(hold, "quiet", 100 + MIC_HOLD_MS + 1);
    expect(hold.status).toBe("quiet");
    hold = nextMicHold(hold, "silent", 60_000);
    expect(hold.status).toBe("silent");
    expect(nextMicHold(hold, "hot", 60_100).status).toBe("hot");
  });
});
