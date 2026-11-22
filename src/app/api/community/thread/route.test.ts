import { describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/community/thread/route";
import { getCurrentProfile } from "@/lib/auth/session";
import { loadThread } from "@/lib/community/community-service";

vi.mock("@/lib/auth/session", () => ({ getCurrentProfile: vi.fn(async () => null) }));
vi.mock("@/lib/community/community-service", () => ({ loadThread: vi.fn() }));

const ID = "11111111-2222-4333-8444-555555555555";

describe("GET /api/community/thread", () => {
  it("answers JSON 500 when the database read throws", async () => {
    vi.mocked(loadThread).mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(new Request(`http://localhost/api/community/thread?kind=beat&id=${ID}`));
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ result: "error" });
    error.mockRestore();
  });

  it("passes the viewer through", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValueOnce({ userId: "u1" } as never);
    vi.mocked(loadThread).mockResolvedValue({ enabled: true } as never);
    const response = await GET(new Request(`http://localhost/api/community/thread?kind=work&id=${ID}`));
    expect(response.status).toBe(200);
    expect(loadThread).toHaveBeenCalledWith("work", ID, "u1");
  });

  it("rejects an unknown kind", async () => {
    expect((await GET(new Request(`http://localhost/api/community/thread?kind=x&id=${ID}`))).status).toBe(400);
  });
});
