import { beforeEach, describe, expect, it, vi } from "vitest";

const takes = vi.fn();
const plans = vi.fn();
const nudges = vi.fn();
const report = vi.fn();
vi.mock("@/lib/email/notify/take-expiry-notice", () => ({ runTakeExpiryNotices: () => takes() }));
vi.mock("@/lib/email/notify/plan-expiry-notice", () => ({ runPlanExpiryNotices: () => plans() }));
vi.mock("@/lib/email/notify/no-recording-notice", () => ({ runNoRecordingNotices: () => nudges() }));
vi.mock("@/lib/reports/owner-weekly-report-run", () => ({ runOwnerWeeklyReport: () => report() }));

import { GET } from "./route";

const req = (auth?: string) => new Request("https://x/api/cron/takes-expiry-notice", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/cron/takes-expiry-notice", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    takes.mockReset();
    plans.mockReset();
    nudges.mockReset().mockResolvedValue({ candidates: 0, mails: 0, results: {} });
    report.mockReset().mockResolvedValue({ status: "not_monday" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  it("rejects without the cron secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect(takes).not.toHaveBeenCalled();
    expect(plans).not.toHaveBeenCalled();
    expect(nudges).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
  it("runs take notices, then plan notices, nudges and the owner report, and returns every result", async () => {
    takes.mockResolvedValue({ candidates: 2, mails: 1, results: { sent: 1 } });
    plans.mockResolvedValue({ candidates: 3, mails: 2, results: { sent: 2 } });
    nudges.mockResolvedValue({ candidates: 5, mails: 4, results: { sent: 4 } });
    report.mockResolvedValue({ status: "sent", period: "2026-11-23", recipients: 1 });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      candidates: 2,
      mails: 1,
      results: { sent: 1 },
      plans: { candidates: 3, mails: 2, results: { sent: 2 } },
      noRecording: { candidates: 5, mails: 4, results: { sent: 4 } },
      ownerReport: { status: "sent", period: "2026-11-23", recipients: 1 },
    });
  });
  it("a nudge or report failure does not fail the run or the other steps", async () => {
    takes.mockResolvedValue({ candidates: 0, mails: 0, results: {} });
    plans.mockResolvedValue({ candidates: 0, mails: 0, results: {} });
    nudges.mockRejectedValue(new Error("rpc"));
    report.mockRejectedValue(new Error("rpc"));
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.noRecording).toEqual({ error: "No-recording notice failed." });
    expect(body.ownerReport).toEqual({ error: "Owner weekly report failed." });
    expect(body.plans).toEqual({ candidates: 0, mails: 0, results: {} });
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
    expect(nudges).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(1);
  });
});
