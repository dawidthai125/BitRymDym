/**
 * REAL BEATS IMPORT — Owner GO operator script.
 *
 * Reuses the same PLATFORM audio-first pipeline as /admin/beats/new:
 *   createSignedUploadUrl → uploadToSignedUrl → analyzeBeatAudioBytes
 *   → metadata + READY → assertPublishHardGate → PUBLISHED
 *
 * Auth cookie gate is replaced by Owner GO + ADMIN created_by (Dawid #1).
 * Storage path uses signed upload only (no direct storage.upload).
 *
 * Usage:
 *   npx tsx --import ./scripts/_stub-server-only.mjs scripts/real-beats-import.ts --inventory
 *   npx tsx --import ./scripts/_stub-server-only.mjs scripts/real-beats-import.ts --execute-ready
 *   npx tsx --import ./scripts/_stub-server-only.mjs scripts/real-beats-import.ts --publish
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { analyzeBeatAudioBytes } from "../src/lib/beats/audio-duration";
import {
  buildBpmUncertaintyEnvelopeFromProbe,
  resolveCreateBpm,
  type BpmSelectionMode,
} from "../src/lib/beats/bpm-uncertainty";
import {
  BEAT_AUDIO_BUCKET,
  buildBeatAudioObjectKey,
  resolveAudioContentType,
  validateAudioUploadMeta,
} from "../src/lib/beats/audio-validation";
import { assertPublishHardGate } from "../src/lib/beats/admin-publish";
import { suggestTitleFromFilename } from "../src/lib/beats/filename-title";
import {
  BEAT_DURATION_MAX,
  BEAT_DURATION_MIN,
} from "../src/lib/beats/validation";

const SOURCE_DIR = "C:\\Users\\dawid\\Desktop\\bitybitrymdyn";
const DAWID_ID = "fdf04726-e971-42a7-9d46-8b9bdd099c23";
const OUT_DIR = join(process.cwd(), "docs", "audits");
const INVENTORY_PATH = join(OUT_DIR, "REAL_BEATS_IMPORT_INVENTORY.json");
const READY_PATH = join(OUT_DIR, "REAL_BEATS_IMPORT_READY_EVIDENCE.json");
const PUBLISH_PATH = join(OUT_DIR, "REAL_BEATS_IMPORT_PUBLISH_EVIDENCE.json");
const EXECUTION_PATH = join(OUT_DIR, "REAL_BEATS_IMPORT_EXECUTION_REPORT.md");

const FFPROBE =
  process.env.FFPROBE_PATH ||
  "C:\\Users\\dawid\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffprobe.exe";

type LocalFile = {
  filename: string;
  path: string;
  extension: string;
  size_bytes: number;
  sha256: string;
  duration_sec: number;
  duration_rounded: number;
  codec: string | null;
  sample_rate: number | null;
  channels: number | null;
  bitrate: number | null;
  proposed_title: string;
  bpm: number | null;
  genre: null;
  ownership: "PLATFORM";
  owner_id: null;
  status_plan: "DRAFT→READY→PUBLISH";
  preflight_blocker: string | null;
};

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of [".env", ".env.local"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      out[k] = v;
    }
  }
  return out;
}

function stop(msg: string): never {
  console.error(`STOP: ${msg}`);
  process.exit(2);
}

function adminClient() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) stop("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function listMp3(): string[] {
  return readdirSync(SOURCE_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .sort((a, b) => a.localeCompare(b, "pl"));
}

function probeFile(filename: string): LocalFile {
  const full = join(SOURCE_DIR, filename);
  const buf = readFileSync(full);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const raw = execFileSync(
    FFPROBE,
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      full,
    ],
    { encoding: "utf8" },
  );
  const j = JSON.parse(raw) as {
    format?: { duration?: string; bit_rate?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      sample_rate?: string;
      channels?: number;
      bit_rate?: string;
    }>;
  };
  const stream = (j.streams ?? []).find((s) => s.codec_type === "audio");
  const duration_sec = Number(j.format?.duration ?? 0);
  const duration_rounded = Math.round(duration_sec);
  const proposed_title = suggestTitleFromFilename(filename);
  let preflight_blocker: string | null = null;
  if (!proposed_title) preflight_blocker = "Empty title after stripping extension";
  if (duration_rounded < BEAT_DURATION_MIN)
    preflight_blocker = `Duration ${duration_rounded}s < min ${BEAT_DURATION_MIN}s`;
  if (duration_rounded > BEAT_DURATION_MAX)
    preflight_blocker = `Duration ${duration_rounded}s > BEAT_DURATION_MAX ${BEAT_DURATION_MAX}s (existing schema hard limit)`;

  return {
    filename,
    path: full,
    extension: ".mp3",
    size_bytes: buf.length,
    sha256,
    duration_sec,
    duration_rounded,
    codec: stream?.codec_name ?? null,
    sample_rate: stream?.sample_rate ? Number(stream.sample_rate) : null,
    channels: stream?.channels ?? null,
    bitrate: Number(stream?.bit_rate || j.format?.bit_rate || 0) || null,
    proposed_title,
    bpm: null,
    genre: null,
    ownership: "PLATFORM",
    owner_id: null,
    status_plan: "DRAFT→READY→PUBLISH",
    preflight_blocker,
  };
}

async function inventory(): Promise<LocalFile[]> {
  if (!existsSync(FFPROBE)) stop(`ffprobe not found: ${FFPROBE}`);
  const files = listMp3();
  if (files.length !== 17) stop(`Expected 17 MP3, found ${files.length}`);
  const rows = files.map(probeFile);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    INVENTORY_PATH,
    JSON.stringify(
      {
        inventoried_at: new Date().toISOString(),
        source_dir: SOURCE_DIR,
        count: rows.length,
        beat_duration_max: BEAT_DURATION_MAX,
        files: rows,
        blockers: rows.filter((r) => r.preflight_blocker),
      },
      null,
      2,
    ),
  );
  console.log(`Inventory written: ${INVENTORY_PATH}`);
  console.log(
    `Blockers: ${rows.filter((r) => r.preflight_blocker).length}`,
  );
  for (const b of rows.filter((r) => r.preflight_blocker)) {
    console.log(`  BLOCKER ${b.filename}: ${b.preflight_blocker}`);
  }
  return rows;
}

async function ensureEmptyCatalog(admin: ReturnType<typeof adminClient>) {
  const { count: beats } = await admin
    .from("beats")
    .select("*", { count: "exact", head: true });
  const { count: assets } = await admin
    .from("beat_audio_assets")
    .select("*", { count: "exact", head: true });
  if ((beats ?? 0) > 0 || (assets ?? 0) > 0) {
    // Allow re-run only if all beats are from this import (PLATFORM + our titles)
    // Hard stop if unexpected residual test data.
    stop(
      `Catalog not empty before import: beats=${beats} assets=${assets}. Expected clean post-cleanup state.`,
    );
  }
  const { data: objs } = await admin.storage.from(BEAT_AUDIO_BUCKET).list("", {
    limit: 1000,
  });
  // list root may return prefixes; also query storage.objects via rpc not available —
  // check via REST: use from beats empty + list platform folder
  const { data: platform } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .list("platform", { limit: 1000 });
  if ((platform ?? []).length > 0) {
    stop(`beat-audio/platform not empty (${platform?.length})`);
  }
  void objs;
}

async function shaExists(
  admin: ReturnType<typeof adminClient>,
  sha: string,
): Promise<boolean> {
  const { count } = await admin
    .from("beat_audio_assets")
    .select("*", { count: "exact", head: true })
    .eq("checksum_sha256", sha);
  return (count ?? 0) > 0;
}

async function cleanupFailedImport(
  admin: ReturnType<typeof adminClient>,
  params: { beatId: string; assetId: string; objectKey: string },
): Promise<void> {
  await admin.storage.from(BEAT_AUDIO_BUCKET).remove([params.objectKey]);
  await admin.from("beat_audio_assets").delete().eq("id", params.assetId);
  await admin.from("beats").delete().eq("id", params.beatId);
}

async function importOneReady(
  admin: ReturnType<typeof adminClient>,
  file: LocalFile,
): Promise<Record<string, unknown>> {
  if (file.preflight_blocker) {
    return {
      filename: file.filename,
      status: "BLOCKED_PREFLIGHT",
      blocker: file.preflight_blocker,
    };
  }
  if (await shaExists(admin, file.sha256)) {
    return {
      filename: file.filename,
      status: "BLOCKED_SHA_DUPLICATE",
      sha256: file.sha256,
    };
  }

  const contentType =
    resolveAudioContentType({
      fileType: "audio/mpeg",
      filename: file.filename,
    }) ?? "audio/mpeg";
  const meta = validateAudioUploadMeta({
    contentType,
    byteSize: file.size_bytes,
  });
  if (!meta.ok) {
    return {
      filename: file.filename,
      status: "BLOCKED_META",
      blocker: meta.errors.join("; "),
    };
  }

  const title = file.proposed_title;
  const beatId = randomUUID();
  const assetId = randomUUID();
  const objectKey = buildBeatAudioObjectKey({
    beatId,
    assetId,
    purpose: "MASTER",
  });

  // 1) DRAFT beat (PLATFORM, provisional bpm/duration — same as transport)
  const { error: beatErr } = await admin.from("beats").insert({
    id: beatId,
    ownership_type: "PLATFORM",
    owner_id: null,
    title,
    producer: null,
    description: null,
    genre: null,
    style: null,
    bpm: 1,
    key: null,
    scale: null,
    duration_seconds: 1,
    tags: [],
    cover_ref: null,
    status: "DRAFT",
    rejection_reason: null,
  });
  if (beatErr) throw new Error(`beat insert ${file.filename}: ${beatErr.message}`);

  // 2) PENDING_UPLOAD asset
  const { error: assetErr } = await admin.from("beat_audio_assets").insert({
    id: assetId,
    beat_id: beatId,
    purpose: "MASTER",
    status: "PENDING_UPLOAD",
    storage_bucket: BEAT_AUDIO_BUCKET,
    object_key: objectKey,
    content_type: contentType,
    byte_size: file.size_bytes,
    checksum_sha256: null,
    original_filename: file.filename,
    is_active: false,
    created_by: DAWID_ID,
  });
  if (assetErr) {
    await admin.from("beats").delete().eq("id", beatId);
    throw new Error(`asset insert ${file.filename}: ${assetErr.message}`);
  }

  // 3) Signed upload URL (same as transport)
  const { data: signed, error: signErr } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .createSignedUploadUrl(objectKey);
  if (signErr || !signed) {
    await cleanupFailedImport(admin, { beatId, assetId, objectKey });
    throw new Error(signErr?.message ?? "createSignedUploadUrl failed");
  }

  // 4) Binary upload via signed URL (not direct upload)
  const bytes = readFileSync(file.path);
  const { error: upErr } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, bytes, {
      contentType,
      upsert: false,
    });
  if (upErr) {
    await cleanupFailedImport(admin, { beatId, assetId, objectKey });
    throw new Error(`uploadToSignedUrl ${file.filename}: ${upErr.message}`);
  }

  // 5) Finalize re-probe from Storage (same security boundary as audio-transport)
  const { data: storedBlob, error: dlErr } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .download(objectKey);
  if (dlErr || !storedBlob) {
    await cleanupFailedImport(admin, { beatId, assetId, objectKey });
    return {
      filename: file.filename,
      beatId,
      assetId,
      status: "BLOCKED_STORAGE_REPROBE",
      blocker: dlErr?.message ?? "download for re-probe failed",
    };
  }
  const storedBytes = new Uint8Array(await storedBlob.arrayBuffer());
  const analyzed = await analyzeBeatAudioBytes({
    bytes: storedBytes,
    contentType,
    originalFilename: file.filename,
  });
  if (!analyzed.ok) {
    await cleanupFailedImport(admin, { beatId, assetId, objectKey });
    return {
      filename: file.filename,
      beatId,
      assetId,
      status: "BLOCKED_ANALYZE",
      blocker: analyzed.error,
    };
  }

  const envelope = buildBpmUncertaintyEnvelopeFromProbe(analyzed.bpmProbe);
  if (
    envelope.decision === "UNAVAILABLE" ||
    envelope.confidenceClass === "UNAVAILABLE" ||
    envelope.allowlist.length === 0
  ) {
    await cleanupFailedImport(admin, { beatId, assetId, objectKey });
    return {
      filename: file.filename,
      beatId,
      assetId,
      status: "BLOCKED_BPM_UNAVAILABLE",
      blocker: "UNAVAILABLE / empty allowlist — will not invent BPM",
      envelope,
    };
  }

  // BPM Quality V2: only HIGH AUTO may persist without an explicit Owner map.
  // CONFLICT/LOW/MEDIUM → BLOCKED_BPM_SELECTION_REQUIRED (no silent composite top).
  if (
    envelope.requiresExplicitSelection ||
    envelope.confidenceClass !== "HIGH" ||
    envelope.decision !== "AUTO_SUGGEST" ||
    envelope.detectedBpm == null ||
    !envelope.allowlist.includes(envelope.detectedBpm)
  ) {
    await cleanupFailedImport(admin, { beatId, assetId, objectKey });
    return {
      filename: file.filename,
      beatId,
      assetId,
      status: "BLOCKED_BPM_SELECTION_REQUIRED",
      blocker:
        "BLOCKED_BPM_SELECTION_REQUIRED — CONFLICT/LOW/MEDIUM cannot silent-persist composite top",
      confidenceClass: envelope.confidenceClass,
      detectedBpmRankingHint: envelope.detectedBpm,
      allowlist: envelope.allowlist,
      reason: envelope.reason,
    };
  }

  const clientBpm = envelope.detectedBpm;
  const selectionMode: BpmSelectionMode = "AUTO";

  const bpmResolved = resolveCreateBpm({
    clientBpm,
    envelope,
    selectionMode,
    bpmManualOverride: selectionMode !== "AUTO",
  });
  if (!bpmResolved.ok) {
    await cleanupFailedImport(admin, { beatId, assetId, objectKey });
    return {
      filename: file.filename,
      beatId,
      assetId,
      status: "BLOCKED_BPM_POLICY",
      blocker: bpmResolved.error,
      clientBpm,
      selectionMode,
      allowlist: envelope.allowlist,
    };
  }

  const checksum = createHash("sha256").update(storedBytes).digest("hex");
  if (checksum !== file.sha256) {
    await cleanupFailedImport(admin, { beatId, assetId, objectKey });
    stop(`SHA mismatch after Storage re-probe for ${file.filename}`);
  }

  // 6) Finalize metadata + READY
  const { error: metaErr } = await admin
    .from("beats")
    .update({
      title,
      producer: null,
      description: null,
      genre: null,
      style: null,
      bpm: bpmResolved.bpm,
      key: null,
      scale: null,
      duration_seconds: analyzed.durationSeconds,
      tags: [],
      cover_ref: null,
    })
    .eq("id", beatId);
  if (metaErr) throw new Error(metaErr.message);

  const { error: readyErr } = await admin
    .from("beat_audio_assets")
    .update({
      status: "READY",
      is_active: true,
      content_type: analyzed.contentType,
      byte_size: analyzed.byteSize,
      checksum_sha256: checksum,
    })
    .eq("id", assetId);
  if (readyErr) throw new Error(readyErr.message);

  // Storage version_id
  const { data: objRows } = await admin
    .schema("storage")
    .from("objects")
    .select("id, name, version, metadata")
    .eq("bucket_id", BEAT_AUDIO_BUCKET)
    .eq("name", objectKey)
    .maybeSingle();

  // Fallback: raw SQL via rpc not available — use list + head
  let versionId: string | null = (objRows as { version?: string } | null)?.version ?? null;
  if (!versionId) {
    // storage.objects may not be exposed via PostgREST schema — query via admin SQL not here
    versionId = null;
  }

  return {
    filename: file.filename,
    status: "READY",
    beatId,
    assetId,
    objectKey,
    version_id: versionId,
    title,
    bpm: bpmResolved.bpm,
    bpm_source: bpmResolved.bpmSource,
    bpm_selection_mode: selectionMode,
    confidence_class: envelope.confidenceClass,
    allowlist: envelope.allowlist,
    genre: null,
    duration_seconds: analyzed.durationSeconds,
    content_type: analyzed.contentType,
    byte_size: analyzed.byteSize,
    sha256: checksum,
    ownership_type: "PLATFORM",
    owner_id: null,
    beat_status: "DRAFT",
    asset_status: "READY",
  };
}

async function executeReady() {
  const files = await inventory();
  const admin = adminClient();

  // Verify Dawid untouched
  const { data: dawid } = await admin
    .from("profiles")
    .select("id,user_number,display_name,role")
    .eq("user_number", 1)
    .single();
  if (!dawid || dawid.id !== DAWID_ID) stop("Dawid profile mismatch");

  await ensureEmptyCatalog(admin);

  const results: Record<string, unknown>[] = [];
  for (const file of files) {
    console.log(`\n=== READY import: ${file.filename} ===`);
    try {
      const r = await importOneReady(admin, file);
      results.push(r);
      console.log(JSON.stringify(r, null, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ filename: file.filename, status: "ERROR", error: msg });
      console.error("ERROR", msg);
      stop(`Import aborted on ${file.filename}: ${msg}`);
    }
  }

  const ready = results.filter((r) => r.status === "READY");
  const blocked = results.filter((r) => String(r.status).startsWith("BLOCKED"));

  // Post READY counts
  const { count: beats } = await admin
    .from("beats")
    .select("*", { count: "exact", head: true });
  const { count: assets } = await admin
    .from("beat_audio_assets")
    .select("*", { count: "exact", head: true })
    .eq("status", "READY");

  const evidence = {
    finished_at: new Date().toISOString(),
    source_files: 17,
    ready_ok: ready.length,
    blocked: blocked.length,
    db_beats: beats,
    ready_assets: assets,
    dawid_profile: dawid,
    results,
  };
  writeFileSync(READY_PATH, JSON.stringify(evidence, null, 2));
  console.log(`\nREADY evidence: ${READY_PATH}`);
  console.log(`READY ${ready.length}/17 · BLOCKED ${blocked.length}`);
}

async function publishReady() {
  const admin = adminClient();
  if (!existsSync(READY_PATH)) stop("Missing READY evidence — run --execute-ready first");
  const readyEv = JSON.parse(readFileSync(READY_PATH, "utf8")) as {
    results: Array<Record<string, unknown>>;
  };

  const toPublish = readyEv.results.filter((r) => r.status === "READY");
  const published: Record<string, unknown>[] = [];

  for (const row of toPublish) {
    const beatId = String(row.beatId);
    const { data: beat, error } = await admin
      .from("beats")
      .select("id, ownership_type, status")
      .eq("id", beatId)
      .single();
    if (error || !beat) stop(`Beat missing ${beatId}`);
    if (beat.ownership_type !== "PLATFORM") stop(`Non-PLATFORM ${beatId}`);
    if (beat.status !== "DRAFT") stop(`Not DRAFT ${beatId}: ${beat.status}`);

    const { data: assets, error: aErr } = await admin
      .from("beat_audio_assets")
      .select("id, beat_id, purpose, status, is_active, object_key, checksum_sha256")
      .eq("beat_id", beatId);
    if (aErr) stop(aErr.message);

    const gate = assertPublishHardGate({
      beatId,
      ownershipType: "PLATFORM",
      status: "DRAFT",
      assetsForBeat: (assets ?? []).map((a) => ({
        id: a.id as string,
        beatId: a.beat_id as string,
        purpose: a.purpose as "MASTER",
        status: a.status as "READY",
        isActive: Boolean(a.is_active),
      })),
    });
    if (!gate.ok) {
      published.push({
        beatId,
        status: "BLOCKED_PUBLISH_GATE",
        reason: gate.reason,
      });
      continue;
    }

    // Verify storage object exists
    const objectKey = (assets ?? []).find((a) => a.is_active)?.object_key as
      | string
      | undefined;
    if (!objectKey) stop(`No active object_key for ${beatId}`);
    const { data: dl, error: dlErr } = await admin.storage
      .from(BEAT_AUDIO_BUCKET)
      .download(objectKey);
    if (dlErr || !dl) {
      published.push({
        beatId,
        status: "BLOCKED_STORAGE_MISSING",
        objectKey,
        error: dlErr?.message,
      });
      continue;
    }

    const { error: pubErr } = await admin
      .from("beats")
      .update({ status: "PUBLISHED", rejection_reason: null })
      .eq("id", beatId)
      .eq("status", "DRAFT");
    if (pubErr) stop(`Publish ${beatId}: ${pubErr.message}`);

    published.push({
      beatId,
      title: row.title,
      status: "PUBLISHED",
      objectKey,
      sha256: row.sha256,
      bpm: row.bpm,
    });
    console.log(`PUBLISHED ${row.title} (${beatId})`);
  }

  const { count: pubCount } = await admin
    .from("beats")
    .select("*", { count: "exact", head: true })
    .eq("status", "PUBLISHED");
  const { count: draftCount } = await admin
    .from("beats")
    .select("*", { count: "exact", head: true })
    .eq("status", "DRAFT");
  const { count: takes } = await admin
    .from("takes")
    .select("*", { count: "exact", head: true });
  const { count: downloads } = await admin
    .from("beat_download_events")
    .select("*", { count: "exact", head: true });
  const { data: dawid } = await admin
    .from("profiles")
    .select("id,user_number,display_name,role")
    .eq("user_number", 1)
    .single();

  const evidence = {
    finished_at: new Date().toISOString(),
    published_ok: published.filter((p) => p.status === "PUBLISHED").length,
    published_rows: published,
    post: {
      published: pubCount,
      drafts: draftCount,
      takes,
      download_events: downloads,
      dawid,
    },
  };
  writeFileSync(PUBLISH_PATH, JSON.stringify(evidence, null, 2));
  console.log(`Publish evidence: ${PUBLISH_PATH}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--inventory")) {
    await inventory();
    return;
  }
  if (args.includes("--execute-ready")) {
    await executeReady();
    return;
  }
  if (args.includes("--publish")) {
    await publishReady();
    return;
  }
  stop(
    "Pass --inventory | --execute-ready | --publish (Owner GO phases).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
