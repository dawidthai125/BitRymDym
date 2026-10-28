import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { isUuid } from "@/lib/beats/audio-validation";
import {
  BEAT_AUDIO_BUCKET,
  buildCatalogOriginalObjectKey,
  validateCatalogOriginalContentSniff,
  validateCatalogOriginalUploadMeta,
  validateObjectKey,
} from "@/lib/beats/audio-validation";
import { buildUserTakeObjectKey } from "@/lib/takes/object-key";

export const CATALOG_COPY_NOT_IMPLEMENTED = "COPY_NOT_IMPLEMENTED" as const;
export const CATALOG_CONTENT_BYTES_REQUIRED =
  "CATALOG_CONTENT_BYTES_REQUIRED" as const;
export const CATALOG_CONTENT_EMPTY = "CATALOG_CONTENT_EMPTY" as const;
export const CATALOG_CONTENT_TYPE_MISMATCH =
  "CATALOG_CONTENT_TYPE_MISMATCH" as const;
export const CATALOG_CONTENT_UNSUPPORTED =
  "CATALOG_CONTENT_UNSUPPORTED" as const;
export const CATALOG_STORAGE_POLICIES_UNAVAILABLE =
  "CATALOG_STORAGE_POLICIES_UNAVAILABLE" as const;
export const CATALOG_ASSET_NOT_COPYABLE = "CATALOG_ASSET_NOT_COPYABLE" as const;
export const CATALOG_COPY_WRITE_FORBIDDEN = "CATALOG_COPY_WRITE_FORBIDDEN" as const;
export const CATALOG_NOT_FOUND = "CATALOG_NOT_FOUND" as const;
export const CATALOG_PROJECT_NO_BEAT = "PROJECT_NO_BEAT" as const;
export const CATALOG_SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE" as const;
export const CATALOG_COPY_FAILED = "COPY_FAILED" as const;
export const CATALOG_TAKE_CAP = "TAKE_CAP" as const;

/** v1 provenance on existing `takes.title` — no new column. */
export const CATALOG_COPY_TITLE_PREFIX = "catalog:" as const;

const CATALOG_COPY_TITLE_RE =
  /^catalog:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function buildCatalogCopyTakeTitle(params: {
  catalogAssetId: string;
  projectId: string;
}): string {
  return `${CATALOG_COPY_TITLE_PREFIX}${params.catalogAssetId.toLowerCase()}:${params.projectId.toLowerCase()}`;
}

export function parseCatalogCopyTakeTitle(
  title: string | null | undefined,
): { catalogAssetId: string; projectId: string } | null {
  if (typeof title !== "string") return null;
  const match = CATALOG_COPY_TITLE_RE.exec(title.trim());
  if (!match) return null;
  return {
    catalogAssetId: match[1].toLowerCase(),
    projectId: match[2].toLowerCase(),
  };
}

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

/** Fourth OD-SC-02 gate — magic-byte sniff; never treat client MIME as content proof. */
export function evaluateCatalogOriginalContentGate(params: {
  bytes?: Uint8Array | null;
  declaredContentType: string;
}) {
  return validateCatalogOriginalContentSniff(params);
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

export type CatalogCopyDestBinding = {
  ownerId: string;
  takeId: string;
};

export type CatalogCopyWriteIntent = {
  allowed: boolean;
  sourceBucket: typeof BEAT_AUDIO_BUCKET;
  sourceObjectKey: string;
  destBucket: typeof TAKE_AUDIO_BUCKET;
  destObjectKey: string | null;
};

/**
 * Intended Storage pair. Dest key is minted only from a claimed take id —
 * never invented during fail-closed gates.
 */
export function planCatalogCopyWrites(
  sourceObjectKey: string,
  dest?: CatalogCopyDestBinding | null,
  authorized = false,
): CatalogCopyWriteIntent {
  if (dest) {
    return {
      allowed: true,
      sourceBucket: BEAT_AUDIO_BUCKET,
      sourceObjectKey,
      destBucket: TAKE_AUDIO_BUCKET,
      destObjectKey: buildUserTakeObjectKey(dest),
    };
  }
  return {
    allowed: authorized,
    sourceBucket: BEAT_AUDIO_BUCKET,
    sourceObjectKey,
    destBucket: TAKE_AUDIO_BUCKET,
    destObjectKey: null,
  };
}

export type CatalogCopyContext = {
  readiness?: CatalogStorageReadinessSnapshot;
  catalogAsset?: CatalogAssetCopyEligibility | null;
  /** Server-held original bytes only — never log this payload. */
  originalBytes?: Uint8Array | null;
  dest?: CatalogCopyDestBinding | null;
};

export type CatalogCopyPrepareResult =
  | {
      ok: true;
      write: CatalogCopyWriteIntent;
    }
  | {
      ok: false;
      error: string;
      details?: string[];
      write: CatalogCopyWriteIntent | null;
    };

/**
 * Platform catalog → private TAKE copy planner.
 * Fail-closed: missing policies/prod, missing asset, or content sniff
 * reject → no dest key and allowed=false. Happy path authorizes write;
 * dest key appears only after a claimed take id is supplied.
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

  const blockedWrite = planCatalogCopyWrites(declared.objectKey);
  const readiness = evaluateCatalogStorageReadiness(
    context.readiness ?? unknownCatalogStorageReadiness(),
  );
  if (!readiness.ok) {
    return {
      ok: false,
      error: readiness.error,
      details: readiness.details,
      write: blockedWrite,
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
      write: blockedWrite,
    };
  }

  const content = evaluateCatalogOriginalContentGate({
    bytes: context.originalBytes,
    declaredContentType: input.contentType,
  });
  if (!content.ok) {
    return {
      ok: false,
      error: content.error,
      details: content.details,
      write: blockedWrite,
    };
  }

  return {
    ok: true,
    write: planCatalogCopyWrites(
      declared.objectKey,
      context.dest ?? null,
      true,
    ),
  };
}

export function catalogCopyErrorHttpStatus(error: string): number {
  if (error === "VALIDATION_FAILED") {
    return 400;
  }
  if (error === "UNAUTHENTICATED") {
    return 401;
  }
  if (error === "FORBIDDEN") {
    return 403;
  }
  if (error === "NOT_FOUND" || error === CATALOG_NOT_FOUND) {
    return 404;
  }
  if (error === CATALOG_STORAGE_POLICIES_UNAVAILABLE) {
    return 503;
  }
  if (
    error === CATALOG_ASSET_NOT_COPYABLE ||
    error === CATALOG_PROJECT_NO_BEAT ||
    error === CATALOG_SOURCE_UNAVAILABLE ||
    error === CATALOG_TAKE_CAP ||
    error === "CONFLICT"
  ) {
    return 409;
  }
  if (
    error === CATALOG_CONTENT_BYTES_REQUIRED ||
    error === CATALOG_CONTENT_EMPTY ||
    error === CATALOG_CONTENT_TYPE_MISMATCH ||
    error === CATALOG_CONTENT_UNSUPPORTED
  ) {
    return 415;
  }
  if (error === CATALOG_COPY_FAILED) {
    return 500;
  }
  if (error === CATALOG_COPY_NOT_IMPLEMENTED) {
    return 501;
  }
  return 500;
}

export function catalogCopyUserMessage(error: string): string {
  switch (error) {
    case "VALIDATION_FAILED":
      return "Niepoprawne dane kopii sample.";
    case "UNAUTHENTICATED":
      return "Zaloguj się, aby skopiować sample.";
    case "FORBIDDEN":
      return "Nie masz uprawnień do tej kopii.";
    case "NOT_FOUND":
    case CATALOG_NOT_FOUND:
      return "Ten sample nie istnieje.";
    case CATALOG_STORAGE_POLICIES_UNAVAILABLE:
      return "Kopiowanie sample jest chwilowo niedostępne.";
    case CATALOG_ASSET_NOT_COPYABLE:
      return "Ten sample nie jest dostępny do skopiowania.";
    case CATALOG_PROJECT_NO_BEAT:
      return "Ten projekt nie ma bitu. Dodaj bit, aby skopiować sample.";
    case CATALOG_SOURCE_UNAVAILABLE:
      return "Oryginał sample jest niedostępny.";
    case CATALOG_TAKE_CAP:
      return "Osiągnięto limit nagrań. Usuń albo zastąp istniejące nagranie.";
    case CATALOG_CONTENT_BYTES_REQUIRED:
    case CATALOG_CONTENT_EMPTY:
    case CATALOG_CONTENT_TYPE_MISMATCH:
    case CATALOG_CONTENT_UNSUPPORTED:
      return "Plik sample nie przeszedł kontroli treści.";
    case CATALOG_COPY_FAILED:
      return "Kopiowanie sample nie powiodło się. Nic nie zostało zapisane jako gotowe nagranie.";
    default:
      return "Kopiowanie sample nie powiodło się.";
  }
}
