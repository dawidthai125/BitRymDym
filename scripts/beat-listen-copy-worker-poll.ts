/**
 * Personal listen copies (Owner 2026-11-22) — poller on the E3 Contabo host.
 *   npm run listencopy:worker:poll
 * Env: SUPABASE service role env (same as the E3 worker), LISTEN_COPY_POLL_MS (default 700).
 * A listener waits for the first render of a beat, so the queue is polled often; the query is one indexed row.
 * When idle it runs admin leak checks (/admin/wycieki). Once an hour copies unused for 30 days are deleted. Logs never include user ids, keys or URLs.
 */
import {
  purgeOldListenCopies,
  renderListenCopy,
  runLeakCheck,
  type LeakCheckJob,
  type ListenCopyJob,
} from "../src/lib/beats/listen-copy/listen-copy-worker";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

async function main() {
  const pollMs = Math.max(300, Number(process.env.LISTEN_COPY_POLL_MS) || 700);
  const admin = createSupabaseAdminClient();
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop = true; });
  console.log(JSON.stringify({ event: "listencopy_started", pollMs }));
  let lastPurge = 0;
  while (!stop) {
    try {
      const { data, error } = await admin.rpc("claim_beat_listen_copy");
      if (error) throw new Error(error.message);
      const job = ((data as ListenCopyJob[] | null) ?? [])[0];
      if (job) {
        const t0 = Date.now();
        const outcome = await renderListenCopy(admin, job);
        console.log(JSON.stringify({ event: "listencopy_done", copyId: job.id, beatId: job.beat_id, outcome, ms: Date.now() - t0 }));
        continue;
      }
      // Admin leak checks only when no listener is waiting.
      const leak = await admin.rpc("claim_leak_check");
      if (leak.error) throw new Error(leak.error.message);
      const check = ((leak.data as LeakCheckJob[] | null) ?? [])[0];
      if (check) {
        const t0 = Date.now();
        const outcome = await runLeakCheck(admin, check);
        console.log(JSON.stringify({ event: "leakcheck_done", checkId: check.id, beatId: check.beat_id, outcome, ms: Date.now() - t0 }));
        continue;
      }
      if (Date.now() - lastPurge > 3_600_000) {
        lastPurge = Date.now();
        const purged = await purgeOldListenCopies(admin);
        if (purged) console.log(JSON.stringify({ event: "listencopy_purged", count: purged }));
      }
    } catch (e) {
      console.log(JSON.stringify({ event: "listencopy_loop_error", message: e instanceof Error ? e.message.slice(0, 120) : "unknown" }));
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  console.log(JSON.stringify({ event: "listencopy_stopped" }));
}

void main();
