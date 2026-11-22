import "server-only";

import { evaluateListenCopyHealth, evaluateQueueHealth, QUEUE_HEALTH_LOOKBACK_MS, type QueueHealth } from "@/lib/audio/queue-health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Kinds the Contabo render poller claims (SFM has its own worker and is not watched here). */
const WATCHED_RENDER_KINDS = ["STUDIO_EXPORT", "MIX", "TAKE_EXPORT"];

export async function loadQueueHealth(now = Date.now()): Promise<QueueHealth> {
  const admin = createSupabaseAdminClient();
  const since = new Date(now - QUEUE_HEALTH_LOOKBACK_MS).toISOString();
  const [render, master, listen] = await Promise.all([
    admin.from("render_jobs").select("status, queued_at, timeout_at").in("status", ["QUEUED", "RUNNING"]).in("kind", WATCHED_RENDER_KINDS).gte("queued_at", since).limit(500),
    admin.from("studio_master_jobs").select("status, created_at, started_at, progress_at").in("status", ["queued", "running"]).gte("created_at", since).limit(500),
    admin.from("beat_listen_copies").select("status, created_at, claimed_at").in("status", ["pending", "working"]).gte("created_at", since).limit(500),
  ]);
  if (render.error) throw new Error(render.error.message);
  if (master.error) throw new Error(master.error.message);
  if (listen.error) throw new Error(listen.error.message);
  const listenHealth = evaluateListenCopyHealth(
    (listen.data ?? []).map((j) => ({ status: String(j.status), createdAt: j.created_at as string | null, claimedAt: j.claimed_at as string | null })),
    now,
  );
  const base = evaluateQueueHealth(
    (render.data ?? []).map((j) => ({ status: String(j.status), queuedAt: j.queued_at as string | null, timeoutAt: j.timeout_at as string | null })),
    (master.data ?? []).map((j) => ({ status: String(j.status), createdAt: j.created_at as string | null, startedAt: j.started_at as string | null, progressAt: j.progress_at as string | null })),
    now,
  );
  return { ...base, ok: base.ok && listenHealth.stuck === 0, listen: listenHealth };
}
