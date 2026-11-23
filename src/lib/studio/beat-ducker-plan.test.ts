import { describe, expect, it } from "vitest";

import { BEAT_DUCKER_DEPTH, planBeatDucker, type BeatDuckerTrack } from "@/lib/studio/beat-ducker-plan";
import { applyRapPocket } from "@/lib/studio/mix-analysis/rap-pocket";
import { applyTrackSidechain } from "@/lib/studio/mix-analysis/track-sidechain";
import { createStudioFxInstance, type StudioFxInstance } from "@/lib/studio/studio-fx-chain";

let n = 0;
const createId = () => `3fa85f64-5717-4562-b3fc-2c963f66d${String(++n).padStart(3, "0")}`;
const lead = (effects: StudioFxInstance[] = []): BeatDuckerTrack => ({ id: "v1", trackRole: "lead_vocal", effectsChain: { schemaVersion: 1, effects } });
const beat: BeatDuckerTrack = { id: "b1", trackRole: "beat", effectsChain: { schemaVersion: 1, effects: [] } };

const legacySidechain = (): StudioFxInstance => ({
  id: createId(),
  type: "sidechain",
  enabled: true,
  params: { depth: 0.25, attackMs: 12, releaseMs: 120 },
});

describe("beat-ducker-plan", () => {
  it("ducks the beat and leaves the vocal alone", () => {
    const { ops, reason } = planBeatDucker({ tracks: [lead(), beat], createId });
    expect(reason).toBeNull();
    expect(ops).toHaveLength(1);
    if (ops[0]?.op !== "set_track_fx") throw new Error("expected set_track_fx");
    const chain = ops[0].effectsChain;
    expect(chain.effects.some((e) => e.type === "sidechain")).toBe(false);
    // Through the real mix code: the beat gets quieter under the vocal, the vocal keeps its level.
    const sr = 8000;
    const tone = (hz: number) => Float32Array.from({ length: sr }, (_, i) => 0.4 * Math.sin((2 * Math.PI * hz * i) / sr));
    const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    const v = { role: "lead_vocal", trackType: "VOCAL", effectsChain: chain, left: tone(300), right: tone(300) };
    const b = { role: "beat", trackType: "BEAT", effectsChain: { schemaVersion: 1, effects: [] }, left: tone(1000), right: tone(1000) };
    const before = { v: rms(v.left), b: rms(b.left) };
    applyRapPocket([v, b], sr, 1000, []);
    applyTrackSidechain([v, b], sr);
    expect(rms(v.left)).toBeCloseTo(before.v, 5);
    expect(rms(b.left) / before.b).toBeLessThan(0.9);
  });

  it("removes the old sidechain this button used to add, keeps the user's own", () => {
    const own: StudioFxInstance = { ...createStudioFxInstance("sidechain", createId) };
    const { ops } = planBeatDucker({ tracks: [lead([legacySidechain(), own]), beat], createId });
    if (ops[0]?.op !== "set_track_fx") throw new Error("expected set_track_fx");
    expect(ops[0].effectsChain.effects.filter((e) => e.type === "sidechain").map((e) => e.id)).toEqual([own.id]);
  });

  it("says why it has nothing to do", () => {
    expect(planBeatDucker({ tracks: [beat], createId })).toEqual({ ops: [], reason: "no-lead" });
    const first = planBeatDucker({ tracks: [lead(), beat], createId });
    if (first.ops[0]?.op !== "set_track_fx") throw new Error("expected set_track_fx");
    expect(planBeatDucker({ tracks: [lead(first.ops[0].effectsChain.effects), beat], createId }).reason).toBe("already");
    const full = ["eq", "compressor", "reverb", "delay"].map((t) => createStudioFxInstance(t as "eq", createId));
    expect(planBeatDucker({ tracks: [lead(full), beat], maxEffects: 4, createId }).reason).toBe("limit");
  });

  it("never lowers a stronger pocket", () => {
    const pocket = { ...createStudioFxInstance("pocket", createId) };
    expect(planBeatDucker({ tracks: [lead([pocket]), beat], createId }).reason).toBe("already");
    expect(BEAT_DUCKER_DEPTH).toBeLessThan(0.55);
  });
});
