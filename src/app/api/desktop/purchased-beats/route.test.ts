import { describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/desktop/purchased-beats/route";
import { getCurrentProfile } from "@/lib/auth/session";
import { listPurchasedCatalog } from "@/lib/beats/purchased-catalog";

vi.mock("@/lib/auth/session", () => ({ getCurrentProfile: vi.fn(async () => null) }));
vi.mock("@/lib/beats/purchased-catalog", () => ({ listPurchasedCatalog: vi.fn() }));

describe("GET /api/desktop/purchased-beats", () => {
  it("needs a signed-in account", async () => {
    const response = await GET();
    expect(response.status).toBe(401);
    expect(listPurchasedCatalog).not.toHaveBeenCalled();
  });

  it("lists only this account's bought beats in the recorder's shape, never cached", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValueOnce({ userId: "u1" } as never);
    vi.mocked(listPurchasedCatalog).mockResolvedValueOnce([
      { id: "b1", title: "Kupiony", producer: "BitRymDym", bpm: 85, durationSeconds: 150 },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(listPurchasedCatalog).toHaveBeenCalledWith("u1");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      success: true,
      beats: [{ id: "b1", title: "Kupiony", bpm: 85, durationSeconds: 150 }],
    });
  });

  it("answers JSON 500 when the read fails", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValueOnce({ userId: "u1" } as never);
    vi.mocked(listPurchasedCatalog).mockRejectedValueOnce(new Error("db"));
    const response = await GET();
    expect(response.status).toBe(500);
  });
});
