/**
 * Rights check dry run (no writes): judge one approved master as if it were published.
 *   npx tsx --import ./scripts/register-server-only-stub.mjs scripts/rights-dry-run.ts <masterJobId>
 *   ... scripts/rights-dry-run.ts --beat <beatId>   (detection test: the beat's master judged as an uploaded stem)
 * Same env as the auto-check poller. Prints the verdict and per-file matches (no fingerprints, no keys).
 */
import { decideAutoCheckWorkerConfig } from "../src/lib/beats/auto-check/worker-env";
import { evaluateWork } from "../src/lib/rights/rights-worker";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

async function main() {
  const masterJobId = process.argv[2] ?? "";
  const cfg = decideAutoCheckWorkerConfig({ ...process.env, BEAT_AUTO_CHECK_ENABLED: "true" }, process.pid);
  if (cfg.action !== "run") throw new Error("config");
  if (process.argv[2] === "--beat") {
    const beatId = process.argv[3] ?? "";
    const asset = await createSupabaseAdminClient()
      .from("beat_audio_assets")
      .select("storage_bucket, object_key")
      .eq("beat_id", beatId)
      .eq("purpose", "MASTER")
      .eq("is_active", true)
      .maybeSingle();
    if (asset.error || !asset.data) throw new Error("beat_master_not_found");
    const t0 = Date.now();
    const out = await evaluateWork(cfg, {
      id: "dry-run", owner_id: "", project_id: "", master_job_id: "", result_object_key: "",
      files: [{ kind: "stem", ref: beatId, bucket: String(asset.data.storage_bucket), key: String(asset.data.object_key) }],
    });
    console.log(JSON.stringify({ ms: Date.now() - t0, ...out }, null, 1));
    return;
  }
  const { data, error } = await createSupabaseAdminClient()
    .from("studio_master_jobs")
    .select("id, owner_id, project_id, result_object_key, kind, status")
    .eq("id", masterJobId)
    .maybeSingle();
  if (error || !data || data.kind !== "master" || data.status !== "succeeded" || !data.result_object_key) throw new Error("master_not_found");
  const t0 = Date.now();
  const out = await evaluateWork(cfg, {
    id: "dry-run", owner_id: String(data.owner_id), project_id: String(data.project_id), master_job_id: String(data.id), result_object_key: String(data.result_object_key),
  });
  console.log(JSON.stringify({ ms: Date.now() - t0, ...out }, null, 1));
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
