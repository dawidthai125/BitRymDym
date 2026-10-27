import { describe, expect, it } from "vitest";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import {
  CATALOG_ASSET_NOT_COPYABLE,
  CATALOG_CONTENT_GATE_NOT_IMPLEMENTED,
  CATALOG_COPY_WRITE_FORBIDDEN,
  CATALOG_REQUIRED_STORAGE_POLICIES,
  CATALOG_STORAGE_POLICIES_UNAVAILABLE,
  catalogCopyErrorHttpStatus,
  evaluateCatalogOriginalContentGate,
  evaluateCatalogOriginalDeclaredGates,
  evaluateCatalogStorageReadiness,
  prepareCatalogAssetCopy,
  unknownCatalogStorageReadiness,
} from "@/lib/catalog/catalog-originals";
import {
  BEAT_AUDIO_BUCKET,
  CATALOG_ORIGINAL_MAX_BYTES,
  CATALOG_ORIGINAL_MAX_SECONDS,
  buildCatalogOriginalObjectKey,
} from "@/lib/beats/audio-validation";

const CATALOG_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

const VALID_INPUT = {
  catalogAssetId: CATALOG_ID,
  projectId: PROJECT_ID,
  contentType: "audio/wav",
  byteSize: 2048,
  durationSeconds: 12,
};

const READY_SNAPSHOT = {
  prodApplyConfirmed: true,
  catalogAssetsTablePresent: true,
  storagePolicyNames: CATALOG_REQUIRED_STORAGE_POLICIES,
};

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

describe("catalog copy fail-closed planner", () => {
  it("defaults to policies/prod unavailable and never allows writes", () => {
    expect(evaluateCatalogOriginalContentGate()).toEqual({
      ok: false,
      error: CATALOG_CONTENT_GATE_NOT_IMPLEMENTED,
    });
    expect(evaluateCatalogStorageReadiness(unknownCatalogStorageReadiness())).toEqual({
      ok: false,
      error: CATALOG_STORAGE_POLICIES_UNAVAILABLE,
      details: [
        "prod apply is not confirmed",
        "catalog_assets table is missing or unknown",
        "storage policy names were not probed",
      ],
    });

    const prepared = prepareCatalogAssetCopy(VALID_INPUT);
    expect(prepared.ok).toBe(false);
    expect(prepared.error).toBe(CATALOG_STORAGE_POLICIES_UNAVAILABLE);
    expect(prepared.write).toEqual({
      allowed: false,
      sourceBucket: BEAT_AUDIO_BUCKET,
      sourceObjectKey: buildCatalogOriginalObjectKey(CATALOG_ID),
      destBucket: TAKE_AUDIO_BUCKET,
      destObjectKey: null,
    });
    expect(catalogCopyErrorHttpStatus(prepared.error)).toBe(503);
  });

  it("fail-closes when a required Storage policy is missing even after apply", () => {
    const prepared = prepareCatalogAssetCopy(VALID_INPUT, {
      readiness: {
        prodApplyConfirmed: true,
        catalogAssetsTablePresent: true,
        storagePolicyNames: CATALOG_REQUIRED_STORAGE_POLICIES.slice(0, 3),
      },
    });
    expect(prepared.error).toBe(CATALOG_STORAGE_POLICIES_UNAVAILABLE);
    expect(prepared.details).toContain(
      "missing storage policy catalog_originals_service_delete",
    );
    expect(prepared.write?.allowed).toBe(false);
    expect(prepared.write?.destObjectKey).toBeNull();
  });

  it("fail-closes unpublished or unlicensed assets without inventing a dest key", () => {
    const unpublished = prepareCatalogAssetCopy(VALID_INPUT, {
      readiness: READY_SNAPSHOT,
      catalogAsset: { publishState: "DRAFT", licenseAllowsCopy: true },
    });
    expect(unpublished.error).toBe(CATALOG_ASSET_NOT_COPYABLE);
    expect(unpublished.write?.allowed).toBe(false);
    expect(catalogCopyErrorHttpStatus(unpublished.error)).toBe(409);

    const unlicensed = prepareCatalogAssetCopy(VALID_INPUT, {
      readiness: READY_SNAPSHOT,
      catalogAsset: { publishState: "PUBLISHED", licenseAllowsCopy: false },
    });
    expect(unlicensed.error).toBe(CATALOG_ASSET_NOT_COPYABLE);
    expect(unlicensed.write?.destObjectKey).toBeNull();
  });

  it("still blocks writes after declared+policy+license gates (content sniff)", () => {
    const prepared = prepareCatalogAssetCopy(VALID_INPUT, {
      readiness: READY_SNAPSHOT,
      catalogAsset: { publishState: "PUBLISHED", licenseAllowsCopy: true },
    });
    expect(prepared.ok).toBe(false);
    expect(prepared.error).toBe(CATALOG_CONTENT_GATE_NOT_IMPLEMENTED);
    expect(prepared.details).toEqual([CATALOG_COPY_WRITE_FORBIDDEN]);
    expect(prepared.write?.allowed).toBe(false);
    expect(prepared.write?.destObjectKey).toBeNull();
    expect(catalogCopyErrorHttpStatus(prepared.error)).toBe(501);
  });

  it("rejects invalid project id before any write intent", () => {
    const prepared = prepareCatalogAssetCopy({
      ...VALID_INPUT,
      projectId: "not-a-uuid",
    });
    expect(prepared).toEqual({
      ok: false,
      error: "VALIDATION_FAILED",
      details: ["projectId must be a uuid"],
      write: null,
    });
    expect(catalogCopyErrorHttpStatus(prepared.error)).toBe(400);
  });
});
