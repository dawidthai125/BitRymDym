import "server-only";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TakeJanitorResult = {
  scanned: number;
  expiredMarked: number;
  storageRemoved: number;
  storageErrors: number;
  skipped: number;
  /** STU-16 — stale PENDING_UPLOAD reservations marked FAILED (ids are UUIDs only). */
  pendingWindowReleased: number;
  pendingWindowReleasedIds: string[];
  /** Set when the release RPC failed (e.g. migration not applied); retention still runs. */
  pendingWindowError: string | null;
};

const BATCH_LIMIT = 50;
/** Max sweep batches per terminal-row query per run (cursor-advanced). */
const SWEEP_MAX_BATCHES = 10;
/** Stop starting new sweep batches after this much wall time. */
const SWEEP_TIME_BUDGET_MS = 20_000;
/** FAILED is terminal; only sweep objects of rows older than this. */
export const FAILED_SWEEP_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const SWEEP_COLUMNS =
  "id, status, object_key, storage_bucket, deleted_at, expires_at, updated_at";

/** Matches `failure_reason` set by `release_stale_pending_take_reservations` / claim RPCs. */
export const PENDING_UPLOAD_WINDOW_ELAPSED = "PENDING_UPLOAD_WINDOW_ELAPSED";

/**
 * Idempotent retention janitor for take-audio only.
 * - STU-16: releases PENDING_UPLOAD reservations past the server upload window
 *   that have no uploaded object (RPC, per-actor lock shared with claim /
 *   finalize) → FAILED `PENDING_UPLOAD_WINDOW_ELAPSED`
 * - Finds takes past expires_at still in READY / PENDING_UPLOAD
 * - Marks EXPIRED
 * - Best-effort removes Storage object
 * - Also sweeps already EXPIRED/DELETED rows, and FAILED rows (any reason,
 *   e.g. late upload after window release or rejected finalize) older than
 *   24h, that may still have objects — cursor-paged, several batches per run
 *
 * Does not touch beat-audio. Safe to re-run.
 */
export async function runTakesRetentionJanitor(options?: {
  now?: Date;
  limit?: number;
  maxSweepBatches?: number;
  timeBudgetMs?: number;
}): Promise<TakeJanitorResult> {
  const admin = createSupabaseAdminClient();
  const nowIso = (options?.now ?? new Date()).toISOString();
  const limit = options?.limit ?? BATCH_LIMIT;

  const result: TakeJanitorResult = {
    scanned: 0,
    expiredMarked: 0,
    storageRemoved: 0,
    storageErrors: 0,
    skipped: 0,
    pendingWindowReleased: 0,
    pendingWindowReleasedIds: [],
    pendingWindowError: null,
  };

  const { data: released, error: releaseError } = await admin.rpc(
    "release_stale_pending_take_reservations",
    { p_limit: limit },
  );
  if (releaseError) {
    result.pendingWindowError = releaseError.message;
  } else {
    result.pendingWindowReleasedIds = ((released ?? []) as { take_id: string }[]).map(
      (row) => row.take_id,
    );
    result.pendingWindowReleased = result.pendingWindowReleasedIds.length;
  }

  const { data: due, error: dueError } = await admin
    .from("takes")
    .select("id, status, object_key, storage_bucket, deleted_at, expires_at")
    .in("status", ["READY", "PENDING_UPLOAD"])
    .is("deleted_at", null)
    .lte("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (dueError) throw new Error(dueError.message);

  const seen = new Set<string>();
  await processCandidates(admin, due ?? [], seen, result);

  // Storage sweep of terminal rows. There is no "object removed" marker
  // column (object_key is NOT NULL), so rows stay eligible after removal;
  // advance a (updated_at, id) cursor across several batches per run so the
  // same first batch is not re-processed forever.
  const failedCutoffIso = new Date(
    (options?.now ?? new Date()).getTime() - FAILED_SWEEP_MIN_AGE_MS,
  ).toISOString();
  const deadline = Date.now() + (options?.timeBudgetMs ?? SWEEP_TIME_BUDGET_MS);
  const maxBatches = options?.maxSweepBatches ?? SWEEP_MAX_BATCHES;

  // EXPIRED / DELETED rows that may still have objects.
  await sweepTerminalRows({ admin, sweep: "TERMINAL", failedCutoffIso, limit, maxBatches, deadline, seen, result });
  // All FAILED rows (any failure_reason, incl. PENDING_UPLOAD_WINDOW_ELAPSED)
  // past a safe age: FAILED is terminal, so their objects are garbage.
  await sweepTerminalRows({ admin, sweep: "FAILED", failedCutoffIso, limit, maxBatches, deadline, seen, result });

  return result;
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type JanitorRow = Record<string, unknown>;

async function sweepTerminalRows(params: {
  admin: AdminClient;
  sweep: "TERMINAL" | "FAILED";
  failedCutoffIso: string;
  limit: number;
  maxBatches: number;
  deadline: number;
  seen: Set<string>;
  result: TakeJanitorResult;
}): Promise<void> {
  const { admin } = params;
  let cursor: { updatedAt: string; id: string } | null = null;
  for (let batch = 0; batch < params.maxBatches; batch += 1) {
    if (batch > 0 && Date.now() >= params.deadline) return;
    let query = admin
      .from("takes")
      .select(SWEEP_COLUMNS)
      .eq("storage_bucket", TAKE_AUDIO_BUCKET)
      .not("object_key", "is", null);
    query =
      params.sweep === "FAILED"
        ? query.eq("status", "FAILED").lte("updated_at", params.failedCutoffIso)
        : query.in("status", ["EXPIRED", "DELETED"]);
    if (cursor) {
      query = query.or(
        `updated_at.gt."${cursor.updatedAt}",and(updated_at.eq."${cursor.updatedAt}",id.gt.${cursor.id})`,
      );
    }
    const { data, error } = await query
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(params.limit);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as JanitorRow[];
    await processCandidates(admin, rows, params.seen, params.result);
    if (rows.length < params.limit) return;
    const last = rows[rows.length - 1];
    if (typeof last.updated_at !== "string" || typeof last.id !== "string") return;
    cursor = { updatedAt: last.updated_at, id: last.id };
  }
}

async function processCandidates(
  admin: AdminClient,
  candidates: JanitorRow[],
  seen: Set<string>,
  result: TakeJanitorResult,
): Promise<void> {
  for (const row of candidates) {
    const id = row.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    result.scanned += 1;

    if (row.storage_bucket !== TAKE_AUDIO_BUCKET) {
      result.skipped += 1;
      continue;
    }

    const status = row.status as string;
    const needsExpire =
      (status === "READY" || status === "PENDING_UPLOAD") &&
      !row.deleted_at;

    if (needsExpire) {
      const { error: markError } = await admin
        .from("takes")
        .update({
          status: "EXPIRED",
          failure_reason: "EXPIRED",
        })
        .eq("id", id)
        .in("status", ["READY", "PENDING_UPLOAD"])
        .is("deleted_at", null);

      if (!markError) {
        result.expiredMarked += 1;
      }
    }

    const objectKey = row.object_key as string | null;
    if (!objectKey || !objectKey.endsWith(".bin")) {
      result.skipped += 1;
      continue;
    }

    // Canonical take keys only (never beat-audio paths).
    if (
      !objectKey.startsWith("user/") &&
      !objectKey.startsWith("anon/")
    ) {
      result.skipped += 1;
      continue;
    }

    const { error: removeError } = await admin.storage
      .from(TAKE_AUDIO_BUCKET)
      .remove([objectKey]);

    if (removeError) {
      // Missing object is success for idempotency.
      const msg = removeError.message.toLowerCase();
      if (
        msg.includes("not found") ||
        msg.includes("does not exist") ||
        msg.includes("404")
      ) {
        result.storageRemoved += 1;
      } else {
        result.storageErrors += 1;
      }
    } else {
      result.storageRemoved += 1;
    }
  }
}
