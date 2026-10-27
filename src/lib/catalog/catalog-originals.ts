import { isUuid } from "@/lib/beats/audio-validation";
import {
  buildCatalogOriginalObjectKey,
  validateCatalogOriginalUploadMeta,
  validateObjectKey,
} from "@/lib/beats/audio-validation";

export const CATALOG_COPY_NOT_IMPLEMENTED = "COPY_NOT_IMPLEMENTED" as const;
export const CATALOG_CONTENT_GATE_NOT_IMPLEMENTED =
  "CATALOG_CONTENT_GATE_NOT_IMPLEMENTED" as const;

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

/**
 * Platform catalog → private TAKE copy skeleton.
 * AuthZ + Storage + TAKE write remain OUT until a later GO.
 */
export function prepareCatalogAssetCopy(input: CatalogCopyRequest): {
  ok: false;
  error: string;
  details?: string[];
} {
  if (!isUuid(input.projectId)) {
    return { ok: false, error: "VALIDATION_FAILED", details: ["projectId must be a uuid"] };
  }
  const declared = evaluateCatalogOriginalDeclaredGates(input);
  if (!declared.ok) {
    return { ok: false, error: "VALIDATION_FAILED", details: declared.errors };
  }
  const content = evaluateCatalogOriginalContentGate();
  return {
    ok: false,
    error: CATALOG_COPY_NOT_IMPLEMENTED,
    details: [content.error, declared.objectKey],
  };
}
