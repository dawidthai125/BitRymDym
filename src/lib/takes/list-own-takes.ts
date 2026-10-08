import "server-only";

import { requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import {
  getSamplePolicy,
  isTakeExpired,
  sampleActorFromPremiumTier,
} from "@/lib/takes/entitlement";
import {
  buildTakeExportLadder,
  canDownloadOwnTakeRaw,
  type TakeExportLadderItem,
} from "@/lib/takes/take-export-capability";
import { displayTakeTitle } from "@/lib/takes/take-title";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type OwnTakeListItem = {
  id: string;
  title: string | null;
  displayTitle: string;
  authorDisplayName: string | null;
  beatId: string;
  beatTitle: string | null;
  recordingMode: string;
  status: string;
  displayStatus: "READY" | "EXPIRED" | "DELETED" | "PENDING_UPLOAD" | "FAILED";
  createdAt: string;
  expiresAt: string;
  durationSeconds: number | null;
  canPreview: boolean;
  /** RAW mic.bin — GOLD Sample Policy only. */
  canDownloadRaw: boolean;
  /** @deprecated use canDownloadRaw — kept for older UI callers */
  canDownload: boolean;
  canDelete: boolean;
  /** Full quality ladder; LOCKED items included. */
  downloadLadder: TakeExportLadderItem[];
  premiumTier: string;
};

export type ListOwnTakesOptions = {
  /**
   * Lifecycle lists (`/account/takes`) include soft-deleted rows.
   * Profile "Ostatnie nagrania" must pass `false` so DELETED never crowd the recent slice.
   * @default true
   */
  includeDeleted?: boolean;
  /** Max rows after owner (+ optional deleted) filters. @default 100 */
  limit?: number;
};

/** Soft-delete SSOT — same predicate as displayStatus DELETED. */
export function isTakeSoftDeleted(row: {
  status: string;
  deleted_at: string | null;
}): boolean {
  return row.status === "DELETED" || row.deleted_at != null;
}

/**
 * Profile recent list contract: exclude DELETED first, then limit.
 * Prefer `includeDeleted: false` at query time; this encodes slice order for tests/callers.
 */
export function takeRecentNonDeletedTakes<
  T extends { displayStatus: OwnTakeListItem["displayStatus"] },
>(items: T[], limit = 5): T[] {
  return items
    .filter((t) => t.displayStatus !== "DELETED")
    .slice(0, limit);
}

function resolveDisplayStatus(row: {
  status: string;
  deleted_at: string | null;
  expires_at: string;
}): OwnTakeListItem["displayStatus"] {
  if (isTakeSoftDeleted(row)) return "DELETED";
  if (row.status === "EXPIRED" || isTakeExpired({ expiresAt: row.expires_at })) {
    return "EXPIRED";
  }
  if (row.status === "READY") return "READY";
  if (row.status === "PENDING_UPLOAD") return "PENDING_UPLOAD";
  return "FAILED";
}

/**
 * Owner-only list. Default includes expired/deleted for lifecycle UX (`/account/takes`).
 * Download flags from server entitlement SSOT only — never client-spoofable.
 */
export async function listOwnTakesFor(
  context: AuthContext,
  options: ListOwnTakesOptions = {},
): Promise<OwnTakeListItem[]> {
  const includeDeleted = options.includeDeleted !== false;
  const limit = options.limit ?? 100;
  const admin = createSupabaseAdminClient();
  const product = await resolveProductEntitlementForAuthContext(context);
  const actor = sampleActorFromPremiumTier(product.premiumTier);
  const policy = getSamplePolicy({
    actor,
    beatDurationSeconds: 60,
  });
  const canRaw = canDownloadOwnTakeRaw({
    canDownloadOwnTake: policy.canDownloadOwnTake,
  });
  const ladder = buildTakeExportLadder(product.premiumTier);

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", context.userId)
    .maybeSingle();
  const authorDisplayName =
    (profile?.display_name as string | null | undefined) ?? null;

  let query = admin
    .from("takes")
    .select(
      "id, title, beat_id, recording_mode, status, created_at, expires_at, deleted_at, duration_seconds",
    )
    .eq("owner_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!includeDeleted) {
    // DB-side filter — do not pull DELETED rows only to drop them after slice.
    query = query.neq("status", "DELETED").is("deleted_at", null);
  }

  const { data: rows, error } = await query;

  if (error) throw new Error(error.message);

  const beatIds = [
    ...new Set((rows ?? []).map((r) => r.beat_id as string)),
  ];
  const titleByBeat = new Map<string, string>();
  if (beatIds.length > 0) {
    const { data: beats } = await admin
      .from("beats")
      .select("id, title")
      .in("id", beatIds);
    for (const b of beats ?? []) {
      titleByBeat.set(b.id as string, b.title as string);
    }
  }

  return (rows ?? []).map((row) => {
    const displayStatus = resolveDisplayStatus({
      status: row.status as string,
      deleted_at: row.deleted_at as string | null,
      expires_at: row.expires_at as string,
    });
    const activeReady = displayStatus === "READY";
    const beatId = row.beat_id as string;
    const beatTitle = titleByBeat.get(beatId) ?? null;
    const title = (row.title as string | null) ?? null;

    return {
      id: row.id as string,
      title,
      displayTitle: displayTakeTitle({ title, beatTitle }),
      authorDisplayName,
      beatId,
      beatTitle,
      recordingMode: row.recording_mode as string,
      status: row.status as string,
      displayStatus,
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string,
      durationSeconds: (row.duration_seconds as number | null) ?? null,
      canPreview: activeReady,
      canDownloadRaw: activeReady && canRaw,
      canDownload: activeReady && canRaw,
      canDelete: displayStatus !== "DELETED",
      downloadLadder: activeReady
        ? ladder
        : ladder.map((item) => ({
            ...item,
            unlocked: false,
            lockedMessage:
              item.lockedMessage ?? "Nagranie niedostępne do eksportu.",
          })),
      premiumTier: product.premiumTier,
    };
  });
}

export async function listOwnTakes(
  options: ListOwnTakesOptions = {},
): Promise<OwnTakeListItem[]> {
  const context = await requireUser();
  return listOwnTakesFor(context, options);
}
