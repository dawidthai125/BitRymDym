import { describe, expect, it } from "vitest";

import { conversionPercent, funnelSince, funnelSteps, paidBreakdown } from "@/lib/funnel/funnel-math";

const order = (over: Partial<Record<string, string | null>>) => ({
  product_kind: null,
  plan_tier: null,
  addon: null,
  pack: null,
  period: "month",
  amount_grosz: 1000,
  status: "paid",
  grant_status: "granted",
  ...over,
});

describe("funnel math", () => {
  it("computes step conversion from the previous step and from views", () => {
    const steps = funnelSteps({ views: 200, clicks: 50, started: 20, paid: 5 });
    expect(steps.map((s) => s.id)).toEqual(["views", "clicks", "started", "paid"]);
    expect(steps[0]).toEqual({ id: "views", count: 200, fromPrevious: null, fromViews: null });
    expect(steps[1]).toMatchObject({ count: 50, fromPrevious: 25, fromViews: 25 });
    expect(steps[2]).toMatchObject({ count: 20, fromPrevious: 40, fromViews: 10 });
    expect(steps[3]).toMatchObject({ count: 5, fromPrevious: 25, fromViews: 2.5 });
  });

  it("returns null percent when the previous step is zero", () => {
    const steps = funnelSteps({ views: 0, clicks: 0, started: 3, paid: 1 });
    expect(steps[1]!.fromPrevious).toBeNull();
    expect(steps[2]!.fromPrevious).toBeNull();
    expect(steps[3]!.fromPrevious).toBeCloseTo(33.3);
    expect(steps[3]!.fromViews).toBeNull();
  });

  it("rounds to one decimal and sanitises bad counts", () => {
    expect(conversionPercent(1, 3)).toBe(33.3);
    expect(conversionPercent(2, 3)).toBe(66.7);
    expect(conversionPercent(-5, 10)).toBe(0);
    expect(conversionPercent(Number.NaN, 10)).toBe(0);
    expect(conversionPercent(5, Number.POSITIVE_INFINITY)).toBeNull();
    // Orders can outnumber clicks (e.g. a lost click); percent may exceed 100.
    expect(conversionPercent(3, 2)).toBe(150);
  });

  it("groups paid orders by product, most first", () => {
    const rows = paidBreakdown([
      order({ product_kind: "plan", plan_tier: "GOLD" }),
      order({ product_kind: "pack", pack: "take" }),
      order({ product_kind: "plan", plan_tier: "GOLD", status: "refunded" }),
      order({ product_kind: "addon", addon: "reference_mastering" }),
      order({ product_kind: "plan", plan_tier: "BRONZE" }),
      order({ product_kind: "weird" }),
    ]);
    expect(rows.map((r) => [r.key, r.count])).toEqual([
      ["plan:GOLD", 2],
      ["addon", 1],
      ["pack:take", 1],
      ["plan:BRONZE", 1],
      ["unknown", 1],
    ]);
    expect(paidBreakdown([])).toEqual([]);
  });

  it("computes the window start", () => {
    expect(funnelSince(7, new Date("2026-11-22T12:00:00.000Z"))).toBe("2026-11-15T12:00:00.000Z");
  });
});
