/**
 * One-off backfill: guest 20 s PREVIEW assets for existing beats.
 *
 *   npm run preview:backfill                      # dry run (default, no writes)
 *   BEAT_PREVIEW_BACKFILL_CONFIRM=yes npm run preview:backfill -- --apply
 *   ... -- --apply --beat <uuid> [--force]        # one beat / re-render
 *   ... -- --limit 5 | --include-unpublished
 *
 * Runs on the E3 host with the existing worker env (service role). Requires
 * migration 20261029230000_beat_audio_preview_purpose (enum PREVIEW).
 * Idempotent: fresh previews (cut from the current active MASTER) are skipped.
 * Output: one JSON line per beat (beatId, outcome, bytes) + a summary.
 * Never prints keys, signed URLs, object paths or env values.
 */
import { execFileSync } from "node:child_process";

import { resolveFfmpegBin } from "../src/lib/audio/native-ffmpeg";
import {
  ensureBeatPreviewAsset,
  listBeatsNeedingPreview,
  type PreviewOutcome,
} from "../src/lib/beats/preview/beat-preview-service";
import { isUuid } from "../src/lib/beats/audio-validation";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);

function out(o: Record<string, unknown>) {
  console.log(JSON.stringify(o));
}

async function main() {
  const apply = has("--apply");
  const force = has("--force");
  const beat = arg("--beat");
  const limitRaw = arg("--limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (apply && (process.env.BEAT_PREVIEW_BACKFILL_CONFIRM ?? "") !== "yes") {
    out({ event: "refused", reason: "--apply needs BEAT_PREVIEW_BACKFILL_CONFIRM=yes" });
    process.exitCode = 2;
    return;
  }
  if (beat && !isUuid(beat)) {
    out({ event: "refused", reason: "--beat must be a uuid" });
    process.exitCode = 2;
    return;
  }
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
    out({ event: "refused", reason: "--limit must be a positive integer" });
    process.exitCode = 2;
    return;
  }

  // Preflight: MP3 encoder present (fail before touching anything).
  const encoders = execFileSync(resolveFfmpegBin(), ["-hide_banner", "-encoders"], { encoding: "utf8" });
  if (!/libmp3lame/.test(encoders)) {
    out({ event: "refused", reason: "ffmpeg without libmp3lame" });
    process.exitCode = 2;
    return;
  }

  const admin = createSupabaseAdminClient();
  const ids = beat
    ? [beat]
    : force
      ? // --force without --beat: every published beat with a master.
        ((await admin.from("beats").select("id").eq("status", "PUBLISHED")).data ?? []).map((b) => b.id as string)
      : await listBeatsNeedingPreview(admin, { includeUnpublished: has("--include-unpublished") });
  const todo = limit ? ids.slice(0, limit) : ids;
  out({ event: "start", mode: apply ? "apply" : "dry_run", force, candidates: todo.length });

  const counts: Partial<Record<PreviewOutcome, number>> = {};
  for (const beatId of todo) {
    const t0 = Date.now();
    const r = await ensureBeatPreviewAsset({ admin }, { beatId, force, dryRun: !apply });
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    out({ event: "beat", beatId, outcome: r.outcome, bytes: r.byteSize ?? null, errorCode: r.errorCode ?? null, ms: Date.now() - t0 });
  }
  out({ event: "summary", mode: apply ? "apply" : "dry_run", counts });
  if (counts.failed) process.exitCode = 1;
}

main().catch((e) => {
  out({ event: "fatal", message: e instanceof Error ? e.message.slice(0, 160) : "unknown" });
  process.exitCode = 1;
});
