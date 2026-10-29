import "server-only";

import { AuthError } from "@/lib/auth/session";
import type { AutoCheckStatus } from "@/lib/beats/auto-check/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AutoCheckRow = {
  id: string;
  beat_id: string;
  master_asset_id: string;
  checksum_sha256: string;
  status: AutoCheckStatus;
  providers: Record<string, unknown>;
  recognition_score: number | null;
  vocal_ratio: number | null;
  vocal_confidence: number | null;
  results: Record<string, unknown>;
  summary_pl: string | null;
  error_code: string | null;
  attempt: number;
  created_at: string;
  finished_at: string | null;
  appeal_requested_at: string | null;
  appeal_note: string | null;
  overridden_at: string | null;
  overridden_by: string | null;
};

/** service_role RPC; idempotent while a check is open for the current master. */
export async function enqueueBeatAutoCheck(beatId: string): Promise<AutoCheckRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("enqueue_beat_auto_check", { p_beat_id: beatId });
  if (error || !data) {
    throw new AuthError("FORBIDDEN", "Nie udało się zlecić automatycznego sprawdzenia bitu.");
  }
  return data as AutoCheckRow;
}

/** Server-side assert mirroring the DB gate (beats_auto_check_gate). */
export async function assertBeatAutoCheckCleared(beatId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("beat_auto_check_cleared", { p_beat_id: beatId });
  if (error) throw new Error(error.message);
  if (data !== true) {
    throw new AuthError(
      "FORBIDDEN",
      "Bit nie przeszedł automatycznego sprawdzenia dla aktualnego Mastera (w toku, błąd lub odrzucenie).",
    );
  }
}

/** Staff-only reads go through service_role (owner RLS exposes status/summary only). */
export async function loadLatestAutoChecks(beatIds: string[]): Promise<Map<string, AutoCheckRow>> {
  const out = new Map<string, AutoCheckRow>();
  if (beatIds.length === 0) return out;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_auto_checks")
    .select("*")
    .in("beat_id", beatIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as AutoCheckRow[]) {
    if (!out.has(row.beat_id)) out.set(row.beat_id, row);
  }
  return out;
}

export async function overrideBeatAutoCheck(params: {
  checkId: string;
  actorId: string;
  reason: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("override_beat_auto_check", {
    p_check_id: params.checkId,
    p_actor_id: params.actorId,
    p_reason: params.reason,
  });
  if (error) {
    throw new AuthError("FORBIDDEN", "Nie udało się uchylić odrzucenia filtra.");
  }
}
