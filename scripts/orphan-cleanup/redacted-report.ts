/**
 * Default redacted classification report (phase 3).
 * No raw object_path, user UUIDs, batch paths, or secrets.
 */
import {
  pathDigestPrefix,
  pathKindOf,
  type OrphanInventoryDocument,
  type OrphanPathKind,
} from "./inventory-contract";

export const REDACTED_CLASSIFY_REPORT_SCHEMA_VERSION =
  "orphan-inv-class-v1" as const;

export type RedactedClassRowInput = {
  object_path: string;
  path_kind: OrphanPathKind | string;
  classification: "SAFE_DELETE" | "KEEP" | "UNKNOWN" | string;
  size_bytes: number | null;
};

export type RedactedClassifyReport = {
  schema_version: typeof REDACTED_CLASSIFY_REPORT_SCHEMA_VERSION;
  classified_at: string;
  inventory_digest: string;
  inventory_object_count: number;
  summary: {
    total: number;
    SAFE_DELETE: number;
    KEEP: number;
    UNKNOWN: number;
  };
  by_path_kind: Record<
    string,
    { SAFE_DELETE: number; KEEP: number; UNKNOWN: number }
  >;
  size_null_count: number;
  size_outside_fixture_set_count: number;
  inventory_complete: boolean;
  /** Raw DB fetch gate — not a snapshot proof. */
  db_read_complete: boolean;
  /** Exact-count matched fetched length — not a snapshot proof. */
  count_complete: boolean;
  /** Stable PK pages without duplicate/missing ids — not a snapshot proof. */
  pages_consistent: boolean;
  /**
   * Membership frozen for the read. Current mechanism never proves this;
   * always false until a stronger isolation mechanism exists.
   */
  snapshot_consistent: false;
  /**
   * inventory ∧ db_read ∧ count ∧ pages — required for actionable SAFE_DELETE.
   * Does NOT imply snapshot_consistent.
   */
  actionable_gates_pass: boolean;
  integrity: { result: "pass" | "fail"; reason_code: string };
  optional_digest_samples?: {
    SAFE_DELETE: string[];
    UNKNOWN: string[];
  };
};

const emptyKind = () => ({
  SAFE_DELETE: 0,
  KEEP: 0,
  UNKNOWN: 0,
});

export function buildRedactedClassifyReport(params: {
  classifiedAt: string;
  inventory: OrphanInventoryDocument;
  rows: RedactedClassRowInput[];
  inventoryComplete: boolean;
  /** Raw DB completeness flag (not snapshot). */
  dbReadComplete: boolean;
  countComplete: boolean;
  pagesConsistent: boolean;
  /** Always false with current mechanism. */
  snapshotConsistent?: false;
  /** inventory ∧ db ∧ count ∧ pages — SAFE_DELETE gate; not snapshot. */
  actionableGatesPass: boolean;
  fixtureSizes: ReadonlySet<number>;
  integrityPass: boolean;
  integrityReasonCode: string;
  includeDigestSamples?: boolean;
}): RedactedClassifyReport {
  const summary = {
    total: params.rows.length,
    SAFE_DELETE: 0,
    KEEP: 0,
    UNKNOWN: 0,
  };
  const by_path_kind: Record<
    string,
    { SAFE_DELETE: number; KEEP: number; UNKNOWN: number }
  > = {
    user: emptyKind(),
    platform: emptyKind(),
    catalog: emptyKind(),
    other: emptyKind(),
  };
  let size_null_count = 0;
  let size_outside_fixture_set_count = 0;
  const safeSamples: string[] = [];
  const unknownSamples: string[] = [];

  for (const row of params.rows) {
    const cls =
      row.classification === "SAFE_DELETE" ||
      row.classification === "KEEP" ||
      row.classification === "UNKNOWN"
        ? row.classification
        : "UNKNOWN";
    summary[cls] += 1;
    const kind =
      row.path_kind === "user" ||
      row.path_kind === "platform" ||
      row.path_kind === "catalog" ||
      row.path_kind === "other"
        ? row.path_kind
        : pathKindOf(row.object_path);
    if (!by_path_kind[kind]) by_path_kind[kind] = emptyKind();
    by_path_kind[kind][cls] += 1;

    if (row.size_bytes == null) size_null_count += 1;
    else if (
      kind === "user" &&
      !params.fixtureSizes.has(row.size_bytes)
    ) {
      size_outside_fixture_set_count += 1;
    }

    if (params.includeDigestSamples) {
      const dig = pathDigestPrefix(row.object_path, 12);
      if (cls === "SAFE_DELETE" && safeSamples.length < 8) {
        safeSamples.push(dig);
      }
      if (cls === "UNKNOWN" && unknownSamples.length < 8) {
        unknownSamples.push(dig);
      }
    }
  }

  // Hard rule: incomplete gates cannot present actionable SAFE_DELETE as final.
  const actionableBlocked = !params.actionableGatesPass;
  if (actionableBlocked && summary.SAFE_DELETE > 0) {
    // Report may still show pre-suppress counts for audit; callers must zero
    // actionable candidates via suppressSafeDeleteIfIncomplete.
  }

  const report: RedactedClassifyReport = {
    schema_version: REDACTED_CLASSIFY_REPORT_SCHEMA_VERSION,
    classified_at: params.classifiedAt,
    inventory_digest: params.inventory.key_set_digest,
    inventory_object_count: params.inventory.objects_accumulated,
    summary,
    by_path_kind,
    size_null_count,
    size_outside_fixture_set_count,
    inventory_complete: params.inventoryComplete,
    db_read_complete: params.dbReadComplete,
    count_complete: params.countComplete,
    pages_consistent: params.pagesConsistent,
    snapshot_consistent: false,
    actionable_gates_pass: params.actionableGatesPass,
    integrity: {
      result: params.integrityPass && !actionableBlocked ? "pass" : "fail",
      reason_code: actionableBlocked
        ? "incomplete_flags_block_final"
        : params.integrityReasonCode,
    },
  };

  if (params.includeDigestSamples) {
    report.optional_digest_samples = {
      SAFE_DELETE: safeSamples,
      UNKNOWN: unknownSamples,
    };
  }

  return report;
}

/** Strip actionable SAFE_DELETE when completeness flags are false. */
export function suppressSafeDeleteIfIncomplete<T extends { classification: string }>(
  rows: T[],
  inventoryComplete: boolean,
  dbReadComplete: boolean,
): T[] {
  if (inventoryComplete && dbReadComplete) return rows;
  return rows.map((r) =>
    r.classification === "SAFE_DELETE"
      ? { ...r, classification: "UNKNOWN" }
      : r,
  );
}

export function assertNoSensitiveFieldsInReport(
  report: Record<string, unknown>,
): void {
  const blob = JSON.stringify(report);
  if (blob.includes("object_path")) {
    throw new Error("redacted report leaked object_path key");
  }
  if (/"user\/[0-9a-f-]{36}\//i.test(blob)) {
    throw new Error("redacted report leaked user path pattern");
  }
  if (/"paths"\s*:/.test(blob)) {
    throw new Error("redacted report leaked paths field");
  }
}
