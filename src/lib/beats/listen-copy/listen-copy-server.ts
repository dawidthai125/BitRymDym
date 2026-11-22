import "server-only";

import { AuthError } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Personal listen copy (Owner 2026-11-22). The clean master never goes to a browser or the Windows program of a
 * listener: they get `listen/{beatId}/{copyId}.mp3`, a 256 kbps MP3 with an inaudible mark of this copy id,
 * rendered on the E3 host (listen-copy-worker). The first open of a beat waits for the render (a few seconds).
 *
 * Switch: BEAT_LISTEN_COPY=1 turns it on. Off → the previous behaviour (signed master), a one-env rollback.
 */
export const LISTEN_COPY_CONTENT_TYPE = "audio/mpeg";
export const LISTEN_COPY_NOT_READY = "Bit jeszcze się przygotowuje. Spróbuj za chwilę.";
const WAIT_MS = 40_000;
const POLL_MS = 600;

export function listenCopyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.BEAT_LISTEN_COPY ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

type CopyRow = { id: string; status: string; object_key: string | null; attempts: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Returns the storage key of this account's ready copy, queueing the render when it is missing.
 * Fails closed: never falls back to the master while the switch is on.
 */
export async function resolveListenCopyKey(params: {
  beatId: string;
  userId: string;
  masterAssetId: string;
  waitMs?: number;
}): Promise<{ copyId: string; objectKey: string }> {
  const admin = createSupabaseAdminClient();
  const { error: insErr } = await admin
    .from("beat_listen_copies")
    .upsert(
      { beat_id: params.beatId, user_id: params.userId, master_asset_id: params.masterAssetId },
      { onConflict: "beat_id,user_id,master_asset_id", ignoreDuplicates: true },
    );
  if (insErr) throw new Error(insErr.message);
  // Someone is waiting now: a background warm-up row for this copy jumps the queue.
  await admin
    .from("beat_listen_copies")
    .update({ priority: 0 })
    .eq("beat_id", params.beatId)
    .eq("user_id", params.userId)
    .eq("master_asset_id", params.masterAssetId)
    .eq("priority", 1);

  const deadline = Date.now() + (params.waitMs ?? WAIT_MS);
  let requeued = false;
  for (;;) {
    const { data, error } = await admin
      .from("beat_listen_copies")
      .select("id, status, object_key, attempts")
      .eq("beat_id", params.beatId)
      .eq("user_id", params.userId)
      .eq("master_asset_id", params.masterAssetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as CopyRow | null;
    if (row?.status === "ready" && row.object_key) {
      await admin
        .from("beat_listen_copies")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", row.id);
      return { copyId: row.id, objectKey: row.object_key };
    }
    // A copy that failed (or whose file was cleaned up) gets one fresh round of attempts per request.
    if (row && row.status === "failed" && !requeued) {
      requeued = true;
      await admin
        .from("beat_listen_copies")
        .update({ status: "pending", attempts: 0, error_code: null })
        .eq("id", row.id)
        .eq("status", "failed");
    }
    if (Date.now() >= deadline) {
      console.warn("[listen-copy] not ready in time", { beatId: params.beatId, status: row?.status ?? "missing" });
      throw new AuthError("NOT_FOUND", LISTEN_COPY_NOT_READY);
    }
    await sleep(POLL_MS);
  }
}

/**
 * Background warm-up (beat page of a signed-in listener): queue this account's copy at low priority so the Studio
 * opens without waiting. Never throws.
 */
export async function prewarmListenCopy(params: { beatId: string; userId: string }): Promise<void> {
  try {
    if (!listenCopyEnabled()) return;
    const admin = createSupabaseAdminClient();
    const { data: master } = await admin
      .from("beat_audio_assets")
      .select("id")
      .eq("beat_id", params.beatId)
      .eq("purpose", "MASTER")
      .eq("is_active", true)
      .eq("status", "READY")
      .maybeSingle();
    if (!master?.id) return;
    await admin
      .from("beat_listen_copies")
      .upsert(
        { beat_id: params.beatId, user_id: params.userId, master_asset_id: master.id as string, priority: 1 },
        { onConflict: "beat_id,user_id,master_asset_id", ignoreDuplicates: true },
      );
  } catch {
    /* warm-up is best effort */
  }
}
