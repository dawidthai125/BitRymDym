import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/community/report/route";
import { AuthError, requireUser } from "@/lib/auth/session";
import { reportComment } from "@/lib/community/comment-moderation";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("@/lib/community/comment-moderation", () => ({ reportComment: vi.fn() }));

const requireUserMock = vi.mocked(requireUser);
const reportMock = vi.mocked(reportComment);
const ID = "11111111-2222-4333-8444-555555555555";

function post(body: unknown) {
  return POST(new Request("http://localhost/api/community/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ userId: "u1", profile: { role: "USER" } } as never);
});

describe("POST /api/community/report", () => {
  it("first report → 200 ok", async () => {
    reportMock.mockResolvedValue("ok");
    const response = await post({ id: ID, reason: "spam", details: "reklama" });
    expect(response.status).toBe(200);
    expect(reportMock).toHaveBeenCalledWith("u1", ID, "spam", "reklama");
  });

  it("second report from the same member → 200 already (idempotent)", async () => {
    reportMock.mockResolvedValue("already");
    const response = await post({ id: ID, reason: "spam" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: "already" });
  });

  it("maps limit, own, missing and invalid", async () => {
    reportMock.mockResolvedValueOnce("limit");
    expect((await post({ id: ID, reason: "spam" })).status).toBe(429);
    reportMock.mockResolvedValueOnce("own");
    expect((await post({ id: ID, reason: "spam" })).status).toBe(403);
    reportMock.mockResolvedValueOnce("missing");
    expect((await post({ id: ID, reason: "spam" })).status).toBe(404);
    reportMock.mockResolvedValueOnce("invalid");
    expect((await post({ id: ID, reason: "x" })).status).toBe(400);
  });

  it("guest → 401", async () => {
    requireUserMock.mockRejectedValue(new AuthError("UNAUTHENTICATED", "no"));
    expect((await post({ id: ID, reason: "spam" })).status).toBe(401);
    expect(reportMock).not.toHaveBeenCalled();
  });
});
