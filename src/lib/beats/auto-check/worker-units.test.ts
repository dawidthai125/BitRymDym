import { describe, expect, it, vi } from "vitest";

import { compareFingerprints, parseFpcalcRaw } from "@/lib/beats/auto-check/fingerprint";
import { createAcoustIdProvider, createOwnCatalogProvider, parseAcoustIdResponse } from "@/lib/beats/auto-check/providers";
import { parseVocalScriptOutput } from "@/lib/beats/auto-check/vocal";
import { decideAutoCheckWorkerConfig } from "@/lib/beats/auto-check/worker-env";

function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed | 0; };
}
const r = rng(7);
const A = Array.from({ length: 1500 }, () => r());
const ctx = { beatId: "b1", ownerId: "u1", durationSeconds: 185, rawFingerprint: A, compressedFingerprint: "AQAA" };

describe("fingerprint compare", () => {
  it("identical audio at an offset scores ~1", () => {
    const m = compareFingerprints(A.slice(200, 900), A);
    expect(m.score).toBeGreaterThan(0.99);
    expect(m.matchedSeconds).toBeGreaterThan(80);
    expect(m.offsetSeconds).toBeCloseTo(200 * 0.1238, 0);
  });
  it("tolerates a few flipped bits (re-encode)", () => {
    const noisy = A.map((v, i) => (i % 3 === 0 ? v ^ 0b101 : v));
    expect(compareFingerprints(noisy, A).score).toBeGreaterThan(0.95);
  });
  it("unrelated audio scores ~0", () => {
    const r2 = rng(99);
    const B = Array.from({ length: 1500 }, () => r2());
    expect(compareFingerprints(A, B).score).toBeLessThan(0.05);
  });
  it("parses fpcalc -raw json into signed ints", () => {
    const raw = parseFpcalcRaw(JSON.stringify({ duration: 12.5, fingerprint: [4294967295, 1] }));
    expect(raw.fingerprint).toEqual([-1, 1]);
    expect(() => parseFpcalcRaw("{}")).toThrow();
  });
});

describe("providers", () => {
  it("own catalog reports matches and skips same owner", async () => {
    const p = createOwnCatalogProvider({
      loadCatalog: async () => [
        { beatId: "x", ownerId: "u2", title: "Cudzy", fingerprint: A },
        { beatId: "y", ownerId: "u1", title: "Mój", fingerprint: A },
      ],
    });
    const res = await p.recognize(ctx);
    expect(res.outcome).toBe("match");
    expect(res.matches.map((m) => m.ref)).toEqual(["x"]);
    expect(res.required).toBe(true);
  });
  it("AcoustID without key → not_configured, no network", async () => {
    const fetchImpl = vi.fn();
    const res = await createAcoustIdProvider({ clientKey: undefined, fetchImpl }).recognize(ctx);
    expect(res.outcome).toBe("not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("AcoustID sends fingerprint only and parses results", async () => {
    const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
      expect(String(init?.body)).toContain("fingerprint=AQAA");
      return new Response(JSON.stringify({ status: "ok", results: [{ id: "t1", score: 0.97, recordings: [{ id: "r1", title: "Song", artists: [{ name: "Art" }] }] }] }));
    }) as unknown as typeof fetch;
    const res = await createAcoustIdProvider({ clientKey: "k", fetchImpl }).recognize(ctx);
    expect(res.matches[0]).toMatchObject({ score: 0.97, title: "Song", url: "https://musicbrainz.org/recording/r1" });
  });
  it("AcoustID HTTP error → error outcome", async () => {
    const fetchImpl = vi.fn(async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    expect((await createAcoustIdProvider({ clientKey: "k", fetchImpl }).recognize(ctx)).outcome).toBe("error");
    expect(parseAcoustIdResponse({ status: "error" }).outcome).toBe("error");
  });
});

describe("vocal + env", () => {
  it("parses vocal script output", () => {
    expect(parseVocalScriptOutput('log\n{"ok":true,"ratio":0.1,"windows":[],"prescreen":0.2}')).toMatchObject({ outcome: "ok", ratio: 0.1 });
    expect(parseVocalScriptOutput('{"ok":false,"error":"vocal_timeout"}')).toMatchObject({ outcome: "error", errorCode: "vocal_timeout" });
    expect(parseVocalScriptOutput("garbage").errorCode).toBe("vocal_bad_output");
  });
  it("kill switch defaults off", () => {
    expect(decideAutoCheckWorkerConfig({}, 1).action).toBe("exit_disabled");
    const on = decideAutoCheckWorkerConfig({ BEAT_AUTO_CHECK_ENABLED: "true" }, 42);
    expect(on).toMatchObject({ action: "run", workerRef: "auto-check-42", acoustidKey: undefined });
  });
});
