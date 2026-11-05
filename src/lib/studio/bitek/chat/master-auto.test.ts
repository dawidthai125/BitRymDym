import { describe, expect, it } from "vitest";

import { runBitekChatChain } from "./chain";
import { bitekMasterAutoChat } from "./master-intents";
import type { BitekChatContext } from "./types";

const base = (lang: "pl" | "en", lufs: number | null, peak = -2): BitekChatContext =>
  ({
    lang,
    step: "master",
    tracks: [{ ref: "t1", name: "Wokal", role: "lead_vocal", gainDb: 0, pan: 0, muted: false }],
    analysis: lufs === null ? null : { stale: false, cards: [], masterIntegratedLufs: lufs, masterTruePeakDbtp: peak },
    master: { target: "streaming", settings: { loudness: 0, bright: 0, bass: 0, width: 0, squash: 0 }, cards: [] },
  }) as unknown as BitekChatContext;

describe("BITEK automatic professional master", () => {
  it.each([
    ["zrób mi profesjonalny master", true],
    ["zrób automatyczny master całości", true],
    ["jak w cryo-mix", true],
    ["auto master", true],
    ["autotune na wokalu", false],
    ["profesjonalny master wokalu", false],
    ["głośniej całość", false],
  ])("%s → auto=%s", (msg, expected) => {
    const r = bitekMasterAutoChat(msg, base("pl", -10));
    expect(r !== null).toBe(expected);
  });

  it("asks for a master first when there is no LUFS measurement", () => {
    const r = bitekMasterAutoChat("zrób profesjonalny master", base("pl", null));
    expect(r?.proposals).toEqual([]);
    expect(r?.reply).toMatch(/Zrób master/);
  });

  it("limits the loudness step by true peak; the fader offset follows the renderer goal", () => {
    // Quiet song (−18 LUFS) with peaks at −2 dBTP and a −1 dBTP ceiling: only 1 LU fits, so the fader goes to −3.
    const r = bitekMasterAutoChat("zrób profesjonalny master", base("pl", -18, -2));
    expect(r?.proposals.length).toBe(1);
    expect(r?.proposals[0]).toMatchObject({ trackRef: "master", param: "loudness", value: -3 });
    expect(r?.reply).toMatch(/szczyt|peak|true/i);
  });

  it("stays silent when the master already sits on target", () => {
    const r = bitekMasterAutoChat("zrób profesjonalny master", base("pl", -14, -6));
    expect(r?.proposals).toEqual([]);
  });

  it("is reached through the chain without a provider in mastering", async () => {
    const res = await runBitekChatChain({
      providers: [],
      message: "zrób mi profesjonalny master",
      history: [],
      context: base("pl", -18),
    });
    expect(res.provider).toBe("rules");
    expect(res.proposals.length).toBe(1);
  });
});
