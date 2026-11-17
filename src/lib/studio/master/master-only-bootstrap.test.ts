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

  it("creates project, uploads stem, places at 0", async () => {
    const stages: string[] = [];
    const created = doc([track({ id: "b", trackType: "BEAT" }), track({ id: "v", trackType: "VOCAL" })], 3);
    const placed = doc(
      [track({ id: "b", trackType: "BEAT" }), track({ id: "v", trackType: "VOCAL" })],
      4,
    );
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/studio/projects") {
        return new Response(JSON.stringify({ success: true, document: created }), { status: 201 });
      }
      if (String(url).includes("/record/place")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { timelineStartMs?: number; trackId?: string };
        expect(body.timelineStartMs).toBe(0);
        expect(body.trackId).toBe("v");
        return new Response(JSON.stringify({ success: true, document: placed }), { status: 200 });
      }
      throw new Error(`unexpected ${url}`);
    });
    const file = new File([new Uint8Array([1, 2, 3])], "mix.wav", { type: "audio/wav" });
    const result = await bootstrapMasterOnlyProject({
      file,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      uploadStem: async () => ({
        takeId: "take-1",
        beatId: "",
        status: "READY" as const,
        durationSeconds: 12,
        byteSize: 3,
        contentType: "audio/wav",
      }),
      onStage: (s) => stages.push(s),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.projectId).toBe("proj-1");
      expect(result.takeId).toBe("take-1");
      expect(result.documentVersion).toBe(4);
    }
    expect(stages).toEqual(["create", "upload", "place"]);
  });

  it("rejects unsupported file before network", async () => {
    const file = new File([new Uint8Array([1])], "x.txt", { type: "text/plain" });
    const result = await bootstrapMasterOnlyProject({
      file,
      fetchImpl: async () => {
        throw new Error("should not fetch");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("gate");
  });
});
