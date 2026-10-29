import { describe, expect, it } from "vitest";
import {
  canRunStudioStructuralOp,
  resolveStudioStructuralOpIds,
  resolveStudioUndoId,
  runStudioStructuralOp,
  type StudioApiCall,
} from "@/lib/studio/studio-undo-structural";
import type { StudioClipDto, StudioProjectDocument, StudioTrackDto } from "@/lib/studio/studio-types";

const track = (id: string, extra: Partial<StudioTrackDto> = {}): StudioTrackDto =>
  ({
    id, projectId: "p", name: id, trackType: "VOCAL", trackRole: "lead_vocal", sortOrder: 1,
    gainDb: 0, pan: 0, muted: false, solo: false, recordArmed: false, inputDeviceHint: null,
    outputRoute: "MASTER", effectsChain: { version: 1, slots: [] }, ...extra,
  }) as unknown as StudioTrackDto;
const clip = (id: string, trackId: string, extra: Partial<StudioClipDto> = {}): StudioClipDto => ({
  id, trackId, sourceKind: "TAKE", sourceTakeId: "take1", sourceBeatId: null, sourceArtifactId: null,
  timelineStartMs: 1000, durationMs: 4000, sourceOffsetMs: 0, gainDb: 0, muted: false,
  fadeInMs: 0, fadeOutMs: 0, ...extra,
});
const doc = (tracks: StudioTrackDto[], clips: StudioClipDto[]): StudioProjectDocument =>
  ({ project: { id: "p", documentVersion: 5 }, tracks, clips }) as unknown as StudioProjectDocument;

function fakeApi(handler: (method: string, path: string, body: Record<string, unknown>) => Record<string, unknown> | null) {
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const api: StudioApiCall = async (method, path, body) => {
    calls.push({ method, path, body });
    const json = handler(method, path, body);
    return json ? { ok: true, status: 200, json } : { ok: false, status: 409, json: { error: "x" } };
  };
  return { api, calls };
}

describe("studio structural undo", () => {
  it("resolves alias chains", () => {
    const m = new Map([["a", "b"], ["b", "c"]]);
    expect(resolveStudioUndoId(m, "a")).toBe("c");
    expect(resolveStudioUndoId(m, "z")).toBe("z");
  });

  it("restores a deleted clip with fades/gain/mute via CAS and aliases the new id", async () => {
    const src = clip("old", "t1", { fadeInMs: 200, gainDb: -3, muted: true });
    let v = 5;
    const { api, calls } = fakeApi((method, path, body) => {
      expect(body.expectedDocumentVersion).toBe(v);
      v += 1;
      if (method === "POST") return { documentVersion: v, clip: clip("new", "t1") };
      const op = body.op as string;
      return { documentVersion: v, clip: clip("new", "t1", op === "set_fades" ? { fadeInMs: 200 } : op === "set_gain" ? { fadeInMs: 200, gainDb: -3 } : { fadeInMs: 200, gainDb: -3, muted: true }) };
    });
    const res = await runStudioStructuralOp({ kind: "clip_restore", clip: src }, { projectId: "p", documentVersion: 5, doc: doc([track("t1")], []), api });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(calls.map((c) => c.body.op ?? c.method)).toEqual(["POST", "set_fades", "set_gain", "set_mute"]);
    expect(res.documentVersion).toBe(9);
    expect(res.partial).toBe(false);
    expect(res.aliases).toEqual([["old", "new"]]);
    const after = res.mutate(doc([track("t1")], []));
    expect(after.clips[0]).toMatchObject({ id: "new", fadeInMs: 200, gainDb: -3, muted: true });
  });

  it("reports partial when a follow-up step fails", async () => {
    let n = 0;
    const { api } = fakeApi(() => (++n === 1 ? { documentVersion: 6, clip: clip("new", "t1") } : null));
    const res = await runStudioStructuralOp({ kind: "clip_restore", clip: clip("old", "t1", { gainDb: -6 }) }, { projectId: "p", documentVersion: 5, doc: doc([track("t1")], []), api });
    expect(res.ok && res.partial).toBe(true);
    expect(res.ok && res.documentVersion).toBe(6);
  });

  it("unsplit deletes right half and restores left geometry + fades", async () => {
    const original = clip("L", "t1", { durationMs: 8000, fadeOutMs: 500 });
    const { api, calls } = fakeApi((method, _p, body) =>
      method === "DELETE" ? { documentVersion: 6, deletedClipId: "R" }
      : body.op === "set_geometry" ? { documentVersion: 7, clip: clip("L", "t1", { durationMs: 8000 }) }
      : { documentVersion: 8, clip: clip("L", "t1", { durationMs: 8000, fadeOutMs: 500 }) });
    const d = doc([track("t1")], [clip("L", "t1"), clip("R", "t1", { timelineStartMs: 5000 })]);
    const res = await runStudioStructuralOp({ kind: "clip_unsplit", leftId: "L", rightId: "R", original }, { projectId: "p", documentVersion: 5, doc: d, api });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "DELETE /api/studio/projects/p/clips/R", "PATCH /api/studio/projects/p/clips/L", "PATCH /api/studio/projects/p/clips/L",
    ]);
    expect(res.ok && res.mutate(d).clips).toEqual([original]);
  });

  it("refuses to remove a track whose clips changed since it was added", () => {
    const d = doc([track("t2")], [clip("rec", "t2")]);
    expect(canRunStudioStructuralOp({ kind: "track_remove", trackId: "t2", clipIds: [] }, d)).toBe(false);
    expect(canRunStudioStructuralOp({ kind: "track_remove", trackId: "t2", clipIds: ["rec"] }, d)).toBe(true);
    expect(canRunStudioStructuralOp({ kind: "track_remove", trackId: "b", clipIds: [] }, doc([track("b", { trackType: "BEAT" })], []))).toBe(false);
  });

  it("redo of add track recreates name and role, redo of duplicate maps clip ids", async () => {
    const want = track("t9", { name: "Adlib 1", trackRole: "adlib" });
    const add = fakeApi((m) => (m === "POST" ? { documentVersion: 6, track: track("n1", { name: "Wokal 2" }) } : { documentVersion: 7, track: track("n1", { name: "Adlib 1", trackRole: "adlib" }) }));
    const r1 = await runStudioStructuralOp({ kind: "track_add", track: want }, { projectId: "p", documentVersion: 5, doc: doc([], []), api: add.api });
    expect(add.calls[1].body).toMatchObject({ name: "Adlib 1", trackRole: "adlib", expectedDocumentVersion: 6 });
    expect(r1.ok && r1.aliases).toEqual([["t9", "n1"]]);

    const dup = fakeApi(() => ({ documentVersion: 6, track: track("d2"), clips: [clip("c2b", "d2", { timelineStartMs: 9000 }), clip("c2a", "d2")] }));
    const r2 = await runStudioStructuralOp({ kind: "track_duplicate", sourceTrackId: "t1", duplicateTrackId: "d1", duplicateClipIds: ["c1a", "c1b"] }, { projectId: "p", documentVersion: 5, doc: doc([track("t1")], []), api: dup.api });
    expect(r2.ok && r2.aliases).toEqual([["d1", "d2"], ["c1a", "c2a"], ["c1b", "c2b"]]);
  });

  it("rewrites ids through aliases before running", () => {
    const op = resolveStudioStructuralOpIds({ kind: "track_remove", trackId: "d1", clipIds: ["c1a"] }, (id) => ({ d1: "d2", c1a: "c2a" })[id] ?? id);
    expect(op).toEqual({ kind: "track_remove", trackId: "d2", clipIds: ["c2a"] });
  });
});
