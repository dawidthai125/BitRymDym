import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appendChild = vi.fn();
let w: Record<string, unknown>;

async function fresh(cookie: string) {
  vi.resetModules();
  w = { location: { hostname: "www.bitrymdym.pl" } };
  vi.stubGlobal("window", w);
  vi.stubGlobal("document", { cookie, createElement: () => ({}), head: { appendChild } });
  return import("@/lib/analytics/ga");
}
const layer = () => ((w.dataLayer as ArrayLike<unknown>[]) ?? []).map((a) => Array.from(a));

beforeEach(() => appendChild.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("Google Analytics events", () => {
  it("sends nothing and loads nothing without consent or on a staff device", async () => {
    for (const cookie of ["", "brd_consent=necessary", "brd_consent=all; brd_staff=1"]) {
      const ga = await fresh(cookie);
      ga.trackEvent({ name: "sign_up", params: { method: "email" } });
      ga.loadAnalytics("n");
      expect(appendChild).not.toHaveBeenCalled();
      expect(w.dataLayer).toBeUndefined();
    }
  });

  it("keeps an event raised before Analytics loads, after the config call", async () => {
    const ga = await fresh("brd_consent=all");
    ga.trackEvent({ name: "purchase", params: ga.purchaseEvent("plan_silver", 2999) });
    ga.loadAnalytics("n");
    ga.trackEvent({ name: "beat_play", params: { beat_id: "b", beat_title: "T" } });
    expect(layer().map((a) => a.slice(0, 2))).toEqual([
      ["consent", "default"],
      ["js", expect.any(Date)],
      ["config", expect.any(String)],
      ["event", "purchase"],
      ["event", "beat_play"],
    ]);
    expect(layer()[3]![2]).toEqual({ currency: "PLN", value: 29.99, items: [{ item_name: "plan_silver", quantity: 1, price: 29.99 }] });
    expect(appendChild).toHaveBeenCalledTimes(1);
  });

  it("drops what was waiting when staff opens the panel", async () => {
    const ga = await fresh("brd_consent=all");
    ga.trackEvent({ name: "sign_up", params: { method: "email" } });
    ga.stopAnalyticsOnThisPage();
    ga.loadAnalytics("n");
    expect(layer().some((a) => a[0] === "event")).toBe(false);
    expect(Object.keys(w).some((k) => k.startsWith("ga-disable-G-") && w[k] === true)).toBe(true);
  });
});
