import "server-only";

/**
 * beat_auto_check worker pipeline (E3 Contabo host, service_role):
 * download MASTER → ffmpeg decode → fpcalc → own catalog + AcoustID →
 * Demucs vocal stem ratio → decideAutoCheck → complete RPC.
 * Logs never include keys, signed URLs or fingerprints.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveFfmpegBin, runCapture } from "@/lib/audio/native-ffmpeg";
import { AUTO_CHECK_THRESHOLDS, decideAutoCheck } from "@/lib/beats/auto-check/decision";
import { parseFpcalcJson, parseFpcalcRaw } from "@/lib/beats/auto-check/fingerprint";
import {
  createAcoustIdProvider,
  createOwnCatalogProvider,
  type CatalogFingerprint,
  type RecognitionProvider,
} from "@/lib/beats/auto-check/providers";
import type { RecognitionProviderResult, VocalResult } from "@/lib/beats/auto-check/types";
import { parseVocalScriptOutput } from "@/lib/beats/auto-check/vocal";
import type { AutoCheckWorkerConfig } from "@/lib/beats/auto-check/worker-env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RunConfig = Extract<AutoCheckWorkerConfig, { action: "run" }>;
type ClaimedCheck = { id: string; beat_id: string; master_asset_id: string; checksum_sha256: string };

const ALGORITHM = "chromaprint-raw-v1";

export async function claimNextAutoCheck(cfg: RunConfig): Promise<ClaimedCheck | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_next_beat_auto_check", { p_worker_ref: cfg.workerRef });
  if (error) throw new Error(`claim_failed:${error.code ?? "?"}`);
  const row = (Array.isArray(data) ? data[0] : data) as ClaimedCheck | null;
  return row?.id ? row : null;
}

async function loadCatalog(excludeBeatId: string): Promise<CatalogFingerprint[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_audio_fingerprints")
    .select("beat_id, fingerprint, beats!inner(owner_id, title)")
    .eq("algorithm", ALGORITHM)
    .neq("beat_id", excludeBeatId);
  if (error) throw new Error("catalog_load_failed");
  return (data ?? []).map((r) => {
    const b = (Array.isArray(r.beats) ? r.beats[0] : r.beats) as { owner_id: string; title: string | null };
    return { beatId: r.beat_id as string, ownerId: b.owner_id, title: b.title, fingerprint: r.fingerprint as number[] };
  });
}

async function complete(cfg: RunConfig, check: ClaimedCheck, payload: {
  status: string; providers: Record<string, unknown>; results: Record<string, unknown>;
  recognitionScore: number | null; vocalRatio: number | null; vocalConfidence: number | null;
  summaryPl: string; errorCode: string | null;
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("complete_beat_auto_check", {
    p_check_id: check.id,
    p_worker_ref: cfg.workerRef,
    p_status: payload.status,
    p_providers: payload.providers,
    p_results: payload.results,
    p_recognition_score: payload.recognitionScore,
    p_vocal_ratio: payload.vocalRatio,
    p_vocal_confidence: payload.vocalConfidence,
    p_summary_pl: payload.summaryPl,
    p_error_code: payload.errorCode,
  });
  if (error) throw new Error(`complete_failed:${error.code ?? "?"}`);
}

export async function runAutoCheck(cfg: RunConfig, check: ClaimedCheck): Promise<string> {
  const admin = createSupabaseAdminClient();
  const work = await mkdtemp(path.join(tmpdir(), "brd-autocheck-"));
  try {
    const { data: asset, error: aErr } = await admin
      .from("beat_audio_assets")
      .select("storage_bucket, object_key, checksum_sha256, beats!inner(owner_id)")
      .eq("id", check.master_asset_id)
      .single();
    if (aErr || !asset) throw Object.assign(new Error("asset_missing"), { code: "asset_missing" });
    if (asset.checksum_sha256 !== check.checksum_sha256) throw Object.assign(new Error("checksum_changed"), { code: "checksum_changed" });
    const ownerId = ((Array.isArray(asset.beats) ? asset.beats[0] : asset.beats) as { owner_id: string }).owner_id;
    const { data: blob, error: dErr } = await admin.storage.from(asset.storage_bucket as string).download(asset.object_key as string);
    if (dErr || !blob) throw Object.assign(new Error("download_failed"), { code: "download_failed" });
    const src = path.join(work, "master.bin");
    await writeFile(src, Buffer.from(await blob.arrayBuffer()));

    const wav = path.join(work, "master.wav");
    await runCapture(resolveFfmpegBin(), ["-nostdin", "-v", "error", "-y", "-i", src, "-t", String(cfg.maxDurationSeconds), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", wav], { timeoutMs: 180_000 });

    const raw = parseFpcalcRaw(await runCapture(cfg.fpcalcBin, ["-json", "-raw", "-length", "0", wav], { timeoutMs: 120_000 }));
    const compressed = parseFpcalcJson(await runCapture(cfg.fpcalcBin, ["-json", "-length", "120", wav], { timeoutMs: 120_000 }));

    await admin.from("beat_audio_fingerprints").upsert(
      { beat_id: check.beat_id, master_asset_id: check.master_asset_id, checksum_sha256: check.checksum_sha256, algorithm: ALGORITHM, duration_seconds: raw.duration, fingerprint: raw.fingerprint },
      { onConflict: "master_asset_id,algorithm" },
    );

    const providers: RecognitionProvider[] = [
      createOwnCatalogProvider({ loadCatalog }),
      createAcoustIdProvider({ clientKey: cfg.acoustidKey }),
    ];
    const ctx = { beatId: check.beat_id, ownerId, durationSeconds: raw.duration, rawFingerprint: raw.fingerprint, compressedFingerprint: String(compressed.fingerprint) };
    const recognition: RecognitionProviderResult[] = [];
    for (const p of providers) {
      try {
        recognition.push(await p.recognize(ctx));
      } catch {
        recognition.push({ provider: p.name, required: p.required, outcome: "error", matches: [], errorCode: `${p.name}_failed` });
      }
    }

    let vocal: VocalResult;
    try {
      vocal = parseVocalScriptOutput(await runCapture(cfg.pythonBin, [cfg.vocalScript, wav, path.join(work, "sep"), String(AUTO_CHECK_THRESHOLDS.vocalWindowDb)], { timeoutMs: 1_700_000 }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      vocal = { outcome: /timed out/.test(msg) ? "timeout" : /spawn failed/.test(msg) ? "not_configured" : "error", method: "demucs", ratio: null, windows: [], errorCode: "vocal_runner_failed" };
    }

    const verdict = decideAutoCheck({ recognition, vocal });
    await complete(cfg, check, {
      status: verdict.status,
      providers: Object.fromEntries(recognition.map((r) => [r.provider, r.outcome]).concat([["vocals", vocal.outcome]])),
      results: { recognition, vocal, durationSeconds: raw.duration, thresholds: AUTO_CHECK_THRESHOLDS },
      recognitionScore: verdict.recognitionScore,
      vocalRatio: verdict.vocalRatio,
      vocalConfidence: verdict.vocalConfidence,
      summaryPl: verdict.summaryPl,
      errorCode: verdict.errorCode,
    });
    return verdict.status;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "pipeline_failed";
    const verdict = decideAutoCheck({ recognition: [], vocal: { outcome: "error", method: "demucs", ratio: null, windows: [] } });
    await complete(cfg, check, {
      status: "error", providers: {}, results: { stage_error: code }, recognitionScore: null, vocalRatio: null, vocalConfidence: null,
      summaryPl: verdict.summaryPl, errorCode: code,
    });
    return "error";
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
