import { describe, expect, it } from "vitest";

import { KIND_CATEGORY } from "@/lib/email/notify/config";
import { formatPlanExpiryDate, planExpiryWindow, planPlanExpiryMails, type PlanExpiryCandidate } from "@/lib/email/notify/plan-expiry-plan";
import { buildMail } from "@/lib/email/notify/templates";

const NOW = Date.parse("2026-11-22T07:00:00Z");
const H = 3600_000;
const at = (ms: number) => new Date(NOW + ms).toISOString();
const row = (over: Partial<PlanExpiryCandidate> = {}): PlanExpiryCandidate => ({
  id: "e1", userId: "u1", tier: "SILVER", source: "purchase", active: true, expiresAt: at(60 * H), pendingTier: null, notifiedFor: null, ...over,
});

describe("planPlanExpiryMails", () => {
  it("mails a paid purchased plan ending in 2–3 days", () => {
    expect(planPlanExpiryMails([row()], NOW)).toEqual([{ entitlementId: "e1", userId: "u1", expiresAt: at(60 * H) }]);
  });
  it("window edges: (now+2 d, now+3 d]", () => {
    const n = (ms: number) => planPlanExpiryMails([row({ expiresAt: at(ms) })], NOW).length;
    expect(n(48 * H)).toBe(0);
    expect(n(48 * H + 1)).toBe(1);
    expect(n(72 * H)).toBe(1);
    expect(n(72 * H + 1)).toBe(0);
    expect(n(24 * H)).toBe(0);
  });
  it("a daily run hits each end date once", () => {
    const e = row({ expiresAt: at(50 * H) });
    const hits = [-2, -1, 0, 1, 2].filter((d) => planPlanExpiryMails([e], NOW + d * 24 * H).length > 0);
    expect(hits).toEqual([0]);
  });
  it("skips FREE, admin source, inactive, no end date", () => {
    expect(
      planPlanExpiryMails([row({ tier: "FREE" }), row({ source: "admin" }), row({ active: false }), row({ expiresAt: null })], NOW),
    ).toEqual([]);
  });
  it("skips when a queued plan exists (already renewed)", () => {
    expect(planPlanExpiryMails([row({ pendingTier: "BRONZE" })], NOW)).toEqual([]);
  });
  it("skips an already warned end date, also in another timestamp format", () => {
    const e = "2026-11-24T19:00:00.123456+00:00";
    expect(planPlanExpiryMails([row({ expiresAt: e, notifiedFor: "2026-11-24T19:00:00.123Z" })], NOW)).toEqual([]);
  });
  it("warns again after an extension (new expires_at)", () => {
    const plan = planPlanExpiryMails([row({ expiresAt: at(60 * H), notifiedFor: at(60 * H - 30 * 24 * H) })], NOW);
    expect(plan.map((m) => m.expiresAt)).toEqual([at(60 * H)]);
  });
  it("keeps the raw DB expires_at for the exact claim", () => {
    const e = "2026-11-24T19:00:00.123456+00:00";
    expect(planPlanExpiryMails([row({ expiresAt: e })], NOW)[0]?.expiresAt).toBe(e);
  });
});

describe("planExpiryWindow", () => {
  it("is now+2 d .. now+3 d", () => {
    expect(planExpiryWindow(NOW)).toEqual({ from: "2026-11-24T07:00:00.000Z", to: "2026-11-25T07:00:00.000Z" });
  });
});

describe("formatPlanExpiryDate", () => {
  it("formats in Polish time, pl and en", () => {
    expect(formatPlanExpiryDate("2026-11-25T06:30:00Z")).toBe("25 listopada o 07:30");
    expect(formatPlanExpiryDate("2026-11-25T06:30:00Z", "en")).toBe("25 November at 07:30");
  });
});

describe("plan_expiring mail", () => {
  it("is an account mail with the end date and a link to /premium", () => {
    expect(KIND_CATEGORY.plan_expiring).toBe("account");
    const m = buildMail("plan_expiring", { siteUrl: "https://www.bitrymdym.pl", detail: "25 listopada o 07:30" }, { unsubscribe: "https://u", preferences: "https://p" });
    expect(m.subject).toBe("Twój plan kończy się za 3 dni");
    expect(m.text).toContain("Twój plan kończy się 25 listopada o 07:30.");
    expect(m.text).toContain("Przedłuż plan: https://www.bitrymdym.pl/premium");
    expect(m.html).toContain("Wypisz się");
  });
});
