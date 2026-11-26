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
import { CHROMAPRINT_ITEM_SECONDS, compareFingerprints, parseFpcalcJson, parseFpcalcRaw } from "@/lib/beats/auto-check/fingerprint";
import { createAcoustIdProvider } from "@/lib/beats/auto-check/providers";
import type { AutoCheckWorkerConfig } from "@/lib/beats/auto-check/worker-env";
import {
  decideWorkRights,
  isHardCatalogHit,
  isHardExternalHit,
  sameAudioBeatIds,
  type CatalogHit,
  type ExternalHit,
  type RightsFileKind,
  type RightsFileResult,
} from "@/lib/rights/rights-decision";
import { parseCatalogCopyTakeTitle } from "@/lib/catalog/catalog-originals";
import { partsOf } from "@/lib/studio/master/parts";
import { parseSampleCopyTakeTitle } from "@/lib/studio/samples/sample-policy";
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

/** Chromaprint needs a few seconds of sound: a one-shot sample or a short take is looped to this length. */
const SHORT_LOOP_SECONDS = 12;

async function fingerprintFile(cfg: RunConfig, work: string, src: string): Promise<Print> {
  const wav = path.join(work, `fp-${path.basename(src)}.wav`);
  const decode = (loop: boolean) =>
    runCapture(resolveFfmpegBin(), [
      "-nostdin", "-v", "error", "-y",
      ...(loop ? ["-stream_loop", "-1"] : []),
      "-i", src,
      "-t", String(loop ? SHORT_LOOP_SECONDS : Math.min(cfg.maxDurationSeconds, FILE_SECONDS)),
      "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", wav,
    ], { timeoutMs: 180_000 });
  const print = async (): Promise<Print> => {
    const raw = parseFpcalcRaw(await runCapture(cfg.fpcalcBin, ["-json", "-raw", "-length", "0", wav], { timeoutMs: 120_000 }));
    const compressed = parseFpcalcJson(await runCapture(cfg.fpcalcBin, ["-json", "-length", "120", wav], { timeoutMs: 120_000 }));
    return { duration: raw.duration, raw: raw.fingerprint, compressed: String(compressed.fingerprint) };
  };
  try {
    await decode(false);
    try {
      return await print();
    } catch (e) {
      // "Empty fingerprint": too short. Loop it (the duration reported is then the looped length).
      if (!(e instanceof Error) || !/empty fingerprint|bad_fingerprint|bad_duration/i.test(e.message)) throw e;
      await decode(true);
      return await print();
    }
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

export type ClaimedWorkCheck = {
  id: string; owner_id: string; project_id: string; master_job_id: string; result_object_key: string;
  /** Dry run only: judge these files instead of the project's. */
  files?: ProjectFile[];
};

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

export type ProjectFile = { kind: RightsFileKind; ref: string; bucket: string; key: string; master?: boolean };

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

  // Every take the project uses (clips on its tracks) and every stem uploaded to it, also deleted ones whose
  // file still exists: removing a clip or a take after mastering must not hide the source. Titles are not trusted.
  const tracks = await admin.from("studio_tracks").select("id").eq("project_id", job.project_id).limit(1000);
  if (tracks.error) throw new Error("tracks_load_failed");
  const trackIds = (tracks.data ?? []).map((t) => String(t.id));
  const takeIds = new Set<string>();
  for (let i = 0; i < trackIds.length; i += 100) {
    for (let from = 0; ; from += PAGE) {
      const clips = await admin
        .from("studio_clips")
        .select("id, source_take_id")
        .in("track_id", trackIds.slice(i, i + 100))
        .eq("source_kind", "TAKE")
        .order("id")
        .range(from, from + PAGE - 1);
      if (clips.error) throw new Error("clips_load_failed");
      for (const c of clips.data ?? []) if (c.source_take_id) takeIds.add(String(c.source_take_id));
      if ((clips.data ?? []).length < PAGE) break;
    }
  }
  const stems = await admin.from("takes").select("id").eq("stem_project_id", job.project_id).eq("owner_id", job.owner_id).is("object_removed_at", null).limit(1000);
  if (stems.error) throw new Error("takes_load_failed");
  for (const t of stems.data ?? []) takeIds.add(String(t.id));
  const ids = [...takeIds];
  type TakeRow = { id: string; owner_id: string | null; title: string | null; byte_size: number | null; is_stem: boolean | null; storage_bucket: string | null; object_key: string | null; object_removed_at: string | null };
  const rows: TakeRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const takes = await admin
      .from("takes")
      .select("id, owner_id, title, byte_size, is_stem, storage_bucket, object_key, object_removed_at")
      .in("id", ids.slice(i, i + 100));
    if (takes.error) throw new Error("takes_load_failed");
    rows.push(...((takes.data ?? []) as TakeRow[]));
  }
  // Copies of reviewed catalogue samples are allowed in songs. The title is only a hint: the copy must be
  // byte-identical (same size) to a PUBLISHED sample or catalogue asset, otherwise it is checked like any upload.
  const smpIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const t of rows) {
    const smp = parseSampleCopyTakeTitle(t.title);
    if (smp) smpIds.add(smp);
    const cat = parseCatalogCopyTakeTitle(t.title);
    if (cat) assetIds.add(cat.catalogAssetId);
  }
  const sampleSize = new Map<string, number>();
  const assetSize = new Map<string, number>();
  const smpList = [...smpIds];
  for (let i = 0; i < smpList.length; i += 100) {
    const r = await admin.from("studio_samples").select("id, byte_size").in("id", smpList.slice(i, i + 100)).eq("status", "PUBLISHED");
    if (r.error) throw new Error("samples_load_failed");
    for (const x of r.data ?? []) sampleSize.set(String(x.id), Number(x.byte_size));
  }
  const assetList = [...assetIds];
  for (let i = 0; i < assetList.length; i += 100) {
    const r = await admin.from("catalog_assets").select("id, byte_size").in("id", assetList.slice(i, i + 100)).eq("publish_state", "PUBLISHED");
    if (r.error) throw new Error("assets_load_failed");
    for (const x of r.data ?? []) assetSize.set(String(x.id), Number(x.byte_size));
  }
  for (const t of rows) {
    if (t.owner_id !== job.owner_id || t.object_removed_at || !t.storage_bucket || !t.object_key) continue;
    const size = Number(t.byte_size);
    const smp = parseSampleCopyTakeTitle(t.title);
    if (smp && sampleSize.has(smp) && sampleSize.get(smp) === size) continue;
    const cat = parseCatalogCopyTakeTitle(t.title);
    if (cat && cat.projectId === job.project_id && assetSize.has(cat.catalogAssetId) && assetSize.get(cat.catalogAssetId) === size) continue;
    files.push({ kind: t.is_stem ? "stem" : "take", ref: t.id, bucket: t.storage_bucket, key: t.object_key });
  }
  return { files: files.slice(0, MAX_FILES), truncated: files.length > MAX_FILES, projectBeatId, ownBeatRejected };
}

/** Fingerprint and judge one work without writing anything (worker + dry-run script). */
export async function evaluateWork(cfg: RunConfig, job: ClaimedWorkCheck): Promise<{ passed: boolean; result: Record<string, unknown>; summary: string }> {
  const admin = createSupabaseAdminClient();
  const work = await mkdtemp(path.join(tmpdir(), "brd-work-check-"));
  try {
    const planned = job.id === "dry-run" && job.files
      ? { files: job.files, truncated: false, projectBeatId: null, ownBeatRejected: false }
      : await projectFiles(admin, job);
    const { files, truncated, projectBeatId, ownBeatRejected } = planned;
    const refs = await loadBeatRefs(admin);
    // The project's own (catalogue) beat is allowed in the song and bleeds into vocal takes.
    const skip = new Set(projectBeatId ? [projectBeatId] : []);
    // ...and so are catalogue copies of the same recording (e.g. a "(remix)" entry identical to the beat).
    const projectRef = projectBeatId ? refs.find((r) => r.source === "beat" && r.id === projectBeatId) : undefined;
    if (projectRef) {
      const seconds = projectRef.fingerprint.length * CHROMAPRINT_ITEM_SECONDS;
      for (const id of sameAudioBeatIds({ id: projectRef.id, fingerprint: projectRef.fingerprint, durationSeconds: seconds }, refs, compareFingerprints)) skip.add(id);
    }
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
    return {
      passed: verdict.passed,
      summary: verdict.summaryPl,
      result: { files: results, reasons: verdict.reasons, findings: verdict.findings, acoustid: cfg.acoustidKey ? "configured" : "not_configured", catalogRefs: refs.length },
    };
  } catch (e) {
    return {
      passed: false,
      summary: "Utwór czeka na moderatora. Sprawdzenie się nie udało.",
      result: { stage_error: e instanceof Error ? e.message.slice(0, 80) : "failed" },
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function runWorkCheck(cfg: RunConfig, job: ClaimedWorkCheck): Promise<string> {
  const { passed, result, summary } = await evaluateWork(cfg, job);
  const { data, error } = await createSupabaseAdminClient().rpc("complete_work_rights_check", {
    p_work_id: job.id, p_worker_ref: cfg.workerRef, p_passed: passed, p_result: result, p_summary: summary,
  });
  if (error) throw new Error(`work_check_complete_failed:${error.code ?? "?"}`);
  return String(data ?? (passed ? "passed" : "held"));
}
