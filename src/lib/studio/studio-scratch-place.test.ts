import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { copyCatalogAndPlaceStudioClip } from "@/lib/studio/studio-scratch-place";

const CLIP = {
  id: "clip-1",
  trackId: "track-1",
  sourceKind: "TAKE" as const,
  sourceTakeId: "take-1",
  sourceBeatId: null,
  sourceArtifactId: null,
  timelineStartMs: 0,
  durationMs: 1200,
  sourceOffsetMs: 0,
  gainDb: 0,
  muted: false,
  fadeInMs: 0,
  fadeOutMs: 0,
};

describe("copyCatalogAndPlaceStudioClip", () => {
  it("reuses catalog copy then existing record/place — TAKE clip only", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "/api/catalog/copy") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            takeId: "take-1",
            catalogAssetId: "asset-1",
            reusedExisting: true,
          }),
        };
      }
      expect(url).toBe("/api/studio/projects/proj-1/record/place");
      return {
        ok: true,
        status: 201,
        json: async () => ({
          clip: CLIP,
          documentVersion: 4,
          reusedExisting: false,
        }),
      };
    });

    const result = await copyCatalogAndPlaceStudioClip(
      {
        projectId: "proj-1",
        catalogAssetId: "asset-1",
        trackId: "track-1",
        timelineStartMs: 0,
        expectedDocumentVersion: 3,
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.takeId).toBe("take-1");
      expect(result.clip.sourceKind).toBe("TAKE");
      expect(result.clip.sourceTakeId).toBe("take-1");
      expect(result.documentVersion).toBe(4);
      expect(result.reusedExistingCopy).toBe(true);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const copyInit = fetchImpl.mock.calls[0]![1] as { body: string };
    expect(JSON.parse(copyInit.body)).toEqual({
      catalogAssetId: "asset-1",
      projectId: "proj-1",
    });
  });

  it("stops before place when copy fails closed", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        error: "CATALOG_ASSET_NOT_COPYABLE",
        message: "Ten sample nie jest dostępny do kopiowania.",
      }),
    }));

    const result = await copyCatalogAndPlaceStudioClip(
      {
        projectId: "proj-1",
        catalogAssetId: "asset-1",
        trackId: "track-1",
        timelineStartMs: 0,
        expectedDocumentVersion: 1,
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Ten sample nie jest dostępny do kopiowania.",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-integer playhead before any network", async () => {
    const fetchImpl = vi.fn();
    const result = await copyCatalogAndPlaceStudioClip(
      {
        projectId: "proj-1",
        catalogAssetId: "asset-1",
        trackId: "track-1",
        timelineStartMs: 1.5,
        expectedDocumentVersion: 1,
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("recording panel reuses catalog copy helper + existing place, no second engine", () => {
    const panel = readFileSync(
      join(process.cwd(), "src/components/studio/studio-recording-panel.tsx"),
      "utf8",
    );
    expect(panel).toMatch(/copyCatalogAndPlaceStudioClip/);
    expect(panel).toMatch(/StudioScratchPanel/);
    expect(panel).not.toMatch(/new StudioAudioEngine/);
    expect(panel).not.toMatch(/new AudioContext/);
  });
});
