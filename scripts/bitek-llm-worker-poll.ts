/**
 * BITEK chat — E3 queue worker.
 *   npm run bitek:llm:worker
 * Env: BITEK_LLM_WORKER_ENABLED=true (kill switch; otherwise exit 0),
 *   SUPABASE service role env (same worker.env as the E3 render worker),
 *   BITEK_LLM_TOKEN (llama-server api key), BITEK_LLM_URL (localhost only, default http://127.0.0.1:8091/v1),
 *   BITEK_LLM_MODEL, BITEK_LLM_POLL_MS, BITEK_LLM_TIMEOUT_MS, BITEK_LLM_WORKER_REF.
 * Logs never include message content or secrets.
 */
import { decideBitekWorkerConfig, processOneBitekJob, warmBitekLlm, type BitekJob } from "../src/lib/studio/bitek/chat/llm-worker";
import { buildBitekStaticPrefix } from "../src/lib/studio/bitek/chat/prompt";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

const log = (e: Record<string, unknown>) => console.log(JSON.stringify(e));

async function main() {
  const cfg = decideBitekWorkerConfig(process.env, process.pid);
  if (cfg.action === "exit_disabled") {
    log({ event: "bitek_llm_worker_disabled", reason: cfg.reason });
    return;
  }
  const admin = createSupabaseAdminClient();
  let stop = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop = true; });
  log({ event: "bitek_llm_worker_started", workerRef: cfg.workerRef, model: cfg.llmModel, pollMs: cfg.pollMs });
  let lastPurge = 0;
  // Last LLM activity (job or warm-up); 0 → warm right after start.
  let lastLlm = 0;
  const warmPrefix = buildBitekStaticPrefix("pl", { compact: true });
  while (!stop) {
    try {
      if (Date.now() - lastPurge > cfg.purgeEveryMs) {
        lastPurge = Date.now();
        const { data } = await admin.rpc("purge_bitek_llm_jobs", { p_keep_minutes: 60 });
        if (typeof data === "number" && data > 0) log({ event: "bitek_llm_purge", deleted: data });
      }
      const handled = await processOneBitekJob(cfg, {
        claim: async () => {
          const { data, error } = await admin.rpc("claim_next_bitek_llm_job", { p_worker_ref: cfg.workerRef });
          if (error) throw new Error("claim_failed");
          const rows = (data ?? []) as BitekJob[];
          return rows[0] ?? null;
        },
        complete: async (id, result, errorCode) => {
          const { data } = await admin.rpc("complete_bitek_llm_job", {
            p_id: id,
            p_worker_ref: cfg.workerRef,
            p_result: result,
            p_error_code: errorCode,
          });
          return data === true;
        },
        log,
      });
      if (handled) {
        lastLlm = Date.now();
        continue;
      }
      if (cfg.warmEveryMs > 0 && Date.now() - lastLlm > cfg.warmEveryMs) {
        lastLlm = Date.now();
        await warmBitekLlm(cfg, warmPrefix, { log });
      }
    } catch (e) {
      log({ event: "bitek_llm_worker_loop_error", message: e instanceof Error ? e.message.slice(0, 120) : "unknown" });
      await new Promise((r) => setTimeout(r, 5000));
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
  log({ event: "bitek_llm_worker_stopped" });
}

void main();
