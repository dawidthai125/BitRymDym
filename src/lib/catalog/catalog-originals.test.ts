import { describe, expect, it } from "vitest";

import {
  CATALOG_CONTENT_GATE_NOT_IMPLEMENTED,
  CATALOG_COPY_NOT_IMPLEMENTED,
  evaluateCatalogOriginalContentGate,
  evaluateCatalogOriginalDeclaredGates,
  prepareCatalogAssetCopy,
} from "@/lib/catalog/catalog-originals";
import {
  CATALOG_ORIGINAL_MAX_BYTES,
  CATALOG_ORIGINAL_MAX_SECONDS,
  buildCatalogOriginalObjectKey,
} from "@/lib/beats/audio-validation";

const CATALOG_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("catalog original declared gates", () => {
  it("accepts OD-SC-02 mpeg/wav/mp4/aac within 20 MiB and 180 s", () => {
    const result = evaluateCatalogOriginalDeclaredGates({
      catalogAssetId: CATALOG_ID,
      contentType: "audio/mpeg",
      byteSize: 1024,
      durationSeconds: 180,
    });
    expect(result).toEqual({
      ok: true,
      objectKey: buildCatalogOriginalObjectKey(CATALOG_ID),
    });
  });

  it("rejects FLAC, oversized bytes, and duration over 180 s", () => {
    expect(
      evaluateCatalogOriginalDeclaredGates({
        catalogAssetId: CATALOG_ID,
        contentType: "audio/flac",
        byteSize: 1024,
        durationSeconds: 10,
      }).ok,
    ).toBe(false);
    expect(
      evaluateCatalogOriginalDeclaredGates({
        catalogAssetId: CATALOG_ID,
        contentType: "audio/mpeg",
        byteSize: CATALOG_ORIGINAL_MAX_BYTES + 1,
        durationSeconds: 10,
      }).ok,
    ).toBe(false);
    expect(
      evaluateCatalogOriginalDeclaredGates({
        catalogAssetId: CATALOG_ID,
        contentType: "audio/mpeg",
        byteSize: 1024,
        durationSeconds: CATALOG_ORIGINAL_MAX_SECONDS + 1,
      }).ok,
    ).toBe(false);
  });
});

describe("catalog copy skeleton", () => {
  it("keeps content sniff and copy fail-closed", () => {
    expect(evaluateCatalogOriginalContentGate()).toEqual({
      ok: false,
      error: CATALOG_CONTENT_GATE_NOT_IMPLEMENTED,
    });
    const prepared = prepareCatalogAssetCopy({
      catalogAssetId: CATALOG_ID,
      projectId: PROJECT_ID,
      contentType: "audio/wav",
      byteSize: 2048,
      durationSeconds: 12,
    });
    expect(prepared.ok).toBe(false);
    expect(prepared.error).toBe(CATALOG_COPY_NOT_IMPLEMENTED);
  });
});
