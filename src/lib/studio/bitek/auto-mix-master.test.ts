import { describe, expect, it } from "vitest";

import { bitekAutoMixMasterForTier } from "@/config/plan-policy";
import { PREMIUM_TIERS } from "@/types/premium";

import {
  AUTO_MIX_MAX_ROUNDS,
  autoMixMasterMaterial,
  autoMixRecordOffer,
  bitekAutoMixMasterEnabled,
  clearAutoMixHandoff,
  nextAutoMasterStep,
  nextAutoMixStep,
  readAutoMixHandoff,
  readBitekAutoMixMaster,
  saveAutoMixHandoff,
  writeBitekAutoMixMaster,
} from "./auto-mix-master";

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("BITEK auto mix-mastering", () => {
  it("is Gold only, and a stored flag does not unlock a lower plan", () => {
    expect(PREMIUM_TIERS.map((tier) => bitekAutoMixMasterForTier(tier))).toEqual([false, false, false, true]);
    const storage = memory();
    writeBitekAutoMixMaster(true, storage);
    expect(readBitekAutoMixMaster("GOLD", storage)).toBe(true);
    expect(readBitekAutoMixMaster("SILVER", storage)).toBe(false);
    expect(readBitekAutoMixMaster("FREE", storage)).toBe(false);
    expect(bitekAutoMixMasterEnabled("BRONZE", "1")).toBe(false);
    expect(bitekAutoMixMasterEnabled("GOLD", "0")).toBe(false);
    expect(bitekAutoMixMasterEnabled("GOLD", null)).toBe(false);
  });

  it("is ready only with a vocal clip and a beat", () => {
    const vocal = { id: "v", trackType: "VOCAL", trackRole: "lead_vocal" };
    const beat = { id: "b", trackType: "BEAT", trackRole: "beat" };
    const clip = (trackId: string, durationMs: number) => ({ trackId, durationMs });
    expect(autoMixMasterMaterial({ tracks: [vocal, beat], clips: [clip("v", 1000), clip("b", 1000)] }).ready).toBe(true);
    expect(autoMixMasterMaterial({ tracks: [vocal], clips: [clip("v", 1000)], beatId: "beat-1" })).toMatchObject({
      vocal: true,
      beat: true,
      ready: true,
    });
    expect(
      autoMixMasterMaterial({
        tracks: [{ id: "a", trackRole: "adlib" }, { id: "i", trackRole: "instrument" }],
        clips: [clip("a", 500), clip("i", 500)],
      }).ready,
    ).toBe(true);
    expect(autoMixMasterMaterial({ tracks: [vocal, beat], clips: [clip("v", 0), clip("b", 1000)] })).toMatchObject({
      vocal: false,
      ready: false,
    });
    expect(autoMixMasterMaterial({ tracks: [vocal], clips: [clip("v", 1000)] })).toMatchObject({ beat: false, ready: false });
    expect(autoMixRecordOffer({ enabled: false, recording: false, vocal: true, beat: true })).toBe("hidden");
    expect(autoMixRecordOffer({ enabled: true, recording: true, vocal: true, beat: true })).toBe("hidden");
    expect(autoMixRecordOffer({ enabled: true, recording: false, vocal: true, beat: true })).toBe("ready");
    expect(autoMixRecordOffer({ enabled: true, recording: false, vocal: false, beat: true })).toBe("need-vocal");
    expect(autoMixRecordOffer({ enabled: true, recording: false, vocal: true, beat: false })).toBe("need-beat");
    expect(autoMixRecordOffer({ enabled: true, recording: false, vocal: false, beat: false })).toBe("need-both");
  });

  it("mixes until the measured passes are done, then asks before mastering", () => {
    const base = { hasFreshAnalysis: true, running: false, fixing: false, canApply: true, opsLeft: 3, fixSeq: 0, failed: false };
    expect(nextAutoMixStep({ ...base, hasFreshAnalysis: false })).toBe("analyze");
    expect(nextAutoMixStep({ ...base, running: true })).toBe("wait");
    expect(nextAutoMixStep(base)).toBe("fix");
    expect(nextAutoMixStep({ ...base, fixSeq: 1 })).toBe("fix");
    expect(nextAutoMixStep({ ...base, fixSeq: AUTO_MIX_MAX_ROUNDS })).toBe("ask");
    expect(nextAutoMixStep({ ...base, opsLeft: 0 })).toBe("ask");
    expect(nextAutoMixStep({ ...base, failed: true })).toBe("stop");
    expect(nextAutoMixStep({ ...base, canApply: false })).toBe("ask");
  });

  it("masters once, after clarity, and stops when the quota or the server blocks it", () => {
    const ready = { phase: "clarity" as const, mixReady: true, previewFresh: true, serverLoaded: true, blocked: false, hasClarityMoves: true };
    expect(nextAutoMasterStep({ ...ready, previewFresh: false })).toBe("wait");
    expect(nextAutoMasterStep({ ...ready, serverLoaded: false })).toBe("wait");
    expect(nextAutoMasterStep(ready)).toBe("apply-clarity");
    expect(nextAutoMasterStep({ ...ready, hasClarityMoves: false })).toBe("master");
    expect(nextAutoMasterStep({ ...ready, phase: "commit" })).toBe("master");
    expect(nextAutoMasterStep({ ...ready, blocked: true })).toBe("stop");
  });

  it("keeps the one-shot mix handoff on this project only", () => {
    const storage = memory();
    saveAutoMixHandoff("p1", 1_000, storage);
    expect(readAutoMixHandoff("p1", 1_000, storage)?.projectId).toBe("p1");
    expect(readAutoMixHandoff("p2", 1_000, storage)).toBeNull();
    expect(readAutoMixHandoff("p1", 1_000 + 16 * 60 * 1000, storage)).toBeNull();
    clearAutoMixHandoff(storage);
    expect(readAutoMixHandoff("p1", 1_000, storage)).toBeNull();
  });
});
