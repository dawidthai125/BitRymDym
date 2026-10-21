import { describe, expect, it } from "vitest";

import {
  applyPremiumWorkExpiryPlans,
  planPremiumWorkExpiry,
  type PremiumCleanupWork,
} from "@/lib/premium/premium-retention-cleanup";

describe("PREMIUM-03 retention cleanup planner", () => {
  it("does not expire before retention_expires_at", () => {
    const work: PremiumCleanupWork = {
      id: "w1",
      ownerId: "u1",
      domain: "TAKE",
      domainRef: "t1",
      status: "WORK_READY",
      retentionExpiresAtMs: 2000,
    };
    expect(planPremiumWorkExpiry({ work, nowMs: 1000 }).markExpired).toBe(
      false,
    );
  });

  it("marks due WORK_READY as expired; retry is idempotent", () => {
    const works = new Map<string, PremiumCleanupWork>();
    works.set("w1", {
      id: "w1",
      ownerId: "u1",
      domain: "TAKE",
      domainRef: "t1",
      status: "WORK_READY",
      retentionExpiresAtMs: 500,
    });
    const plan = planPremiumWorkExpiry({
      work: works.get("w1")!,
      nowMs: 1000,
    });
    expect(plan.markExpired).toBe(true);
    const first = applyPremiumWorkExpiryPlans({ works, plans: [plan] });
    expect(first.expired).toBe(1);
    const plan2 = planPremiumWorkExpiry({
      work: works.get("w1")!,
      nowMs: 1000,
    });
    expect(plan2.alreadyExpired).toBe(true);
    const second = applyPremiumWorkExpiryPlans({ works, plans: [plan2] });
    expect(second.expired).toBe(0);
  });
});
