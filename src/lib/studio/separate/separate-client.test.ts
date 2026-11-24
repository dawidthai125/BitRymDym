import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSeparateJob, nextSeparatePollMs } from "./separate-client";

const answer = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("fetchSeparateJob", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a failed read is not 'no job'", async () => {
    vi.stubGlobal("fetch", answer(500));
    expect(await fetchSeparateJob("p")).toEqual({ ok: false, reason: "error" });
    vi.stubGlobal("fetch", answer(429));
    expect(await fetchSeparateJob("p")).toEqual({ ok: false, reason: "error" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await fetchSeparateJob("p")).toEqual({ ok: false, reason: "error" });
  });

  it("503 means splitting is switched off", async () => {
    vi.stubGlobal("fetch", answer(503));
    expect(await fetchSeparateJob("p")).toEqual({ ok: false, reason: "off" });
  });

  it("no job and a running job", async () => {
    vi.stubGlobal("fetch", answer(200, { job: null }));
    expect(await fetchSeparateJob("p")).toEqual({ ok: true, job: null });
    const job = { id: "j", status: "running", errorCode: null, stems: null };
    vi.stubGlobal("fetch", answer(200, { job }));
    expect(await fetchSeparateJob("p")).toEqual({ ok: true, job });
  });
});

describe("nextSeparatePollMs", () => {
  const job = (status: "queued" | "running" | "succeeded" | "failed") => ({ ok: true as const, job: { id: "j", status, errorCode: null, stems: null } });
  it("asks every 4 s while the job runs and stops when it ends", () => {
    expect(nextSeparatePollMs(job("queued"), 0)).toBe(4000);
    expect(nextSeparatePollMs(job("running"), 0)).toBe(4000);
    expect(nextSeparatePollMs(job("succeeded"), 0)).toBeNull();
    expect(nextSeparatePollMs({ ok: true, job: null }, 0)).toBeNull();
  });
  it("slows down after failures and stops for a signed-out user", () => {
    expect([1, 2, 3, 9].map((n) => nextSeparatePollMs({ ok: false, reason: "error" }, n))).toEqual([8000, 16000, 30000, 30000]);
    expect(nextSeparatePollMs({ ok: false, reason: "signedOut" }, 1)).toBeNull();
  });
});
