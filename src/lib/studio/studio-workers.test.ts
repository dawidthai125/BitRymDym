import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStudioWorkersForTests, spawnStudioWorker, STUDIO_WORKER_READY } from "./studio-workers";

type Fake = {
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: { preventDefault?: () => void }) => void) | null;
  terminate: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
};

function fakeWorker(): Fake {
  return { onmessage: null, onerror: null, terminate: vi.fn(), postMessage: vi.fn() };
}

describe("spawnStudioWorker", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_STUDIO_MASTER_WORKER_URL", "/workers/master.worker.abc.js");
    vi.stubEnv("NEXT_PUBLIC_STUDIO_MIX_ANALYSIS_WORKER_URL", "");
    resetStudioWorkersForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("resolves the worker once it reports ready", async () => {
    const w = fakeWorker();
    const urls: string[] = [];
    const p = spawnStudioWorker("master", { create: (url) => (urls.push(url), w as unknown as Worker) });
    w.onmessage?.({ data: { type: STUDIO_WORKER_READY } });
    await expect(p).resolves.toBe(w);
    expect(urls).toEqual(["/workers/master.worker.abc.js"]);
    expect(w.terminate).not.toHaveBeenCalled();
  });

  it("returns null (main-thread fallback) when the script fails to load, and stops retrying", async () => {
    const w = fakeWorker();
    const create = vi.fn(() => w as unknown as Worker);
    const p = spawnStudioWorker("master", { create });
    w.onerror?.({ preventDefault: () => {} });
    await expect(p).resolves.toBeNull();
    expect(w.terminate).toHaveBeenCalled();
    await expect(spawnStudioWorker("master", { create })).resolves.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("returns null when the worker never reports ready", async () => {
    vi.useFakeTimers();
    const w = fakeWorker();
    const p = spawnStudioWorker("master", { create: () => w as unknown as Worker, timeoutMs: 50 });
    vi.advanceTimersByTime(60);
    await expect(p).resolves.toBeNull();
    expect(w.terminate).toHaveBeenCalled();
  });

  it("returns null without a built worker URL", async () => {
    const create = vi.fn();
    await expect(spawnStudioWorker("mixAnalysis", { create })).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns null when the constructor throws", async () => {
    await expect(
      spawnStudioWorker("master", {
        create: () => {
          throw new Error("SecurityError");
        },
      }),
    ).resolves.toBeNull();
  });
});
