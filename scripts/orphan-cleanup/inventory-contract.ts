/**
 * Orphan inventory wire-format + validation (phases 2–3).
 * Contract: docs/operations/ORPHAN_CLEANUP_INVENTORY_CLASSIFICATION_DESIGN.md
 * schema_version: orphan-inv-v1
 */
import { createHash } from "node:crypto";

export const ORPHAN_INVENTORY_SCHEMA_VERSION = "orphan-inv-v1" as const;
export const ORPHAN_INVENTORY_BUCKET = "beat-audio" as const;

export type OrphanInventoryListingStatus =
  | "in_progress"
  | "complete"
  | "incomplete"
  | "failed";

export type OrphanPathKind = "user" | "platform" | "catalog" | "other";

export type OrphanInventoryObject = {
  object_path: string;
  size_bytes: number | null;
  created_at: string | null;
};

export type OrphanInventoryDocument = {
  schema_version: typeof ORPHAN_INVENTORY_SCHEMA_VERSION;
  bucket: typeof ORPHAN_INVENTORY_BUCKET;
  prefix_scope: OrphanPathKind[];
  environment_id: string;
  listing_status: OrphanInventoryListingStatus;
  listing_started_at: string;
  listing_finished_at: string | null;
  page_size: number;
  pages_completed: number;
  objects_accumulated: number;
  pagination_mechanism: string;
  end_condition: string | null;
  key_set_digest_alg: "sha256";
  key_set_digest: string;
  counts_by_path_kind: Record<OrphanPathKind, number>;
  objects: OrphanInventoryObject[];
  /** Present when status is incomplete/failed — never use for final classify. */
  diagnostic_only?: boolean;
  failure_reason?: string;
};

export type OrphanInventoryValidationError = {
  code: string;
  message: string;
};

export function pathKindOf(objectPath: string): OrphanPathKind {
  if (objectPath.startsWith("user/")) return "user";
  if (objectPath.startsWith("platform/")) return "platform";
  if (objectPath.startsWith("catalog/")) return "catalog";
  return "other";
}

/** Opaque log/ref token — not anonymization; parties who know the path can correlate. */
export function pathDigest(objectPath: string): string {
  return createHash("sha256").update(objectPath, "utf8").digest("hex");
}

export function pathDigestPrefix(objectPath: string, len = 12): string {
  return pathDigest(objectPath).slice(0, len);
}

export function computeKeySetDigest(objectPaths: string[]): string {
  const sorted = [...objectPaths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256")
    .update(sorted.join("\n"), "utf8")
    .digest("hex");
}

export function countByPathKind(
  objects: OrphanInventoryObject[],
): Record<OrphanPathKind, number> {
  const counts: Record<OrphanPathKind, number> = {
    user: 0,
    platform: 0,
    catalog: 0,
    other: 0,
  };
  for (const o of objects) {
    counts[pathKindOf(o.object_path)] += 1;
  }
  return counts;
}

export function buildInventoryDocument(params: {
  environmentId: string;
  listingStatus: OrphanInventoryListingStatus;
  listingStartedAt: string;
  listingFinishedAt: string | null;
  pageSize: number;
  pagesCompleted: number;
  paginationMechanism: string;
  endCondition: string | null;
  objects: OrphanInventoryObject[];
  diagnosticOnly?: boolean;
  failureReason?: string;
}): OrphanInventoryDocument {
  const paths = params.objects.map((o) => o.object_path);
  return {
    schema_version: ORPHAN_INVENTORY_SCHEMA_VERSION,
    bucket: ORPHAN_INVENTORY_BUCKET,
    prefix_scope: ["user", "platform", "catalog", "other"],
    environment_id: params.environmentId,
    listing_status: params.listingStatus,
    listing_started_at: params.listingStartedAt,
    listing_finished_at: params.listingFinishedAt,
    page_size: params.pageSize,
    pages_completed: params.pagesCompleted,
    objects_accumulated: params.objects.length,
    pagination_mechanism: params.paginationMechanism,
    end_condition: params.endCondition,
    key_set_digest_alg: "sha256",
    key_set_digest: computeKeySetDigest(paths),
    counts_by_path_kind: countByPathKind(params.objects),
    objects: params.objects,
    ...(params.diagnosticOnly ? { diagnostic_only: true } : {}),
    ...(params.failureReason ? { failure_reason: params.failureReason } : {}),
  };
}

/** Operator-facing summary — no object paths or user UUIDs. */
export function inventorySummaryForLog(doc: OrphanInventoryDocument): Record<
  string,
  unknown
> {
  return {
    schema_version: doc.schema_version,
    bucket: doc.bucket,
    environment_id: doc.environment_id,
    listing_status: doc.listing_status,
    listing_started_at: doc.listing_started_at,
    listing_finished_at: doc.listing_finished_at,
    page_size: doc.page_size,
    pages_completed: doc.pages_completed,
    objects_accumulated: doc.objects_accumulated,
    pagination_mechanism: doc.pagination_mechanism,
    end_condition: doc.end_condition,
    key_set_digest: doc.key_set_digest,
    counts_by_path_kind: doc.counts_by_path_kind,
    diagnostic_only: doc.diagnostic_only === true,
    failure_reason: doc.failure_reason ?? null,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateOrphanInventoryDocument(
  raw: unknown,
): { ok: true; document: OrphanInventoryDocument } | {
  ok: false;
  errors: OrphanInventoryValidationError[];
} {
  const errors: OrphanInventoryValidationError[] = [];
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      errors: [{ code: "not_object", message: "inventory root must be an object" }],
    };
  }
  if (raw.schema_version !== ORPHAN_INVENTORY_SCHEMA_VERSION) {
    errors.push({
      code: "unsupported_schema",
      message: `unsupported schema_version (expected ${ORPHAN_INVENTORY_SCHEMA_VERSION})`,
    });
  }
  if (raw.bucket !== ORPHAN_INVENTORY_BUCKET) {
    errors.push({
      code: "bad_bucket",
      message: `bucket must be ${ORPHAN_INVENTORY_BUCKET}`,
    });
  }
  const status = raw.listing_status;
  if (
    status !== "in_progress" &&
    status !== "complete" &&
    status !== "incomplete" &&
    status !== "failed"
  ) {
    errors.push({
      code: "bad_status",
      message: "listing_status must be in_progress|complete|incomplete|failed",
    });
  }
  if (typeof raw.environment_id !== "string" || !raw.environment_id.trim()) {
    errors.push({
      code: "bad_environment",
      message: "environment_id must be a non-empty non-secret label",
    });
  }
  if (typeof raw.listing_started_at !== "string") {
    errors.push({
      code: "bad_started_at",
      message: "listing_started_at must be a string",
    });
  }
  if (
    raw.listing_finished_at !== null &&
    typeof raw.listing_finished_at !== "string"
  ) {
    errors.push({
      code: "bad_finished_at",
      message: "listing_finished_at must be string or null",
    });
  }
  if (typeof raw.page_size !== "number" || raw.page_size < 1) {
    errors.push({ code: "bad_page_size", message: "page_size must be >= 1" });
  }
  if (typeof raw.pages_completed !== "number" || raw.pages_completed < 0) {
    errors.push({
      code: "bad_pages_completed",
      message: "pages_completed must be >= 0",
    });
  }
  if (typeof raw.pagination_mechanism !== "string") {
    errors.push({
      code: "bad_pagination_mechanism",
      message: "pagination_mechanism must be a string",
    });
  }
  if (raw.end_condition !== null && typeof raw.end_condition !== "string") {
    errors.push({
      code: "bad_end_condition",
      message: "end_condition must be string or null",
    });
  }
  if (raw.key_set_digest_alg !== "sha256") {
    errors.push({
      code: "bad_digest_alg",
      message: "key_set_digest_alg must be sha256",
    });
  }
  if (typeof raw.key_set_digest !== "string" || raw.key_set_digest.length < 16) {
    errors.push({
      code: "bad_digest",
      message: "key_set_digest must be a non-trivial string",
    });
  }
  if (!Array.isArray(raw.objects)) {
    errors.push({ code: "bad_objects", message: "objects must be an array" });
    return { ok: false, errors };
  }
  const objects: OrphanInventoryObject[] = [];
  for (let i = 0; i < raw.objects.length; i++) {
    const row = raw.objects[i];
    if (!isPlainObject(row)) {
      errors.push({
        code: "bad_object_row",
        message: `objects[${i}] must be an object`,
      });
      continue;
    }
    if (typeof row.object_path !== "string" || !row.object_path) {
      errors.push({
        code: "bad_object_path",
        message: `objects[${i}].object_path missing`,
      });
      continue;
    }
    if (
      row.size_bytes !== null &&
      (typeof row.size_bytes !== "number" || !Number.isFinite(row.size_bytes))
    ) {
      errors.push({
        code: "bad_size",
        message: `objects[${i}].size_bytes must be number or null`,
      });
      continue;
    }
    if (row.created_at !== null && typeof row.created_at !== "string") {
      errors.push({
        code: "bad_created_at",
        message: `objects[${i}].created_at must be string or null`,
      });
      continue;
    }
    objects.push({
      object_path: row.object_path,
      size_bytes: row.size_bytes as number | null,
      created_at: row.created_at as string | null,
    });
  }
  if (typeof raw.objects_accumulated !== "number") {
    errors.push({
      code: "bad_objects_accumulated",
      message: "objects_accumulated must be a number",
    });
  } else if (raw.objects_accumulated !== objects.length) {
    errors.push({
      code: "objects_count_mismatch",
      message: "objects_accumulated does not match objects.length",
    });
  }

  const recomputed = computeKeySetDigest(objects.map((o) => o.object_path));
  if (
    typeof raw.key_set_digest === "string" &&
    raw.key_set_digest !== recomputed
  ) {
    errors.push({
      code: "digest_mismatch",
      message: "key_set_digest does not match objects",
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const doc = raw as unknown as OrphanInventoryDocument;
  return { ok: true, document: { ...doc, objects } };
}

/**
 * RULE (Owner GO phases 2–3): partial inventory may exist only as diagnostic
 * incomplete|failed; never accepted for final classification; never promoted to complete after page error.
 */
export function assertInventoryAcceptableForFinalClassify(
  doc: OrphanInventoryDocument,
): void {
  if (doc.schema_version !== ORPHAN_INVENTORY_SCHEMA_VERSION) {
    throw new Error("inventory rejected: unsupported schema_version");
  }
  if (doc.diagnostic_only === true) {
    throw new Error(
      "inventory rejected: diagnostic_only artifact cannot feed final classify",
    );
  }
  if (doc.listing_status !== "complete") {
    throw new Error(
      `inventory rejected: listing_status=${doc.listing_status} (final classify requires complete)`,
    );
  }
  if (!doc.end_condition) {
    throw new Error("inventory rejected: complete inventory requires end_condition");
  }
  if (doc.listing_finished_at == null) {
    throw new Error(
      "inventory rejected: complete inventory requires listing_finished_at",
    );
  }
  const check = validateOrphanInventoryDocument(doc);
  if (!check.ok) {
    throw new Error(
      `inventory rejected: validation failed (${check.errors.map((e) => e.code).join(",")})`,
    );
  }
}

export function parseAndAssertInventoryForFinalClassify(
  raw: unknown,
): OrphanInventoryDocument {
  const parsed = validateOrphanInventoryDocument(raw);
  if (!parsed.ok) {
    const codes = parsed.errors.map((e) => e.code).join(",");
    throw new Error(`inventory rejected: invalid document (${codes})`);
  }
  assertInventoryAcceptableForFinalClassify(parsed.document);
  return parsed.document;
}

/** Test helper: wrap inventory objects as a complete document. */
export function completeInventoryFixture(
  objects: OrphanInventoryObject[],
  environmentId = "test-local",
): OrphanInventoryDocument {
  return buildInventoryDocument({
    environmentId,
    listingStatus: "complete",
    listingStartedAt: "2026-10-25T00:00:00.000Z",
    listingFinishedAt: "2026-10-25T00:00:01.000Z",
    pageSize: 100,
    pagesCompleted: 1,
    paginationMechanism:
      "injected-fixture (NOT a live Storage list; limit/offset semantics NOT VERIFIED for prod)",
    endCondition: "fixture_complete",
    objects,
  });
}
