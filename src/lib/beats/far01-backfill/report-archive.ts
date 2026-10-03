/**
 * FAR-01 durable dry-run JSON report / archive (IA-4 / B-PDR-04).
 *
 * Read-only evidence writer — no DB/Storage mutation capability.
 * Never archives secrets, tokens, private keys, or signed URLs.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Far01InventorySnapshot } from "./loader";
import type { Far01HistoricalDelta, Far01InventoryRefreshResult } from "./inventory-refresh";
import type {
  Far01AssetTelemetry,
  Far01BackfillAuthorization,
  Far01BatchSummary,
  Far01ExecutionMode,
} from "./types";

const SECRET_KEY_RE =
  /(password|secret|token|apikey|api_key|private[_-]?key|authorization|service[_-]?role|bearer|cookie)/i;

const SECRET_VALUE_RE =
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/;

export type Far01DryRunArchiveDocument = {
  schema: "far01-prod-dry-run-archive/v1";
  batch_id: string;
  mode: Far01ExecutionMode;
  git_sha: string;
  operator_id: string;
  started_at: string;
  finished_at: string;
  inventory: Far01InventorySnapshot;
  counts: {
    total: number;
    migrate: number;
    skip: number;
    quarantine: number;
    fail: number;
    owner_review: number;
  };
  live_mutations_attempted: number;
  authorization: Far01BackfillAuthorization;
  summary: {
    batch_id: string;
    mode: Far01ExecutionMode;
    total: number;
    migrate: number;
    skip: number;
    quarantine: number;
    fail: number;
    owner_review: number;
    live_mutations_attempted: number;
  };
  assets: Far01AssetTelemetry[];
  failures: Far01AssetTelemetry[];
  retries: Far01AssetTelemetry[];
  remnant: {
    SKIP: Far01AssetTelemetry[];
    QUARANTINE: Far01AssetTelemetry[];
    FAIL: Far01AssetTelemetry[];
    OWNER_REVIEW: Far01AssetTelemetry[];
  };
  historical_delta: Far01HistoricalDelta | null;
  inventory_assets?: Far01InventoryRefreshResult["assets"];
  notices: string[];
};

export function buildFar01DryRunArchiveDocument(params: {
  summary: Far01BatchSummary;
  gitSha: string;
  operatorId: string;
  inventory: Far01InventorySnapshot;
  historicalDelta?: Far01HistoricalDelta | null;
  inventoryAssets?: Far01InventoryRefreshResult["assets"];
}): Far01DryRunArchiveDocument {
  if (params.summary.mode !== "DRY_RUN") {
    throw new Error("Archive refused: mode must be DRY_RUN");
  }
  if (params.summary.live_mutations_attempted !== 0) {
    throw new Error(
      `Archive refused: live_mutations_attempted=${params.summary.live_mutations_attempted} (must be 0)`,
    );
  }
  if (!params.operatorId || !params.operatorId.trim()) {
    throw new Error("Archive refused: operator_id required");
  }
  if (!params.gitSha || !params.gitSha.trim()) {
    throw new Error("Archive refused: git_sha required");
  }

  const assets = [...params.summary.assets].sort((a, b) => {
    if (a.started_at !== b.started_at) {
      return a.started_at < b.started_at ? -1 : 1;
    }
    return a.asset_id < b.asset_id ? -1 : a.asset_id > b.asset_id ? 1 : 0;
  });

  const failures = assets.filter(
    (a) =>
      a.action === "FAIL" ||
      a.status === "FAIL" ||
      (a.failure_reason != null && a.failure_reason.length > 0 && a.action !== "SKIP"),
  );
  const retries = assets.filter((a) => a.retry_count > 0);

  const doc: Far01DryRunArchiveDocument = {
    schema: "far01-prod-dry-run-archive/v1",
    batch_id: params.summary.batch_id,
    mode: "DRY_RUN",
    git_sha: params.gitSha.trim(),
    operator_id: params.operatorId.trim(),
    started_at: params.summary.started_at,
    finished_at: params.summary.finished_at,
    inventory: params.inventory,
    counts: {
      total: params.summary.total,
      migrate: params.summary.migrate,
      skip: params.summary.skip,
      quarantine: params.summary.quarantine,
      fail: params.summary.fail,
      owner_review: params.summary.owner_review,
    },
    live_mutations_attempted: 0,
    authorization: params.summary.authorization,
    summary: {
      batch_id: params.summary.batch_id,
      mode: "DRY_RUN",
      total: params.summary.total,
      migrate: params.summary.migrate,
      skip: params.summary.skip,
      quarantine: params.summary.quarantine,
      fail: params.summary.fail,
      owner_review: params.summary.owner_review,
      live_mutations_attempted: 0,
    },
    assets,
    failures,
    retries,
    remnant: {
      SKIP: assets.filter((a) => a.action === "SKIP"),
      QUARANTINE: assets.filter((a) => a.action === "QUARANTINE"),
      FAIL: assets.filter((a) => a.action === "FAIL"),
      OWNER_REVIEW: assets.filter((a) => a.action === "OWNER_REVIEW"),
    },
    historical_delta: params.historicalDelta ?? null,
    inventory_assets: params.inventoryAssets,
    notices: [
      "READ-ONLY DRY_RUN archive — no Storage COPY / DB mutation.",
      "OD-BF-08 Backfill GO = NO.",
      "This document is not production execution proof unless produced by an authorized ops run.",
    ],
  };

  assertNoSecretsInArchive(doc);
  return doc;
}

export function assertNoSecretsInArchive(value: unknown, trail = "$"): void {
  if (value == null) return;
  if (typeof value === "string") {
    if (SECRET_VALUE_RE.test(value)) {
      throw new Error(`Archive refused: secret-like value at ${trail}`);
    }
    if (/^(sk-|sb_secret_|service_role)/i.test(value)) {
      throw new Error(`Archive refused: secret-like value at ${trail}`);
    }
    return;
  }
  if (typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecretsInArchive(v, `${trail}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // Nested Far01BackfillAuthorization object is allowed; string tokens are not.
    if (SECRET_KEY_RE.test(k) && typeof v === "string" && v.length > 0) {
      throw new Error(`Archive refused: disallowed secret key ${trail}.${k}`);
    }
    assertNoSecretsInArchive(v, `${trail}.${k}`);
  }
}

export function serializeFar01DryRunArchive(
  doc: Far01DryRunArchiveDocument,
): string {
  assertNoSecretsInArchive(doc);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export async function writeFar01DryRunArchiveFile(params: {
  doc: Far01DryRunArchiveDocument;
  outputPath: string;
}): Promise<string> {
  const abs = path.resolve(params.outputPath);
  await mkdir(path.dirname(abs), { recursive: true });
  const body = serializeFar01DryRunArchive(params.doc);
  await writeFile(abs, body, { encoding: "utf8", flag: "wx" });
  return abs;
}

export function defaultFar01DryRunArchivePath(batchId: string): string {
  const safe = batchId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join("docs", "audits", "evidence", `${safe}.json`);
}
