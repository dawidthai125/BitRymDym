import "server-only";

/**
 * Rights worker jobs (auto-check poller on the E3 Contabo host, service_role). Owner decision 2026-11-26.
 * 1) Fingerprint every APPROVED/PUBLISHED beat (platform beats published from "Oczekujące", free or paid,
 *    and approved user beats) — they become the own-catalogue reference for later checks.
 * 2) Fingerprint every catalogue sample, and every sample waiting for review (with matches for staff).
 * 3) Check a catalogue work before it goes live: the approved master and every uploaded file in the
 *    project vs our beats + AcoustID → passed (live) or held (moderator).
 * Logs never include keys, signed URLs or fingerprints. Only fingerprints leave the host (AcoustID).
 */
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveFfmpegBin, runCapture } from "@/lib/audio/native-ffmpeg";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import { compareFingerprints, parseFpcalcJson, parseFpcalcRaw } from "@/lib/beats/auto-check/fingerprint";
import { createAcoustIdProvider } from "@/lib/beats/auto-check/providers";
import type { AutoCheckWorkerConfig } from "@/lib/beats/auto-check/worker-env";
import {
  decideWorkRights,
  isHardCatalogHit,
  isHardExternalHit,
  type CatalogHit,
  type ExternalHit,
  type RightsFileKind,
  type RightsFileResult,
} from "@/lib/rights/rights-decision";
import { partsOf } from "@/lib/studio/master/parts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RunConfig = Extract<AutoCheckWorkerConfig, { action: "run" }>;
type Admin = ReturnType<typeof createSupabaseAdminClient>;

const ALGORITHM = "chromaprint-raw-v1";
const MASTER_BUCKET = "audio-artifacts";
/** Seconds of each file that are fingerprinted (a whole song fits). */
const FILE_SECONDS = 600;
const MAX_FILES = 40;

type Print = { duration: number; raw: number[]; compressed: string };
type Ref = { source: "beat" | "sample"; id: string; title: string | null; fingerprint: number[] };

async function fingerprintFile(cfg: RunConfig, work: string, src: string): Promise<Print> {
  const wav = path.join(work, `fp-${path.basename(src)}.wav`);
  await runCapture(resolveFfmpegBin(), ["-nostdin", "-v", "error", "-y", "-i", src, "-t", String(Math.min(cfg.maxDurationSeconds, FILE_SECONDS)), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", wav], { timeoutMs: 180_000 });
  try {
    const raw = parseFpcalcRaw(await runCapture(cfg.fpcalcBin, ["-json", "-raw", "-length", "0", wav], { timeoutMs: 120_000 }));
    const compressed = parseFpcalcJson(await runCapture(cfg.fpcalcBin, ["-json", "-length", "120", wav], { timeoutMs: 120_000 }));
    return { duration: raw.duration, raw: raw.fingerprint, compressed: String(compressed.fingerprint) };
  } finally {
    await rm(wav, { force: true });
  }
}

async function downloadTo(admin: Admin, bucket: string, key: string, file: string): Promise<void> {
  const { data, error } = await admin.storage.from(bucket).download(key);
  if (error || !data) throw new Error("download_failed");
  await writeFile(file, Buffer.from(await data.arrayBuffer()));
}

/** Master results may be stored in .pNNN parts (studio master worker). */
async function downloadMaster(admin: Admin, key: string, file: string): Promise<void> {
  const dir = key.slice(0, key.lastIndexOf("/"));
  const base = key.slice(key.lastIndexOf("/") + 1);
  const listed = await admin.storage.from(MASTER_BUCKET).list(dir, { limit: 1000 });
  if (listed.error) throw new Error("download_failed");
  const parts = partsOf((listed.data ?? []).map((f) => f.name), base);
  if (!parts.length) throw new Error("download_failed");
  await writeFile(file, Buffer.alloc(0));
  for (const n of parts) {
    const { data, error } = await admin.storage.from(MASTER_BUCKET).download(`${dir}/${n}`);
    if (error || !data) throw new Error("download_failed");
    await appendFile(file, Buffer.from(await data.arrayBuffer()));
  }
}

/** PostgREST caps a response at 1000 rows: read the whole table page by page. */
const PAGE = 500;

async function loadBeatRefs(admin: Admin): Promise<Ref[]> {
  const out: Ref[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("beat_audio_fingerprints")
      .select("id, beat_id, fingerprint, beats!inner(title, status)")
      .eq("algorithm", ALGORITHM)
      .in("beats.status", ["APPROVED", "PUBLISHED"])
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error("catalog_load_failed");
    for (const r of data ?? []) {
      const b = (Array.isArray(r.beats) ? r.beats[0] : r.beats) as { title: string | null };
      out.push({ source: "beat", id: String(r.beat_id), title: b?.title ?? null, fingerprint: r.fingerprint as number[] });
    }
    if ((data ?? []).length < PAGE) return out;
  }
}

async function loadSampleRefs(admin: Admin, excludeSampleId?: string): Promise<Ref[]> {
  const out: Ref[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("sample_audio_fingerprints")
      .select("id, sample_id, fingerprint, studio_samples!inner(title, status)")
      .eq("algorithm", ALGORITHM)
      .eq("studio_samples.status", "PUBLISHED")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error("catalog_load_failed");
    for (const r of data ?? []) {
      if (r.sample_id === excludeSampleId) continue;
      const smp = (Array.isArray(r.studio_samples) ? r.studio_samples[0] : r.studio_samples) as { title: string | null };
      out.push({ source: "sample", id: String(r.sample_id), title: smp?.title ?? null, fingerprint: r.fingerprint as number[] });
    }
    if ((data ?? []).length < PAGE) return out;
  }
}

function catalogHits(print: Print, refs: Ref[], skipIds: Set<string>): CatalogHit[] {
  const hits: CatalogHit[] = [];
  for (const ref of refs) {
    if (skipIds.has(ref.id)) continue;
    const m = compareFingerprints(print.raw, ref.fingerprint);
    if (m.score >= 0.3) hits.push({ source: ref.source, id: ref.id, title: ref.title, score: m.score, matchedSeconds: m.matchedSeconds });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 5);
}

async function externalHits(cfg: RunConfig, print: Print, ref: string): Promise<{ hits: ExternalHit[]; error: string | null }> {
  const r = await createAcoustIdProvider({ clientKey: cfg.acoustidKey }).recognize({
    beatId: ref, ownerId: "", durationSeconds: print.duration, rawFingerprint: print.raw, compressedFingerprint: print.compressed,
  });
  if (r.outcome === "not_configured") return { hits: [], error: null };
  if (r.outcome === "error" || r.outcome === "timeout") return { hits: [], error: r.errorCode ?? r.outcome };
  return { hits: r.matches.map((m) => ({ score: m.score, title: m.title ?? null, artist: m.artist ?? null, url: m.url ?? null })), error: null };
}

// ---------------------------------------------------------------- 1) beat fingerprints

/** One APPROVED/PUBLISHED beat whose active MASTER has no fingerprint yet, or null (anti-join in SQL). */
export async function nextBeatNeedingFingerprint(admin: Admin, skip: ReadonlySet<string> = new Set()): Promise<{ beatId: string; assetId: string; bucket: string; key: string; checksum: string } | null> {
  const { data, error } = await admin.rpc("next_beat_needing_fingerprint", { p_skip: [...skip] });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error("beat_fp_next_failed");
  }
  const row = (Array.isArray(data) ? data[0] : data) as { beat_id: string; asset_id: string; storage_bucket: string; object_key: string; checksum_sha256: string } | null;
  return row?.asset_id ? { beatId: row.beat_id, assetId: row.asset_id, bucket: row.storage_bucket, key: row.object_key, checksum: row.checksum_sha256 } : null;
}

export async function fingerprintBeat(cfg: RunConfig, job: NonNullable<Awaited<ReturnType<typeof nextBeatNeedingFingerprint>>>): Promise<void> {
  const admin = createSupabaseAdminClient();
  const work = await mkdtemp(path.join(tmpdir(), "brd-fp-beat-"));
  try {
    const src = path.join(work, "master.bin");
    await downloadTo(admin, job.bucket, job.key, src);
    const print = await fingerprintFile(cfg, work, src);
    const saved = await admin.from("beat_audio_fingerprints").upsert(
      { beat_id: job.beatId, master_asset_id: job.assetId, checksum_sha256: job.checksum, algorithm: ALGORITHM, duration_seconds: print.duration, fingerprint: print.raw },
      { onConflict: "master_asset_id,algorithm" },
    );
    if (saved.error) throw new Error("beat_fp_save_failed");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 2) sample fingerprints

type SampleJob = { sampleId: string; key: string; review: boolean };

/** One catalogue sample (or a sample waiting for review) without a fingerprint, or null (anti-join in SQL). */
export async function nextSampleNeedingFingerprint(admin: Admin, skip: ReadonlySet<string> = new Set()): Promise<SampleJob | null> {
  const { data, error } = await admin.rpc("next_sample_needing_fingerprint", { p_skip: [...skip] });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error("sample_fp_next_failed");
  }
  const row = (Array.isArray(data) ? data[0] : data) as { sample_id: string; object_key: string; review: boolean } | null;
  return row?.object_key ? { sampleId: row.sample_id, key: row.object_key, review: row.review === true } : null;
}

export async function fingerprintSample(cfg: RunConfig, job: SampleJob): Promise<void> {
  const admin = createSupabaseAdminClient();
  const work = await mkdtemp(path.join(tmpdir(), "brd-fp-sample-"));
  try {
    const src = path.join(work, "sample.bin");
    await downloadTo(admin, BEAT_AUDIO_BUCKET, job.key, src);
    const print = await fingerprintFile(cfg, work, src);
    let matches: unknown[] = [];
    if (job.review) {
      // Staff hint: is the sample someone else's (our beat, another catalogue sample, a known recording)?
      const refs = [...(await loadBeatRefs(admin)), ...(await loadSampleRefs(admin, job.sampleId))];
      const cat = catalogHits(print, refs, new Set()).filter((h) => isHardCatalogHit(h, print.duration));
      const ext = await externalHits(cfg, print, job.sampleId);
      matches = [...cat, ...ext.hits.filter(isHardExternalHit).map((h) => ({ source: "acoustid", ...h })), ...(ext.error ? [{ source: "acoustid", error: ext.error }] : [])];
    }
    const saved = await admin.from("sample_audio_fingerprints").upsert(
      { sample_id: job.sampleId, object_key: job.key, algorithm: ALGORITHM, duration_seconds: print.duration, fingerprint: print.raw, matches },
      { onConflict: "object_key,algorithm" },
    );
    if (saved.error) throw new Error("sample_fp_save_failed");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 3) catalogue work check

export type ClaimedWorkCheck = { id: string; owner_id: string; project_id: string; master_job_id: string; result_object_key: string };

export async function claimNextWorkCheck(cfg: RunConfig): Promise<ClaimedWorkCheck | null> {
  const { data, error } = await createSupabaseAdminClient().rpc("claim_next_work_rights_check", { p_worker_ref: cfg.workerRef });
  if (error) {
    // Migration not applied yet: back off quietly.
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error(`work_check_claim_failed:${error.code ?? "?"}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as ClaimedWorkCheck | null;
  return row?.id ? row : null;
}

type ProjectFile = { kind: RightsFileKind; ref: string; bucket: string; key: string; master?: boolean };

async function projectFiles(admin: Admin, job: ClaimedWorkCheck): Promise<{ files: ProjectFile[]; truncated: boolean; projectBeatId: string | null; ownBeatRejected: boolean }> {
  const project = await admin.from("studio_projects").select("id, owner_id, beat_id").eq("id", job.project_id).maybeSingle();
  if (project.error || !project.data || project.data.owner_id !== job.owner_id) throw new Error("project_missing");
  const projectBeatId = (project.data.beat_id as string | null) ?? null;
  const files: ProjectFile[] = [{ kind: "master", ref: job.master_job_id, bucket: MASTER_BUCKET, key: job.result_object_key, master: true }];
  let ownBeatRejected = false;

  if (projectBeatId) {
    const beat = await admin.from("beats").select("id, owner_id, status").eq("id", projectBeatId).maybeSingle();
    if (beat.error) throw new Error("beat_load_failed");
    const b = beat.data as { owner_id: string | null; status: string } | null;
    // A user's own beat that never went through moderation is an uploaded file like any other.
    if (b && b.owner_id && !["APPROVED", "PUBLISHED"].includes(b.status)) {
      if (b.status === "REJECTED") ownBeatRejected = true;
      const asset = await admin
        .from("beat_audio_assets")
        .select("storage_bucket, object_key")
        .eq("beat_id", projectBeatId)
        .eq("purpose", "MASTER")
        .eq("is_active", true)
        .maybeSingle();
      if (asset.data) files.push({ kind: "own_beat", ref: projectBeatId, bucket: String(asset.data.storage_bucket), key: String(asset.data.object_key) });
    }
  }

  const tracks = await admin.from("studio_tracks").select("id").eq("project_id", job.project_id);
  if (tracks.error) throw new Error("tracks_load_failed");
  const trackIds = (tracks.data ?? []).map((t) => String(t.id));
  if (trackIds.length) {
    const clips = await admin.from("studio_clips").select("source_take_id").in("track_id", trackIds).eq("source_kind", "TAKE");
    if (clips.error) throw new Error("clips_load_failed");
    const takeIds = [...new Set((clips.data ?? []).map((c) => c.source_take_id).filter(Boolean).map(String))];
    if (takeIds.length) {
      const takes = await admin
        .from("takes")
        .select("id, owner_id, title, is_stem, storage_bucket, object_key, deleted_at, object_removed_at")
        .in("id", takeIds);
      if (takes.error) throw new Error("takes_load_failed");
      const sampleIds: string[] = [];
      const rows = (takes.data ?? []) as Array<{ id: string; owner_id: string | null; title: string | null; is_stem: boolean | null; storage_bucket: string | null; object_key: string | null; deleted_at: string | null; object_removed_at: string | null }>;
      for (const t of rows) {
        const smp = t.title?.startsWith("smp:") ? t.title.slice(4) : null;
        if (smp) sampleIds.push(smp);
      }
      const published = new Set<string>();
      if (sampleIds.length) {
        const s = await admin.from("studio_samples").select("id").in("id", sampleIds).eq("status", "PUBLISHED");
        if (s.error) throw new Error("samples_load_failed");
        for (const r of s.data ?? []) published.add(String(r.id));
      }
      for (const t of rows) {
        if (t.owner_id !== job.owner_id || t.deleted_at || t.object_removed_at || !t.storage_bucket || !t.object_key) continue;
        if (t.title?.startsWith("catalog:")) continue; // our catalogue sample copy
        const smp = t.title?.startsWith("smp:") ? t.title.slice(4) : null;
        if (smp && published.has(smp)) continue; // a reviewed catalogue sample: allowed in songs
        files.push({ kind: t.is_stem ? "stem" : "take", ref: t.id, bucket: t.storage_bucket, key: t.object_key });
      }
    }
  }
  return { files: files.slice(0, MAX_FILES), truncated: files.length > MAX_FILES, projectBeatId, ownBeatRejected };
}

export async function runWorkCheck(cfg: RunConfig, job: ClaimedWorkCheck): Promise<string> {
  const admin = createSupabaseAdminClient();
  const work = await mkdtemp(path.join(tmpdir(), "brd-work-check-"));
  let passed = false;
  let result: Record<string, unknown> = {};
  let summary = "";
  try {
    const { files, truncated, projectBeatId, ownBeatRejected } = await projectFiles(admin, job);
    const refs = await loadBeatRefs(admin);
    // The project's own (catalogue) beat is allowed in the song and bleeds into vocal takes.
    const skip = new Set(projectBeatId ? [projectBeatId] : []);
    const results: RightsFileResult[] = [];
    let i = 0;
    for (const f of files) {
      const src = path.join(work, `f${i++}.bin`);
      try {
        if (f.master) await downloadMaster(admin, f.key, src);
        else await downloadTo(admin, f.bucket, f.key, src);
        const print = await fingerprintFile(cfg, work, src);
        const ext = await externalHits(cfg, print, f.ref);
        results.push({
          kind: f.kind, ref: f.ref, durationSeconds: print.duration,
          catalog: catalogHits(print, refs, f.kind === "own_beat" ? new Set() : skip),
          external: ext.hits, externalError: ext.error, error: null,
        });
      } catch (e) {
        results.push({ kind: f.kind, ref: f.ref, durationSeconds: null, catalog: [], external: [], externalError: null, error: e instanceof Error ? e.message.slice(0, 60) : "failed" });
      } finally {
        await rm(src, { force: true });
      }
    }
    const verdict = decideWorkRights({ files: results, ownBeatRejected, truncated });
    passed = verdict.passed;
    summary = verdict.summaryPl;
    result = { files: results, reasons: verdict.reasons, acoustid: cfg.acoustidKey ? "configured" : "not_configured" };
  } catch (e) {
    passed = false;
    summary = "Utwór czeka na moderatora. Sprawdzenie się nie udało.";
    result = { stage_error: e instanceof Error ? e.message.slice(0, 80) : "failed" };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  const { data, error } = await admin.rpc("complete_work_rights_check", {
    p_work_id: job.id, p_worker_ref: cfg.workerRef, p_passed: passed, p_result: result, p_summary: summary,
  });
  if (error) throw new Error(`work_check_complete_failed:${error.code ?? "?"}`);
  return String(data ?? (passed ? "passed" : "held"));
}
