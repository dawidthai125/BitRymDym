import { describe, expect, it, vi } from "vitest";

import { addSampleToProject, loadSampleProjects, nextFreeStartMs, projectsForSample } from "./use-sample-in-studio";

const P = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function server(tracks: unknown[], clips: unknown[], addTrack: () => Response) {
  const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
  const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (u === `/api/studio/projects/${P}`) return reply(200, { document: { project: { documentVersion: 5 }, tracks, clips } });
    if (u.endsWith("/tracks") && method === "POST") return addTrack();
    if (u.includes("/tracks/")) return reply(200, { documentVersion: 7 });
    if (u.endsWith("/copy")) return reply(200, { takeId: "take" });
    if (u.endsWith("/record/place")) return reply(201, { clip: { id: "c" }, documentVersion: 9 });
    return reply(404, {});
  });
  return { impl: impl as unknown as typeof fetch, calls };
}
const beat = { id: "b", trackType: "BEAT", name: "Bit" };
const vocal = { id: "v", trackType: "VOCAL", name: "Wokal" };

describe("use sample in the Studio", () => {
  it("offers only projects with a beat", () => {
    expect(projectsForSample([{ id: "a", beatId: null }, { id: "b", beatId: "x" }] as never).map((p) => p.id)).toEqual(["b"]);
  });
  it("starts after the last clip of the track", () => {
    const clips = [{ trackId: "v", timelineStartMs: 1000, durationMs: 500 }, { trackId: "v", timelineStartMs: 0, durationMs: 3000.4 }, { trackId: "x", timelineStartMs: 9000, durationMs: 1 }];
    expect(nextFreeStartMs(clips, "v")).toBe(3001);
    expect(nextFreeStartMs(clips, "empty")).toBe(0);
  });
  it("adds a sample track and chains document versions", async () => {
    const s = server([beat, vocal], [], () => reply(200, { track: { id: "s" }, documentVersion: 6 }));
    expect(await addSampleToProject({ projectId: P, sampleId: S }, s.impl)).toEqual({ ok: true });
    expect(s.calls.map((c) => c.body?.expectedDocumentVersion).filter(Boolean)).toEqual([5, 6, 7]);
    expect(s.calls.at(-1)?.body).toMatchObject({ trackId: "s", takeId: "take", timelineStartMs: 0 });
  });
  it("reuses a sample track without touching other tracks", async () => {
    const s = server([beat, vocal, { id: "s", trackType: "SAMPLE", name: "Sample" }], [{ trackId: "s", timelineStartMs: 0, durationMs: 4000 }], () => reply(500, {}));
    expect(await addSampleToProject({ projectId: P, sampleId: S }, s.impl)).toEqual({ ok: true });
    expect(s.calls.some((c) => c.url.includes("/tracks"))).toBe(false);
    expect(s.calls.at(-1)?.body).toMatchObject({ trackId: "s", timelineStartMs: 4000 });
  });
  it("asks before using a vocal track when the plan is full", async () => {
    const s = server([beat, vocal], [{ trackId: "v", timelineStartMs: 0, durationMs: 2000 }], () => reply(403, { error: "limit" }));
    expect(await addSampleToProject({ projectId: P, sampleId: S }, s.impl)).toEqual({ ok: false, kind: "capacity", message: "limit", tracks: [{ id: "v", name: "Wokal" }] });
    expect(s.calls.some((c) => c.url.endsWith("/copy"))).toBe(false);
    expect(await addSampleToProject({ projectId: P, sampleId: S, trackId: "v" }, s.impl)).toEqual({ ok: true });
    expect(s.calls.at(-1)?.body).toMatchObject({ trackId: "v", timelineStartMs: 2000 });
  });
  it("never places on the beat track", async () => {
    const s = server([beat], [], () => reply(403, { error: "limit" }));
    expect(await addSampleToProject({ projectId: P, sampleId: S, trackId: "b" }, s.impl)).toMatchObject({ ok: false, kind: "error" });
  });
  it("reports a lost session", async () => {
    expect(await loadSampleProjects((async () => reply(401, {})) as unknown as typeof fetch)).toBe("auth");
  });
});
