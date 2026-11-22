import "server-only";

/**
 * Public work clip — app side (service_role). Queue on publish, state for the public pages,
 * rate limit + short signed URL for GET /api/catalog/works/[id]/clip. The E3 master worker
 * cuts the file (src/lib/studio/master/worker.ts → runWorkClipJob). Columns missing
 * (migration 20261122140000 not applied) → everything reads as "pending", publish still works.
 */
import { hashListenToken } from "@/lib/studio/listen/listen-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  shouldQueueWorkClip,
  WORK_CLIP_RATE,
  WORK_CLIP_SIGNED_URL_SECONDS,
  workClipOf,
  type WorkClip,
} from "./work-clip";

const TABLE = "catalog_works";
const BUCKET = "audio-artifacts";
const CLIP_COLUMNS = "id, preview_clip_status, preview_clip_key, preview_clip_seconds";
type ClipRow = { id: string; preview_clip_status: unknown; preview_clip_key: unknown; preview_clip_seconds: unknown };

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function adminOrNull(): Admin | null {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

/** Publish save → queue the clip once (failed: again after the retry delay). Best effort. */
export async function queueWorkClip(admin: Admin, ownerId: string, masterJobId: string, now = Date.now()): Promise<boolean> {
  try {
    const loaded = await admin
      .from(TABLE)
      .select("id, preview_clip_status, preview_clip_requested_at")
      .eq("master_job_id", masterJobId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (loaded.error || !loaded.data) return false;
    const row = loaded.data as { id: string; preview_clip_status: string | null; preview_clip_requested_at: string | null };
    if (!shouldQueueWorkClip(row, now)) return false;
    const base = admin
      .from(TABLE)
      .update({
        preview_clip_status: "pending",
        preview_clip_requested_at: new Date(now).toISOString(),
        preview_clip_attempts: 0,
        preview_clip_error: null,
        preview_clip_claimed_at: null,
        preview_clip_worker_ref: null,
      })
      .eq("id", row.id)
      .eq("owner_id", ownerId);
    const saved = row.preview_clip_status == null
      ? await base.is("preview_clip_status", null)
      : await base.eq("preview_clip_status", "failed");
    return !saved.error;
  } catch {
    return false;
  }
}

/** Clip state per work id (cards + work page). Unknown / error → "pending". */
export async function loadWorkClips(ids: readonly string[]): Promise<Map<string, WorkClip>> {
  const out = new Map<string, WorkClip>(ids.map((id) => [id, { state: "pending" }]));
  if (ids.length === 0) return out;
  const admin = adminOrNull();
  if (!admin) return out;
  try {
    const loaded = await admin.from(TABLE).select(CLIP_COLUMNS).in("id", [...ids]).is("withdrawn_at", null);
    if (loaded.error) return out;
    for (const row of (loaded.data ?? []) as ClipRow[]) {
      const clip = workClipOf(row);
      out.set(row.id, clip.state === "ready" ? { state: "ready", seconds: clip.seconds } : { state: "pending" });
    }
  } catch {
    /* pending */
  }
  return out;
}

/** Ready clip key of a live work (the route checks liveness first); null = not ready. */
export async function loadLiveWorkClipKey(id: string): Promise<{ key: string; seconds: number } | null> {
  const admin = adminOrNull();
  if (!admin) return null;
  const loaded = await admin.from(TABLE).select(CLIP_COLUMNS).eq("id", id).is("withdrawn_at", null).maybeSingle();
  if (loaded.error || !loaded.data) return null;
  const clip = workClipOf(loaded.data as ClipRow);
  return clip.state === "ready" && clip.key ? { key: clip.key, seconds: clip.seconds } : null;
}

/** Sliding-window limit per work and per hashed client IP (same RPC as listen links). Fails closed. */
export async function allowWorkClipHit(workId: string, clientIp: string): Promise<boolean> {
  const admin = adminOrNull();
  if (!admin) return false;
  const ipHash = (await hashListenToken(`ip:${clientIp}`)).slice(0, 32);
  for (const [bucket, r] of [[`wc:${workId}`, WORK_CLIP_RATE.work], [`wi:${ipHash}`, WORK_CLIP_RATE.ip]] as const) {
    const { data, error } = await admin.rpc("studio_listen_hit", { p_bucket: bucket, p_limit: r.limit, p_window_seconds: r.windowSeconds });
    if (error || data !== true) return false;
  }
  return true;
}

export async function signWorkClip(key: string): Promise<string | null> {
  const admin = adminOrNull();
  if (!admin) return null;
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(key, WORK_CLIP_SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}
