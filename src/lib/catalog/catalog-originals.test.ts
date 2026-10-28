import { describe, expect, it } from "vitest";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import {
  CATALOG_ASSET_NOT_COPYABLE,
  CATALOG_CONTENT_BYTES_REQUIRED,
  CATALOG_CONTENT_EMPTY,
  CATALOG_CONTENT_TYPE_MISMATCH,
  CATALOG_CONTENT_UNSUPPORTED,
  CATALOG_COPY_FAILED,
  CATALOG_NOT_FOUND,
  CATALOG_PROJECT_NO_BEAT,
  CATALOG_REQUIRED_STORAGE_POLICIES,
  CATALOG_STORAGE_POLICIES_UNAVAILABLE,
  CATALOG_TAKE_CAP,
  buildCatalogCopyTakeTitle,
  catalogCopyErrorHttpStatus,
  catalogCopyUserMessage,
  evaluateCatalogOriginalContentGate,
  evaluateCatalogOriginalDeclaredGates,
  evaluateCatalogStorageReadiness,
  parseCatalogCopyTakeTitle,
  prepareCatalogAssetCopy,
  unknownCatalogStorageReadiness,
} from "@/lib/catalog/catalog-originals";
import { buildUserTakeObjectKey } from "@/lib/takes/object-key";
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

const READY_ASSET = { publishState: "PUBLISHED", licenseAllowsCopy: true };

function wavBytes(): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);
  return bytes;
}

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
    expect(
      evaluateCatalogOriginalContentGate({ declaredContentType: "audio/wav" }),
    ).toEqual({
      ok: false,
      error: CATALOG_CONTENT_BYTES_REQUIRED,
      details: ["original bytes are required for content sniff"],
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

  it("rejects missing, empty, spoofed, and unsupported original bytes", () => {
    const missing = prepareCatalogAssetCopy(VALID_INPUT, {
      readiness: READY_SNAPSHOT,
      catalogAsset: READY_ASSET,
    });
    expect(missing.error).toBe(CATALOG_CONTENT_BYTES_REQUIRED);
    expect(catalogCopyErrorHttpStatus(missing.error)).toBe(415);

    const empty = prepareCatalogAssetCopy(VALID_INPUT, {
      readiness: READY_SNAPSHOT,
      catalogAsset: READY_ASSET,
      originalBytes: new Uint8Array(),
    });
    expect(empty.error).toBe(CATALOG_CONTENT_EMPTY);
    expect(catalogCopyErrorHttpStatus(empty.error)).toBe(415);

    const spoof = prepareCatalogAssetCopy(VALID_INPUT, {
      readiness: READY_SNAPSHOT,
      catalogAsset: READY_ASSET,
      originalBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    });
    expect(spoof.error).toBe(CATALOG_CONTENT_UNSUPPORTED);
    expect(catalogCopyErrorHttpStatus(spoof.error)).toBe(415);

    const mismatch = prepareCatalogAssetCopy(
      { ...VALID_INPUT, contentType: "audio/mpeg" },
      {
        readiness: READY_SNAPSHOT,
        catalogAsset: READY_ASSET,
        originalBytes: wavBytes(),
      },
    );
    expect(mismatch.error).toBe(CATALOG_CONTENT_TYPE_MISMATCH);
    expect(mismatch.write?.allowed).toBe(false);
    expect(mismatch.write?.destObjectKey).toBeNull();
  });

  it("authorizes write after sniff without inventing a dest key", () => {
    const prepared = prepareCatalogAssetCopy(VALID_INPUT, {
      readiness: READY_SNAPSHOT,
      catalogAsset: READY_ASSET,
      originalBytes: wavBytes(),
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.write.allowed).toBe(true);
    expect(prepared.write.destObjectKey).toBeNull();
    expect(prepared.write.sourceObjectKey).toBe(
      buildCatalogOriginalObjectKey(CATALOG_ID),
    );
  });

  it("mints dest TAKE key only from a claimed owner/take pair", () => {
    const takeId = "22222222-2222-4222-8222-222222222222";
    const ownerId = "33333333-3333-4333-8333-333333333333";
    const prepared = prepareCatalogAssetCopy(VALID_INPUT, {
      readiness: READY_SNAPSHOT,
      catalogAsset: READY_ASSET,
      originalBytes: wavBytes(),
      dest: { ownerId, takeId },
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.write).toEqual({
      allowed: true,
      sourceBucket: BEAT_AUDIO_BUCKET,
      sourceObjectKey: buildCatalogOriginalObjectKey(CATALOG_ID),
      destBucket: TAKE_AUDIO_BUCKET,
      destObjectKey: buildUserTakeObjectKey({ ownerId, takeId }),
    });
  });

  it("stores catalog provenance in the existing take title", () => {
    const title = buildCatalogCopyTakeTitle({
      catalogAssetId: CATALOG_ID,
      projectId: PROJECT_ID,
    });
    expect(title).toBe(`catalog:${CATALOG_ID}:${PROJECT_ID}`);
    expect(parseCatalogCopyTakeTitle(title)).toEqual({
      catalogAssetId: CATALOG_ID,
      projectId: PROJECT_ID,
    });
    expect(parseCatalogCopyTakeTitle("Nagranie")).toBeNull();
  });

  it("maps copy runtime errors to fail-closed HTTP statuses", () => {
    expect(catalogCopyErrorHttpStatus(CATALOG_NOT_FOUND)).toBe(404);
    expect(catalogCopyErrorHttpStatus(CATALOG_PROJECT_NO_BEAT)).toBe(409);
    expect(catalogCopyErrorHttpStatus(CATALOG_TAKE_CAP)).toBe(409);
    expect(catalogCopyErrorHttpStatus(CATALOG_COPY_FAILED)).toBe(500);
    expect(catalogCopyErrorHttpStatus("UNAUTHENTICATED")).toBe(401);
    expect(catalogCopyUserMessage(CATALOG_PROJECT_NO_BEAT)).toMatch(/bit/i);
    expect(catalogCopyUserMessage(CATALOG_TAKE_CAP)).toMatch(/limit/i);
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
