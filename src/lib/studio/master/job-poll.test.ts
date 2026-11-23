import { describe, expect, it, vi } from "vitest";

import { followStudioJob, masterErrorKey, refusalCode } from "./job-poll";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const run = (steps: Array<() => Response | Promise<Response>>, extra: Parameters<typeof followStudioJob>[2] = {}) => {
  let t = 0;
  const fetchImpl = vi.fn(async () => {
    const step = steps.length > 1 ? steps.shift()! : steps[0]!;
    return step();
  });
  return followStudioJob("p", "j", { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async (ms) => void (t += ms), now: () => t, ...extra });
};
const job = (status: string, more: object = {}) => json({ job: { status, ...more } });

describe("followStudioJob", () => {
  it("a dropped network, 429 and 500 do not end the job", async () => {
    const seen: boolean[] = [];
    const out = await run(
      [() => job("running"), () => Promise.reject(new TypeError("network")), () => new Response("slow down", { status: 429 }), () => json({}, 500), () => job("running"), () => job("succeeded")],
      { onConnection: (ok) => seen.push(ok) },
    );
    expect(out.kind).toBe("succeeded");
    expect(seen).toEqual([false, true]);
  });

  it("only a server answer ends it: failed, missing, signed out", async () => {
    expect(await run([() => job("failed", { errorCode: "doc_changed" })])).toMatchObject({ kind: "failed", code: "doc_changed" });
    expect(await run([() => json({}, 404)])).toEqual({ kind: "missing" });
    expect(await run([() => json({}, 401)])).toEqual({ kind: "signed_out" });
  });

  it("a long queue is pending, not failed; abort stops the loop", async () => {
    expect(await run([() => job("queued")], { maxWaitMs: 60_000 })).toEqual({ kind: "pending" });
    const c = new AbortController();
    expect(await run([() => { c.abort(); return job("queued"); }], { signal: c.signal })).toEqual({ kind: "aborted" });
  });
});

describe("error keys", () => {
  it("maps server, worker and transport codes", () => {
    expect(masterErrorKey("Take_session_expired.")).toBe("sourceMissing");
    expect(masterErrorKey("reference_unreadable")).toBe("referenceInvalid");
    expect(masterErrorKey("addon_missing")).toBe("referenceLocked");
    expect(masterErrorKey("quota_unavailable")).toBe("server");
    expect(masterErrorKey("whatever")).toBe("other");
    expect(refusalCode(429, undefined)).toBe("rate_limited");
    expect(refusalCode(429, "monthly_limit")).toBe("monthly_limit");
    expect(refusalCode(500, "Coś poszło nie tak")).toBe("internal");
    expect(refusalCode(401, "Zaloguj się")).toBe("signed_out");
  });
});
