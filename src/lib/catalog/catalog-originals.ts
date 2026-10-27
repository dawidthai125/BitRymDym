import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  BEAT_AUDIO_BUCKET,
  buildCatalogOriginalObjectKey,
  validateCatalogOriginalUploadMeta,
  validateObjectKey,
} from "@/lib/beats/audio-validation";

export const CATALOG_COPY_NOT_IMPLEMENTED = "COPY_NOT_IMPLEMENTED" as const;
export const CATALOG_CONTENT_GATE_NOT_IMPLEMENTED =
  "CATALOG_CONTENT_GATE_NOT_IMPLEMENTED" as const;
export const CATALOG_STORAGE_POLICIES_UNAVAILABLE =
  "CATALOG_STORAGE_POLICIES_UNAVAILABLE" as const;
export const CATALOG_ASSET_NOT_COPYABLE = "CATALOG_ASSET_NOT_COPYABLE" as const;
export const CATALOG_COPY_WRITE_FORBIDDEN = "CATALOG_COPY_WRITE_FORBIDDEN" as const;

export const CATALOG_ASSETS_TABLE = "catalog_assets";

/** Names from repo migration `20261027220000` — required before any Storage write. */
export const CATALOG_REQUIRED_STORAGE_POLICIES = [
  "catalog_originals_service_select",
  "catalog_originals_service_insert",
  "catalog_originals_service_update",
  "catalog_originals_service_delete",
] as const;

export type CatalogOriginalDeclaredInput = {
  catalogAssetId: string;
  contentType: string;
  byteSize: number;
  durationSeconds: number;
};

/**
 * Declared OD-SC-02 gates (MIME + bytes + duration + key shape).
 * Real-file content sniff is a separate fail-closed gate.
 */
export function evaluateCatalogOriginalDeclaredGates(
  input: CatalogOriginalDeclaredInput,
): { ok: true; objectKey: string } | { ok: false; errors: string[] } {
  if (!isUuid(input.catalogAssetId)) {
    return { ok: false, errors: ["catalogAssetId must be a uuid"] };
  }
  const objectKey = buildCatalogOriginalObjectKey(input.catalogAssetId);
  const keyErr = validateObjectKey(objectKey);
  if (keyErr) {
    return { ok: false, errors: [keyErr] };
  }
  const meta = validateCatalogOriginalUploadMeta({
    contentType: input.contentType,
    byteSize: input.byteSize,
    durationSeconds: input.durationSeconds,
  });
  if (!meta.ok) {
    return meta;
  }
  return { ok: true, objectKey };
}

/** Fourth OD-SC-02 gate — not implemented; never treat client MIME as content proof. */
export function evaluateCatalogOriginalContentGate(): {
  ok: false;
  error: typeof CATALOG_CONTENT_GATE_NOT_IMPLEMENTED;
} {
  return { ok: false, error: CATALOG_CONTENT_GATE_NOT_IMPLEMENTED };
}

export type CatalogCopyRequest = CatalogOriginalDeclaredInput & {
  projectId: string;
};

export type CatalogStorageReadinessSnapshot = {
  prodApplyConfirmed: boolean;
  catalogAssetsTablePresent: boolean | null;
  storagePolicyNames: readonly string[] | null;
};

export function unknownCatalogStorageReadiness(): CatalogStorageReadinessSnapshot {
  return {
    prodApplyConfirmed: false,
    catalogAssetsTablePresent: null,
    storagePolicyNames: null,
  };
}

export function evaluateCatalogStorageReadiness(
  snapshot: CatalogStorageReadinessSnapshot,
):
  | { ok: true }
  | {
      ok: false;
      error: typeof CATALOG_STORAGE_POLICIES_UNAVAILABLE;
      details: string[];
    } {
  const details: string[] = [];
  if (snapshot.prodApplyConfirmed !== true) {
    details.push("prod apply is not confirmed");
  }
  if (snapshot.catalogAssetsTablePresent !== true) {
    details.push("catalog_assets table is missing or unknown");
  }
  if (snapshot.storagePolicyNames == null) {
    details.push("storage policy names were not probed");
  } else {
    const present = new Set(snapshot.storagePolicyNames);
    for (const name of CATALOG_REQUIRED_STORAGE_POLICIES) {
      if (!present.has(name)) {
        details.push(`missing storage policy ${name}`);
      }
    }
  }
  if (details.length > 0) {
    return {
      ok: false,
      error: CATALOG_STORAGE_POLICIES_UNAVAILABLE,
      details,
    };
  }
  return { ok: true };
}

export type CatalogAssetCopyEligibility = {
  publishState: string;
  licenseAllowsCopy: boolean;
};

export function evaluateCatalogAssetCopyEligibility(
  asset: CatalogAssetCopyEligibility | null,
):
  | { ok: true }
  | { ok: false; error: typeof CATALOG_ASSET_NOT_COPYABLE; details: string[] } {
  if (asset == null) {
    return {
      ok: false,
      error: CATALOG_ASSET_NOT_COPYABLE,
      details: ["catalog asset was not loaded"],
    };
  }
  if (asset.publishState !== "PUBLISHED") {
    return {
      ok: false,
      error: CATALOG_ASSET_NOT_COPYABLE,
      details: ["catalog asset is not PUBLISHED"],
    };
  }
  if (asset.licenseAllowsCopy !== true) {
    return {
      ok: false,
      error: CATALOG_ASSET_NOT_COPYABLE,
      details: ["license does not allow copy"],
    };
  }
  return { ok: true };
}

export type CatalogCopyWriteIntent = {
  allowed: false;
  sourceBucket: typeof BEAT_AUDIO_BUCKET;
  sourceObjectKey: string;
  destBucket: typeof TAKE_AUDIO_BUCKET;
  destObjectKey: null;
};

/** Intended Storage pair only — never invents a take id and never writes. */
export function planCatalogCopyWrites(
  sourceObjectKey: string,
): CatalogCopyWriteIntent {
  return {
    allowed: false,
    sourceBucket: BEAT_AUDIO_BUCKET,
    sourceObjectKey,
    destBucket: TAKE_AUDIO_BUCKET,
    destObjectKey: null,
  };
}

export type CatalogCopyContext = {
  readiness?: CatalogStorageReadinessSnapshot;
  catalogAsset?: CatalogAssetCopyEligibility | null;
};

export type CatalogCopyPrepareResult = {
  ok: false;
  error: string;
  details?: string[];
  write: CatalogCopyWriteIntent | null;
};

/**
 * Platform catalog → private TAKE copy planner.
 * Fail-closed: missing policies/prod, missing asset, or unimplemented
 * content sniff → safe error. Zero Storage/DB writes.
 */
export function prepareCatalogAssetCopy(
  input: CatalogCopyRequest,
  context: CatalogCopyContext = {},
): CatalogCopyPrepareResult {
  if (!isUuid(input.projectId)) {
    return {
      ok: false,
      error: "VALIDATION_FAILED",
      details: ["projectId must be a uuid"],
      write: null,
    };
  }
  const declared = evaluateCatalogOriginalDeclaredGates(input);
  if (!declared.ok) {
    return {
      ok: false,
      error: "VALIDATION_FAILED",
      details: declared.errors,
      write: null,
    };
  }

  const write = planCatalogCopyWrites(declared.objectKey);
  const readiness = evaluateCatalogStorageReadiness(
    context.readiness ?? unknownCatalogStorageReadiness(),
  );
  if (!readiness.ok) {
    return {
      ok: false,
      error: readiness.error,
      details: readiness.details,
      write,
    };
  }

  const eligibility = evaluateCatalogAssetCopyEligibility(
    context.catalogAsset ?? null,
  );
  if (!eligibility.ok) {
    return {
      ok: false,
      error: eligibility.error,
      details: eligibility.details,
      write,
    };
  }

  const content = evaluateCatalogOriginalContentGate();
  return {
    ok: false,
    error: content.error,
    details: [CATALOG_COPY_WRITE_FORBIDDEN],
    write,
  };
}

export function catalogCopyErrorHttpStatus(error: string): number {
  if (error === "VALIDATION_FAILED") {
    return 400;
  }
  if (error === CATALOG_STORAGE_POLICIES_UNAVAILABLE) {
    return 503;
  }
  if (error === CATALOG_ASSET_NOT_COPYABLE) {
    return 409;
  }
  return 501;
}
