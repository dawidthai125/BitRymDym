import { describe, expect, it } from "vitest";

import { PLAN_POLICY } from "@/config/plan-policy";

import { chainHasSidechain, clipPitchChangeAllowed, effectCountOf, fxChainWriteAllowed } from "./plan-feature-gates";

describe("studio plan gates", () => {
  it("keeps the 2026-11-08 ladder", () => {
    expect(PLAN_POLICY.FREE.tools.aiLyricsPerDay).toBe(1);
    expect(PLAN_POLICY.BRONZE.tools.aiLyricsPerDay).toBe(5);
    expect(PLAN_POLICY.SILVER.tools.aiLyricsPerDay).toBe(10);
    expect(PLAN_POLICY.GOLD.tools.aiLyricsPerDay).toBe(30);
    expect(PLAN_POLICY.FREE.studio.maxFxEffects).toBe(4);
    expect(PLAN_POLICY.BRONZE.studio.maxFxEffects).toBe(4);
    expect(PLAN_POLICY.SILVER.studio.maxFxEffects).toBe(12);
    expect(PLAN_POLICY.GOLD.studio.engineerRequestsPerMonth).toBe(4);
    expect(PLAN_POLICY.SILVER.studio.engineerRequestsPerMonth).toBe(1);
    expect(PLAN_POLICY.FREE.studio.engineerRequestsPerMonth).toBe(0);
    expect(PLAN_POLICY.SILVER.studio.clipPitch).toBe(true);
    expect(PLAN_POLICY.BRONZE.studio.sidechain).toBe(false);
  });

  it("lets every plan reset pitch and keep tempo", () => {
    expect(clipPitchChangeAllowed("FREE", 0, 200)).toBe(true);
    expect(clipPitchChangeAllowed("FREE", 200, 200)).toBe(true);
    expect(clipPitchChangeAllowed("FREE", 100, 0)).toBe(false);
    expect(clipPitchChangeAllowed("SILVER", 100, 0)).toBe(true);
  });

  it("blocks a new sidechain and a longer chain, and allows shrinking", () => {
    const chain = { effects: [{ type: "eq" }, { type: "sidechain" }] };
    expect(chainHasSidechain(chain)).toBe(true);
    expect(effectCountOf(chain)).toBe(2);
    expect(fxChainWriteAllowed({ tier: "FREE", nextCount: 2, previousCount: 2, nextHasSidechain: true }).ok).toBe(false);
    expect(fxChainWriteAllowed({ tier: "SILVER", nextCount: 2, previousCount: 2, nextHasSidechain: true }).ok).toBe(true);
    expect(fxChainWriteAllowed({ tier: "FREE", nextCount: 5, previousCount: 5, nextHasSidechain: false }).ok).toBe(false);
    expect(fxChainWriteAllowed({ tier: "FREE", nextCount: 5, previousCount: 8, nextHasSidechain: false }).ok).toBe(true);
    expect(fxChainWriteAllowed({ tier: "FREE", nextCount: 4, previousCount: 4, nextHasSidechain: false }).ok).toBe(true);
  });
});
