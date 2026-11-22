import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, PATCH } from "@/app/api/community/comment/route";
import { AuthError, requireUser } from "@/lib/auth/session";
import { deleteOwnComment, hideComment } from "@/lib/community/comment-moderation";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("@/lib/community/comment-moderation", () => ({ deleteOwnComment: vi.fn(), hideComment: vi.fn() }));
vi.mock("@/lib/community/community-service", () => ({ commentTarget: vi.fn() }));

const requireUserMock = vi.mocked(requireUser);
const deleteMock = vi.mocked(deleteOwnComment);
const hideMock = vi.mocked(hideComment);
const ID = "11111111-2222-4333-8444-555555555555";

function request(method: string, body: unknown) {
  return new Request("http://localhost/api/community/comment", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ userId: "u1", profile: { role: "USER", userNumber: 5 } } as never);
});

describe("/api/community/comment moderation", () => {
  it("DELETE someone else's comment → 403", async () => {
    deleteMock.mockResolvedValue("forbidden");
    const response = await DELETE(request("DELETE", { id: ID }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ result: "forbidden" });
    expect(deleteMock).toHaveBeenCalledWith("u1", ID);
  });

  it("DELETE own comment → 200", async () => {
    deleteMock.mockResolvedValue("ok");
    expect((await DELETE(request("DELETE", { id: ID }))).status).toBe(200);
  });

  it("PATCH hide by a non-owner → 403, with the server-side role", async () => {
    hideMock.mockResolvedValue("forbidden");
    const response = await PATCH(request("PATCH", { id: ID, action: "hide", role: "ADMIN" }));
    expect(response.status).toBe(403);
    expect(hideMock).toHaveBeenCalledWith({ userId: "u1", role: "USER", userNumber: 5 }, ID);
  });

  it("PATCH with an unknown action → 400", async () => {
    expect((await PATCH(request("PATCH", { id: ID, action: "pin" }))).status).toBe(400);
    expect(hideMock).not.toHaveBeenCalled();
  });

  it("guest → 401", async () => {
    requireUserMock.mockRejectedValue(new AuthError("UNAUTHENTICATED", "no"));
    expect((await DELETE(request("DELETE", { id: ID }))).status).toBe(401);
    expect((await PATCH(request("PATCH", { id: ID, action: "hide" }))).status).toBe(401);
  });
});
