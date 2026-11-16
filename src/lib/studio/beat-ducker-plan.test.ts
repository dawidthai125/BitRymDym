import { describe, expect, it } from "vitest";

import {
  BEAT_DUCKER_DEPTH,
  planBeatDuckerOps,
} from "@/lib/studio/beat-ducker-plan";

describe("beat-ducker-plan", () => {
  it("adds mild sidechain on lead_vocal", () => {
    let n = 0;
    const ops = planBeatDuckerOps({
      tracks: [
        {
          id: "v1",
          trackRole: "lead_vocal",
          effectsChain: { schemaVersion: 1, effects: [] },
        },
        {
          id: "b1",
          trackRole: "beat",
          effectsChain: { schemaVersion: 1, effects: [] },
        },
      ],
      createId: () => `id-${++n}`,
    });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "set_track_fx", trackId: "v1" });
    if (ops[0]?.op !== "set_track_fx") throw new Error("expected set_track_fx");
    const sc = ops[0].effectsChain.effects.find((e) => e.type === "sidechain");
    expect(sc?.enabled).toBe(true);
    if (sc?.type !== "sidechain") throw new Error("sidechain");
    expect(sc.params.depth).toBe(BEAT_DUCKER_DEPTH);
  });
});
