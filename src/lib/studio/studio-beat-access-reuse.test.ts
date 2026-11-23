import { afterEach, describe, expect, it, vi } from "vitest";

import {
  reuseStudioBeatAccess,
  type StudioBeatAccessCache,
} from "@/lib/studio/studio-beat-session-source";

const source = (url: string, ttl = 600_000) => ({ url, expiresAt: Date.now() + ttl });

afterEach(() => {
  vi.useRealTimers();
});

describe("beat access requests", () => {
  it("concurrent and repeated calls share one request for the TTL", async () => {
    vi.useFakeTimers();
    const cache: StudioBeatAccessCache = new Map();
    const request = vi.fn(async () => source("a"));
    const ask = () => reuseStudioBeatAccess({ cache, beatId: "b", ttlMs: 90_000, request });
    const [x, y] = await Promise.all([ask(), ask()]);
    expect(x?.url).toBe("a");
    expect(y?.url).toBe("a");
    await ask();
    expect(request).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(90_001);
    await Promise.all([ask(), ask()]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("an expiring address is requested again, once", async () => {
    const cache: StudioBeatAccessCache = new Map();
    const request = vi
      .fn<() => Promise<ReturnType<typeof source>>>()
      .mockResolvedValueOnce(source("old", 1000))
      .mockResolvedValue(source("new"));
    const ask = () => reuseStudioBeatAccess({ cache, beatId: "b", ttlMs: 90_000, request });
    await ask();
    const results = await Promise.all([ask(), ask()]);
    expect(results.map((r) => r?.url)).toEqual(["new", "new"]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("refusal and error are not remembered", async () => {
    const cache: StudioBeatAccessCache = new Map();
    const request = vi
      .fn<() => Promise<ReturnType<typeof source> | null>>()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValue(source("ok"));
    const ask = () => reuseStudioBeatAccess({ cache, beatId: "b", ttlMs: 90_000, request });
    expect(await ask()).toBeNull();
    await expect(ask()).rejects.toThrow("net");
    expect((await ask())?.url).toBe("ok");
  });
});
