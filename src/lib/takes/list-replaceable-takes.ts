import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import { isTakeActivelyReady } from "@/lib/takes/entitlement";
import type { ReplaceableTakeSummary } from "@/lib/takes/claim-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function attachBeatTitles(
  rows: Array<{
    id: string;
    beat_id: string;
    duration_seconds: number | null;
    created_at: string;
    expires_at: string;
  }>,
): Promise<ReplaceableTakeSummary[]> {
  const admin = createSupabaseAdminClient();
  const beatIds = [...new Set(rows.map((r) => r.beat_id))];
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
  return rows.map((row) => ({
    id: row.id,
    beatId: row.beat_id,
    beatTitle: titleByBeat.get(row.beat_id) ?? null,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

/** Active READY takes eligible as explicit replace targets (all beats). */
export async function listReplaceableTakesFor(
  context: AuthContext,
): Promise<ReplaceableTakeSummary[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("takes")
    .select("id, beat_id, duration_seconds, created_at, expires_at, status, deleted_at")
    .eq("owner_id", context.userId)
    .eq("status", "READY")
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  const active = (data ?? []).filter((row) =>
    isTakeActivelyReady({
      status: row.status as string,
      deletedAt: row.deleted_at as string | null,
      expiresAt: row.expires_at as string,
    }),
  );

  return attachBeatTitles(
    active.map((row) => ({
      id: row.id as string,
      beat_id: row.beat_id as string,
      duration_seconds: (row.duration_seconds as number | null) ?? null,
      created_at: row.created_at as string,
      expires_at: row.expires_at as string,
    })),
  );
}

export async function listAnonReplaceableTakesFor(
  tokenHash: string,
): Promise<ReplaceableTakeSummary[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("takes")
    .select("id, beat_id, duration_seconds, created_at, expires_at, status, deleted_at")
    .eq("anonymous_token_hash", tokenHash)
    .eq("status", "READY")
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);

  const active = (data ?? []).filter((row) =>
    isTakeActivelyReady({
      status: row.status as string,
      deletedAt: row.deleted_at as string | null,
      expiresAt: row.expires_at as string,
    }),
  );

  return attachBeatTitles(
    active.map((row) => ({
      id: row.id as string,
      beat_id: row.beat_id as string,
      duration_seconds: (row.duration_seconds as number | null) ?? null,
      created_at: row.created_at as string,
      expires_at: row.expires_at as string,
    })),
  );
}
