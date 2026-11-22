import { beforeEach, describe, expect, it, vi } from "vitest";

import { findLiveCatalogWork } from "@/lib/catalog/catalog-service";
import { allowWorkClipHit, loadLiveWorkClipKey, signWorkClip } from "@/lib/catalog/work-clip-server";

vi.mock("@/lib/catalog/catalog-service", () => ({ findLiveCatalogWork: vi.fn() }));
vi.mock("@/lib/catalog/work-clip-server", () => ({
  allowWorkClipHit: vi.fn(),
  loadLiveWorkClipKey: vi.fn(),
  signWorkClip: vi.fn(),
}));

const findMock = vi.mocked(findLiveCatalogWork);
const allowMock = vi.mocked(allowWorkClipHit);
const keyMock = vi.mocked(loadLiveWorkClipKey);
const signMock = vi.mocked(signWorkClip);

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const WORK = {
  id: ID, title: "Numer", ownerId: "o", author: "Autor", allowRatings: false, allowComments: false, inRankings: false,
  publishedAt: "2026-11-22T10:00:00.000Z",
};

async function get(id = ID) {
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/api/catalog/works/${id}/clip`, { headers: { "x-real-ip": "1.2.3.4" } }), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/catalog/works/[id]/clip", () => {
  beforeEach(() => {
    findMock.mockReset();
    allowMock.mockReset().mockResolvedValue(true);
    keyMock.mockReset();
    signMock.mockReset();
  });

  it("work not live (withdrawn / unknown) → 404, nothing signed, no rate-limit hit", async () => {
    findMock.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(allowMock).not.toHaveBeenCalled();
    expect(keyMock).not.toHaveBeenCalled();
    expect(signMock).not.toHaveBeenCalled();
  });

  it("clip not cut yet → 404 with the pending state", async () => {
    findMock.mockResolvedValue(WORK);
    keyMock.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "clip_pending", state: "pending" });
    expect(signMock).not.toHaveBeenCalled();
  });

  it("rate limited → 429 before the clip is looked up", async () => {
    findMock.mockResolvedValue(WORK);
    allowMock.mockResolvedValue(false);
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(keyMock).not.toHaveBeenCalled();
  });

  it("ready clip → 302 to the signed clip URL, privately cached, per-IP limited", async () => {
    findMock.mockResolvedValue(WORK);
    keyMock.mockResolvedValue({ key: "studio-master/u/p/j/out/master_clip.mp3", seconds: 45 });
    signMock.mockResolvedValue("https://storage.example/clip.mp3?token=x");
    const res = await get();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://storage.example/clip.mp3?token=x");
    expect(res.headers.get("cache-control")).toMatch(/^private, max-age=\d+$/);
    expect(allowMock).toHaveBeenCalledWith(ID, "1.2.3.4");
    expect(signMock).toHaveBeenCalledWith("studio-master/u/p/j/out/master_clip.mp3");
  });

  it("signing failure → 503, not a redirect", async () => {
    findMock.mockResolvedValue(WORK);
    keyMock.mockResolvedValue({ key: "studio-master/u/p/j/out/master_clip.mp3", seconds: 45 });
    signMock.mockResolvedValue(null);
    expect((await get()).status).toBe(503);
  });
});
