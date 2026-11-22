import { beforeEach, describe, expect, it, vi } from "vitest";

const takes = vi.fn();
const plans = vi.fn();
vi.mock("@/lib/email/notify/take-expiry-notice", () => ({ runTakeExpiryNotices: () => takes() }));
vi.mock("@/lib/email/notify/plan-expiry-notice", () => ({ runPlanExpiryNotices: () => plans() }));

import { GET } from "./route";

const req = (auth?: string) => new Request("https://x/api/cron/takes-expiry-notice", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/cron/takes-expiry-notice", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    takes.mockReset();
    plans.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  it("rejects without the cron secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect(takes).not.toHaveBeenCalled();
    expect(plans).not.toHaveBeenCalled();
  });
  it("runs take notices, then plan notices, and returns both counts", async () => {
    takes.mockResolvedValue({ candidates: 2, mails: 1, results: { sent: 1 } });
    plans.mockResolvedValue({ candidates: 3, mails: 2, results: { sent: 2 } });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, candidates: 2, mails: 1, results: { sent: 1 }, plans: { candidates: 3, mails: 2, results: { sent: 2 } } });
  });
  it("a plan failure does not fail the take result", async () => {
    takes.mockResolvedValue({ candidates: 0, mails: 0, results: {} });
    plans.mockRejectedValue(new Error("db"));
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect((await res.json()).plans).toEqual({ error: "Plan expiry notice failed." });
  });
  it("plan notices still run when take notices fail", async () => {
    takes.mockRejectedValue(new Error("db"));
    plans.mockResolvedValue({ candidates: 1, mails: 1, results: { sent: 1 } });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(500);
    expect((await res.json()).plans).toEqual({ candidates: 1, mails: 1, results: { sent: 1 } });
    expect(plans).toHaveBeenCalledTimes(1);
  });
});
