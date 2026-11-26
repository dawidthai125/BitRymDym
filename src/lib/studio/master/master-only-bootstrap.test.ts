import { describe, expect, it, vi } from "vitest";

import {
  bootstrapMasterOnlyProject,
  pickVocalTrackId,
} from "@/lib/studio/master/master-only-bootstrap";
import type { StudioProjectDocument, StudioTrackDto } from "@/lib/studio/studio-types";

function track(partial: Partial<StudioTrackDto> & Pick<StudioTrackDto, "id" | "trackType">): StudioTrackDto {
  return {
    projectId: "p1",
    name: "t",
    trackRole: partial.trackType === "VOCAL" ? "lead_vocal" : "beat",
    sortOrder: 0,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    recordArmed: false,
    inputDeviceHint: null,
    outputRoute: "master",
    effectsChain: { schemaVersion: 1, effects: [] },
    ...partial,
  } as StudioTrackDto;
}

function doc(tracks: StudioTrackDto[], version = 1): StudioProjectDocument {
  return {
    project: {
      id: "proj-1",
      title: "Master only",
      status: "DRAFT",
      tempoBpm: 90,
      timelineLengthMs: 240000,
      beatId: null,
      updatedAt: "",
      createdAt: "",
      timeSignatureNum: 4,
      timeSignatureDen: 4,
      masterGainDb: 0,
      masterPan: 0,
      masterFxChain: { schemaVersion: 1, effects: [] },
      documentVersion: version,
      schemaVersion: 1,
    },
    tracks,
    clips: [],
  } as StudioProjectDocument;
}

describe("master-only bootstrap", () => {
  it("picks VOCAL track", () => {
    expect(
      pickVocalTrackId([
        track({ id: "b", trackType: "BEAT" }),
        track({ id: "v", trackType: "VOCAL" }),
      ]),
    ).toBe("v");
  });

  const created = doc([track({ id: "b", trackType: "BEAT" }), track({ id: "v", trackType: "VOCAL" })], 3);
  const wav = () => new File([new Uint8Array([1, 2, 3])], "mix.wav", { type: "audio/wav" });
  const uploaded = { takeId: "take-1", beatId: "", status: "READY" as const, durationSeconds: 12, byteSize: 3, contentType: "audio/wav" };
  /** The real answers: POST projects → document, record/place → clip + documentVersion (no document). */
  function server(place: () => Response) {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === "/api/studio/projects") {
        expect(JSON.parse(String(init?.body)).beatId).toBeNull();
        return new Response(JSON.stringify({ success: true, document: created }), { status: 201 });
      }
      if (url.endsWith("/record/place")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        expect(body).toMatchObject({ timelineStartMs: 0, trackId: "v", takeId: "take-1", expectedDocumentVersion: 3 });
        return place();
      }
      if (init?.method === "DELETE") return new Response(JSON.stringify({ success: true }), { status: 200 });
      throw new Error(`unexpected ${url}`);
    });
    return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
  }

  it("creates a project without a beat, uploads the stem, places it at 0", async () => {
    const stages: string[] = [];
    const s = server(() => new Response(JSON.stringify({ success: true, clip: { id: "c" }, takeId: "take-1", documentVersion: 4 }), { status: 201 }));
    const uploadStem = vi.fn(async () => uploaded);
    const result = await bootstrapMasterOnlyProject({ rightsAccepted: true, file: wav(), fetchImpl: s.fetchImpl, uploadStem, probeDuration: async () => 12, onStage: (x) => stages.push(x) });
    expect(result).toEqual({ ok: true, projectId: "proj-1", trackId: "v", takeId: "take-1", documentVersion: 4 });
    expect(uploadStem).toHaveBeenCalledWith(expect.objectContaining({ projectId: "proj-1", masterOnly: true }));
    expect(stages).toEqual(["create", "upload", "place"]);
    expect(s.calls.some((c) => c.startsWith("DELETE"))).toBe(false);
  });

  it("a failed upload or place deletes the project it made", async () => {
    for (const [uploadStem, place, code] of [
      [async () => { throw new Error("Osiągnięto limit stemów w projekcie (8)."); }, () => new Response("{}"), "upload"],
      [async () => { throw new TypeError("Failed to fetch"); }, () => new Response("{}"), "network"],
      [async () => uploaded, () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }), "place"],
      [async () => uploaded, () => new Response(JSON.stringify({ success: true }), { status: 201 }), "place"],
    ] as const) {
      const s = server(place);
      const result = await bootstrapMasterOnlyProject({ rightsAccepted: true, file: wav(), fetchImpl: s.fetchImpl, uploadStem, probeDuration: async () => null });
      expect(result).toMatchObject({ ok: false, code });
      if (!result.ok) expect(result.message === null || /limit stemów/.test(result.message)).toBe(true);
      expect(s.calls.at(-1)).toBe("DELETE /api/studio/projects/proj-1");
    }
  });

  it("refuses a wrong, too big or too long file before any request", async () => {
    const never = (async () => {
      throw new Error("should not fetch");
    }) as unknown as typeof fetch;
    const run = (file: File, seconds: number | null = null) => bootstrapMasterOnlyProject({ rightsAccepted: true, file, fetchImpl: never, probeDuration: async () => seconds });
    expect(await run(new File([new Uint8Array([1])], "x.txt", { type: "text/plain" }))).toMatchObject({ ok: false, code: "format" });
    expect(await run(wav(), 260)).toMatchObject({ ok: false, code: "too_long" });
    const big = wav();
    Object.defineProperty(big, "size", { value: 49 * 1024 * 1024 });
    expect(await run(big)).toMatchObject({ ok: false, code: "too_big" });
    // A normal 4-minute WAV (about 42 MB) is fine.
    const song = wav();
    Object.defineProperty(song, "size", { value: 42 * 1024 * 1024 });
    const s = server(() => new Response(JSON.stringify({ documentVersion: 4 }), { status: 201 }));
    expect((await bootstrapMasterOnlyProject({ rightsAccepted: true, file: song, fetchImpl: s.fetchImpl, uploadStem: async () => uploaded, probeDuration: async () => 239.6 })).ok).toBe(true);
  });
});
