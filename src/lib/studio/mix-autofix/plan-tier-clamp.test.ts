import { describe, expect, it } from "vitest";

import type { StudioFxChainV1, StudioFxInstance } from "@/lib/studio/studio-fx-chain";

import { clampChainToPlan } from "./plan";

const fx = (id: string, type: string): StudioFxInstance => ({ id, type, enabled: true, params: {} }) as unknown as StudioFxInstance;
const chain = (...e: StudioFxInstance[]): StudioFxChainV1 => ({ schemaVersion: 1, role: "track", effects: e }) as unknown as StudioFxChainV1;

describe("clampChainToPlan", () => {
  const original = chain();
  const fixed = chain(fx("1", "highpass"), fx("2", "eq"), fx("3", "compressor"), fx("4", "deesser"), fx("5", "delay"), fx("6", "reverb"), fx("7", "rider"));

  it("keeps the chain untouched without limits or when it already fits", () => {
    expect(clampChainToPlan(fixed, original, {})).toBe(fixed);
    const small = chain(fx("1", "eq"), fx("2", "compressor"));
    expect(clampChainToPlan(small, original, { maxEffects: 4 })).toBe(small);
  });

  it("drops the least essential added effects until it fits the plan cap", () => {
    const out = clampChainToPlan(fixed, original, { maxEffects: 4 });
    expect(out?.effects.map((e) => e.type)).toEqual(["highpass", "eq", "compressor", "deesser"]);
  });

  it("never drops the user's own effects and gives up when it cannot fit", () => {
    const mine = chain(fx("a", "reverb"), fx("b", "delay"), fx("c", "eq"), fx("d", "gate"), fx("e", "limiter"));
    const grown = chain(...mine.effects, fx("n1", "compressor"));
    // 6 > 4 and 6 >= 5: only the added compressor may go, then 5 > 4 and 5 >= 5 still fails -> null
    expect(clampChainToPlan(grown, mine, { maxEffects: 4 })).toBeNull();
  });

  it("removes an added sidechain when the plan has none, keeps the user's own", () => {
    const own = chain(fx("s0", "sidechain"));
    const next = chain(fx("s0", "sidechain"), fx("s1", "sidechain"), fx("e", "eq"));
    const out = clampChainToPlan(next, own, { allowSidechain: false });
    expect(out?.effects.map((e) => e.id)).toEqual(["s0", "e"]);
  });
});
