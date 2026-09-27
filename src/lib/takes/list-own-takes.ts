import "server-only";

import { requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { isTakeExpired } from "@/lib/takes/entitlement";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type OwnTakeListItem = {
  id: string;
  beatId: string;
  beatTitle: string | null;
  recordingMode: string;
  status: string;
  displayStatus: "READY" | "EXPIRED" | "DELETED" | "PENDING_UPLOAD" | "FAILED";
  createdAt: string;
  expiresAt: string;
  durationSeconds: number | null;
  canPreview: boolean;
  canDownload: boolean;
  canDelete: boolean;
};

function resolveDisplayStatus(row: {
  status: string;
  deleted_at: string | null;
  expires_at: string;
}): OwnTakeListItem["displayStatus"] {
  if (row.status === "DELETED" || row.deleted_at) return "DELETED";
  if (row.status === "EXPIRED" || isTakeExpired({ expiresAt: row.expires_at })) {
    return "EXPIRED";
  }
  if (row.status === "READY") return "READY";
  if (row.status === "PENDING_UPLOAD") return "PENDING_UPLOAD";
  return "FAILED";
}

/**
 * Owner-only list for /account/takes. Includes expired/deleted for lifecycle UX.
 * Active actions only when READY and not expired/deleted.
 */
export async function listOwnTakesFor(
  context: AuthContext,
): Promise<OwnTakeListItem[]> {
  const admin = createSupabaseAdminClient();

  const { data: rows, error } = await admin
    .from("takes")
    .select(
      "id, beat_id, recording_mode, status, created_at, expires_at, deleted_at, duration_seconds",
    )
    .eq("owner_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(100);

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

    return {
      id: row.id as string,
      beatId,
      beatTitle: titleByBeat.get(beatId) ?? null,
      recordingMode: row.recording_mode as string,
      status: row.status as string,
      displayStatus,
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string,
      durationSeconds: (row.duration_seconds as number | null) ?? null,
      canPreview: activeReady,
      canDownload: activeReady,
      canDelete: displayStatus !== "DELETED",
    };
  });
}

export async function listOwnTakes(): Promise<OwnTakeListItem[]> {
  const context = await requireUser();
  return listOwnTakesFor(context);
}
