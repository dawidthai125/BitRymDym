import { describe, expect, it } from "vitest";

import { getSamplePolicy } from "@/lib/takes/entitlement";
import { decideRecordingEligibility } from "@/lib/takes/recording-eligibility";

import { masterQuotaWithCredits, withTakeCredits } from "./quota-credits";

describe("quota packs", () => {
  it("adds take credits only after the plan day cap, and not past the ready cap", () => {
    const policy = getSamplePolicy({ actor: "FREE", beatDurationSeconds: 60 });
    const denied = decideRecordingEligibility({
      beatStatus: "PUBLISHED",
      policy,
      premiumTier: "FREE",
      sessionsToday: policy.dailySessionLimit,
      activeReadyCount: 0,
    });
    expect(denied.code).toBe("SESSION_DAY_CAP");
    const opened = withTakeCredits(denied, 10);
    expect(opened.allowed).toBe(true);
    expect(opened.code).toBe("ALLOWED");
    expect(opened.dailySessionLimit).toBe(policy.dailySessionLimit + 10);

    const ready = decideRecordingEligibility({
      beatStatus: "PUBLISHED",
      policy,
      premiumTier: "FREE",
      sessionsToday: policy.dailySessionLimit,
      activeReadyCount: policy.activeReadyCap,
    });
    expect(withTakeCredits(ready, 10).code).toBe("ACTIVE_READY_CAP");
    expect(withTakeCredits(denied, 0)).toBe(denied);
  });

  it("counts leftover masters as plan remainder plus unused credits", () => {
    expect(masterQuotaWithCredits(0, 2, 5)).toBe(7);
    expect(masterQuotaWithCredits(2, 2, 5)).toBe(7);
    expect(masterQuotaWithCredits(3, 2, 4)).toBe(7);
    expect(masterQuotaWithCredits(2, 2, 0)).toBe(2);
  });
});
