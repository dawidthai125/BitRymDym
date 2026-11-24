import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSeparateJob } from "./separate-client";

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
