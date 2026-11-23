import { describe, expect, it } from "vitest";

import { buildBitekClientContext } from "./client-context";
import { bitekProposalTarget, parseTrackIds, planBitekChanges, refsToTrackIds } from "./apply-plan";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { createStudioFxInstance } from "@/lib/studio/studio-fx-chain";

const V = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "aaaaaaaa-0000-4000-8000-000000000002";
let n = 0;
const createId = () => `3fa85f64-5717-4562-b3fc-2c963f66f${String(++n).padStart(3, "0")}`;
const client = (effects: unknown[] = []) =>
  buildBitekClientContext({
    doc: {
      project: { id: "p" },
      tracks: [
        { id: V, name: "Wokal", trackRole: "lead_vocal", gainDb: 1, pan: 0, muted: false, solo: false, effectsChain: { schemaVersion: 1, effects } },
        { id: B, name: "Bit", trackRole: "beat", gainDb: 0, pan: 0, muted: false, solo: false, effectsChain: { schemaVersion: 1, effects: [] } },
      ],
      clips: [],
    } as unknown as StudioProjectDocument,
    lang: "pl",
    step: "mix",
  });
const base = { beatKey: null, tier: "SILVER" as const, canMaster: false, createId };

describe("BITEK chat changes", () => {
  it("tune and space on one track end up in one chain (M22)", () => {
    const plan = planBitekChanges({ ...base, client: client(), items: [{ target: V, param: "tune", value: 1 }, { target: V, param: "space", value: 2 }, { target: V, param: "gainDb", value: 3 }] });
    if (!plan.ok) throw new Error("no plan");
    expect(plan.ops).toHaveLength(2);
    const fx = plan.ops.find((o) => o.op === "set_track_fx");
    if (fx?.op !== "set_track_fx") throw new Error("no fx");
    const types = fx.effectsChain.effects.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["tune", "reverb", "delay"]));
    expect(plan.from).toEqual([0, 0, 1]);
  });

  it("says the plan is full instead of sending a chain the server refuses", () => {
    const full = ["eq", "compressor", "deesser", "highpass"].map((t) => createStudioFxInstance(t as "eq", createId));
    expect(planBitekChanges({ ...base, client: client(full), maxEffects: 4, items: [{ target: V, param: "space", value: 2 }] })).toEqual({ ok: false, reason: "limit" });
  });

  it("master settings only where the master step is open (M21)", () => {
    const items = [{ target: "master", param: "bright" as const, value: 2 }];
    expect(planBitekChanges({ ...base, client: client(), items }).ok).toBe(false);
    expect(planBitekChanges({ ...base, client: client(), items, canMaster: true })).toMatchObject({ ok: true, ops: [], master: [{ key: "bright", value: 2 }] });
  });

  it("an old proposal keeps its track after a reorder, and is off when the track is gone or unknown (M23)", () => {
    const ids = refsToTrackIds({ t1: V, t2: B }, [{ trackRef: "t1", param: "gainDb", value: -3, label: "" }], []);
    expect(ids).toEqual({ t1: V });
    expect(bitekProposalTarget("t1", ids, { t1: B, t2: V })).toBe(V);
    expect(bitekProposalTarget("t1", ids, { t1: B })).toBeNull();
    expect(bitekProposalTarget("t1", null, { t1: B })).toBeNull();
  });

  it("the server keeps only well-formed ref → id pairs", () => {
    expect(parseTrackIds({ t1: V, t2: "nope", x: B, t3: 5 })).toEqual({ t1: V });
    expect(parseTrackIds("bad")).toEqual({});
  });
});
