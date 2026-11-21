import "server-only";

import { evaluateQueueHealth, QUEUE_HEALTH_LOOKBACK_MS, type QueueHealth } from "@/lib/audio/queue-health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Kinds the Contabo render poller claims (SFM has its own worker and is not watched here). */
const WATCHED_RENDER_KINDS = ["STUDIO_EXPORT", "MIX", "TAKE_EXPORT"];

export async function loadQueueHealth(now = Date.now()): Promise<QueueHealth> {
  const admin = createSupabaseAdminClient();
  const since = new Date(now - QUEUE_HEALTH_LOOKBACK_MS).toISOString();
  const [render, master] = await Promise.all([
    admin.from("render_jobs").select("status, queued_at, timeout_at").in("status", ["QUEUED", "RUNNING"]).in("kind", WATCHED_RENDER_KINDS).gte("queued_at", since).limit(500),
    admin.from("studio_master_jobs").select("status, created_at, started_at, progress_at").in("status", ["queued", "running"]).gte("created_at", since).limit(500),
  ]);
  if (render.error) throw new Error(render.error.message);
  if (master.error) throw new Error(master.error.message);
  return evaluateQueueHealth(
    (render.data ?? []).map((j) => ({ status: String(j.status), queuedAt: j.queued_at as string | null, timeoutAt: j.timeout_at as string | null })),
    (master.data ?? []).map((j) => ({ status: String(j.status), createdAt: j.created_at as string | null, startedAt: j.started_at as string | null, progressAt: j.progress_at as string | null })),
    now,
  );
}
