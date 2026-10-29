import { describe, expect, it } from "vitest";

import { interpretStudioFxChainForPlayback } from "@/lib/studio/studio-fx-chain";
import { buildStudioOfflineFxChain } from "@/lib/studio/studio-offline-fx";

import {
  buildVocalPresetChain,
  buildVocalPresetSet,
  buildVocalSetOps,
  captureVocalSet,
  FxPresetValidationError,
  parseFxPresetName,
  parseFxPresetPayload,
  VOCAL_PRESET_IDS,
} from "./vocal-presets";

describe("built-in vocal presets", () => {
  it("ships exactly 6 presets", () => {
    expect(VOCAL_PRESET_IDS).toHaveLength(6);
  });

  it.each(VOCAL_PRESET_IDS)("%s: every slot is playable live AND renders offline (preview == E3)", (id) => {
    for (const bpm of [60, 90, 140, 200]) {
      const chain = buildVocalPresetChain(id, { bpm });
      const plan = interpretStudioFxChainForPlayback(chain);
      expect(plan.kind).toBe("chain");
      if (plan.kind !== "chain") return;
      expect(plan.slots.every((s) => s.status === "ready")).toBe(true);
      const offline = buildStudioOfflineFxChain(chain, "track", 48000);
      expect(offline).not.toBeNull();
      const left = new Float32Array(4800).map((_, i) => Math.sin(i / 7) * 0.5);
      const right = left.slice();
      offline!.processBuffer(left, right);
      expect(left.every(Number.isFinite)).toBe(true);
      expect(right.every(Number.isFinite)).toBe(true);
    }
  });

  it("delay follows the project tempo (1/8 note)", () => {
    const delay = buildVocalPresetChain("trap", { bpm: 120 }).effects.find((e) => e.type === "delay");
    expect(delay?.params).toMatchObject({ timeMs: 250 });
  });

  it("fresh effect ids on every build", () => {
    const a = buildVocalPresetChain("clean");
    const b = buildVocalPresetChain("clean");
    expect(a.effects[0].id).not.toBe(b.effects[0].id);
  });
});

describe("role sets", () => {
  const tracks = [
    { id: "t1", trackRole: "lead_vocal" as const },
    { id: "t2", trackRole: "double" as const },
    { id: "t3", trackRole: "adlib" as const },
    { id: "t4", trackRole: "beat" as const },
  ];
  it("builds lead/doubles/adlibs variants that all render offline", () => {
    for (const id of VOCAL_PRESET_IDS) {
      const set = buildVocalPresetSet(id, { bpm: 95 });
      for (const chain of Object.values(set)) {
        expect(buildStudioOfflineFxChain(chain, "track", 44100)).not.toBeNull();
      }
      expect(set.adlibs!.effects.some((e) => e.type === "delay")).toBe(true);
    }
  });
  it("emits one set_track_fx per vocal track and skips the beat", () => {
    const ops = buildVocalSetOps(tracks, buildVocalPresetSet("trap"));
    expect(ops.map((o) => (o.op === "set_track_fx" ? o.trackId : null))).toEqual(["t1", "t2", "t3"]);
  });
  it("captures a set from the first track per slot with effects", () => {
    const chain = buildVocalPresetChain("drill");
    const set = captureVocalSet([
      { trackRole: "lead_vocal", effectsChain: { schemaVersion: 1, effects: [] } },
      { trackRole: "lead_vocal", effectsChain: chain },
      { trackRole: "beat", effectsChain: chain },
    ]);
    expect(Object.keys(set)).toEqual(["lead"]);
    expect(set.lead!.effects.map((e) => e.type)).toEqual(chain.effects.map((e) => e.type));
  });
});

describe("own preset validation", () => {
  it("accepts a chain and a set", () => {
    expect(parseFxPresetPayload("chain", { chain: buildVocalPresetChain("clean") }).kind).toBe("chain");
    expect(parseFxPresetPayload("set", { set: buildVocalPresetSet("lofi") }).kind).toBe("set");
  });
  it.each([
    ["chain", { chain: { schemaVersion: 1, effects: [] } }],
    ["chain", { chain: { schemaVersion: 1, effects: [{ type: "eq", enabled: true, params: { low: { gainDb: 99 } } }] } }],
    ["set", { set: { solo: buildVocalPresetChain("clean") } }],
    ["set", { set: {} }],
    ["other", { chain: buildVocalPresetChain("clean") }],
  ])("rejects %s %j", (kind, payload) => {
    expect(() => parseFxPresetPayload(kind, payload)).toThrow(FxPresetValidationError);
  });
  it("names are trimmed and capped", () => {
    expect(parseFxPresetName("  Mój wokal ")).toBe("Mój wokal");
    expect(() => parseFxPresetName("")).toThrow();
    expect(() => parseFxPresetName("x".repeat(41))).toThrow();
  });
});
