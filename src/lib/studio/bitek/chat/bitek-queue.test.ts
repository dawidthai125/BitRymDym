import { describe, expect, it, vi } from "vitest";
import { bitekQueueProvider, type BitekQueueDb } from "./queue-provider";
import { decideBitekWorkerConfig, processOneBitekJob } from "./llm-worker";

const noSleep = async () => undefined;

function db(statuses: { status: string; result: string | null }[]): BitekQueueDb & { expired: string[] } {
  let i = 0;
  const expired: string[] = [];
  return {
    expired,
    insertJob: vi.fn(async () => "job-1"),
    readJob: async () => ({ ...(statuses[Math.min(i++, statuses.length - 1)]), error_code: null }),
    expireJob: async (id) => void expired.push(id),
  };
}

describe("bitekQueueProvider", () => {
  it("returns the result once the worker marks it done", async () => {
    const d = db([{ status: "queued", result: null }, { status: "running", result: null }, { status: "done", result: '{"reply":"ok"}' }]);
    const p = bitekQueueProvider({ db: d, sleep: noSleep });
    expect(p.id).toBe("e3");
    await expect(p.complete([{ role: "user", content: "x" }], new AbortController().signal)).resolves.toBe('{"reply":"ok"}');
  });
  it("maps error status to a server error", async () => {
    const p = bitekQueueProvider({ db: db([{ status: "error", result: null }]), sleep: noSleep });
    await expect(p.complete([], new AbortController().signal)).rejects.toMatchObject({ kind: "server" });
  });
  it("expires the job on timeout", async () => {
    const d = db([{ status: "queued", result: null }]);
    const p = bitekQueueProvider({ db: d, timeoutMs: 30, pollMs: 10 });
    await expect(p.complete([], new AbortController().signal)).rejects.toMatchObject({ kind: "timeout" });
    expect(d.expired).toEqual(["job-1"]);
  });
  it("treats enqueue failure as network error", async () => {
    const d = db([]);
    d.insertJob = async () => {
      throw new Error("x");
    };
    const p = bitekQueueProvider({ db: d, sleep: noSleep });
    await expect(p.complete([], new AbortController().signal)).rejects.toMatchObject({ kind: "network" });
  });
});

describe("bitek llm worker", () => {
  const base = { BITEK_LLM_WORKER_ENABLED: "true", BITEK_LLM_TOKEN: "tok" };
  it("kill switch / token / localhost-only", () => {
    expect(decideBitekWorkerConfig({}, 1).action).toBe("exit_disabled");
    expect(decideBitekWorkerConfig({ BITEK_LLM_WORKER_ENABLED: "true" }, 1).action).toBe("exit_disabled");
    expect(decideBitekWorkerConfig({ ...base, BITEK_LLM_URL: "https://evil.example/v1" }, 1).action).toBe("exit_disabled");
    const cfg = decideBitekWorkerConfig(base, 7);
    expect(cfg).toMatchObject({ action: "run", llmUrl: "http://127.0.0.1:8091/v1", workerRef: "e3-bitek-7", pollMs: 300 });
  });
  it("processes a job and completes it with the model content", async () => {
    const cfg = decideBitekWorkerConfig(base, 1);
    if (cfg.action !== "run") throw new Error();
    const complete = vi.fn(async () => true);
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"hej"}' } }], usage: { completion_tokens: 5 } })),
    ) as unknown as typeof fetch;
    const logs: Record<string, unknown>[] = [];
    const handled = await processOneBitekJob(cfg, {
      claim: async () => ({ id: "j", messages: [{ role: "user", content: "sekret" }], expires_at: new Date(Date.now() + 20000).toISOString() }),
      complete,
      fetchFn,
      log: (e) => logs.push(e),
    });
    expect(handled).toBe(true);
    expect(complete).toHaveBeenCalledWith("j", '{"reply":"hej"}', null);
    expect(JSON.stringify(logs)).not.toContain("sekret");
    const [, init] = (fetchFn as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
  it("rejects bad payloads and reports llm errors", async () => {
    const cfg = decideBitekWorkerConfig(base, 1);
    if (cfg.action !== "run") throw new Error();
    const complete = vi.fn(async () => true);
    await processOneBitekJob(cfg, { claim: async () => ({ id: "a", messages: { x: 1 }, expires_at: "" }), complete });
    expect(complete).toHaveBeenLastCalledWith("a", null, "bad_payload");
    await processOneBitekJob(cfg, {
      claim: async () => ({ id: "b", messages: [{ role: "user", content: "x" }], expires_at: "" }),
      complete,
      fetchFn: (async () => new Response("no", { status: 503 })) as unknown as typeof fetch,
    });
    expect(complete).toHaveBeenLastCalledWith("b", null, "http_503");
    expect(await processOneBitekJob(cfg, { claim: async () => null, complete })).toBe(false);
  });
});
