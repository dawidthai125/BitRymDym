/**
 * Contabo (auto-check host) encodes PLATFORM MASTER → admin OPS MP3.
 * Vercel request/signing lives in ops-mp3-request.ts (not loaded here).
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveFfmpegBin, runCapture } from "@/lib/audio/native-ffmpeg";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import {
  buildOpsMp3FfmpegArgs,
  buildOpsMp3ObjectKey,
  isOpsMp3Fresh,
  OPS_MP3_CONTENT_TYPE,
  OPS_MP3_WANTED_TAG,
  opsMp3SourceMarker,
  tagsWithoutOpsMp3Wanted,
} from "@/lib/beats/ops-mp3/ops-mp3";

export type OpsMp3Outcome =
  | "skipped_fresh"
  | "created"
  | "replaced"
  | "copied_mpeg_master"
  | "failed";

export type OpsMp3Result = {
  beatId: string;
  outcome: OpsMp3Outcome;
  assetId?: string;
  errorCode?: string;
};

type AssetRow = {
  id: string;
  status: string;
  is_active: boolean;
  object_key: string;
  storage_bucket: string;
  original_filename: string | null;
  content_type: string | null;
};

export type OpsMp3Deps = {
  admin: SupabaseClient;
  runFfmpeg?: (args: string[]) => Promise<void>;
};

const ASSET_COLS =
  "id, status, is_active, object_key, storage_bucket, original_filename, content_type";

async function defaultRunFfmpeg(args: string[]): Promise<void> {
  await runCapture(resolveFfmpegBin(), args, { timeoutMs: 180_000 });
}

function fail(beatId: string, errorCode: string): OpsMp3Result {
  return { beatId, outcome: "failed", errorCode };
}

function isMpeg(contentType: string | null): boolean {
  const raw = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return raw === "audio/mpeg" || raw === "audio/mp3";
}

export async function ensureOpsMp3Asset(
  deps: OpsMp3Deps,
  params: { beatId: string; force?: boolean },
): Promise<OpsMp3Result> {
  const { admin } = deps;
  const { beatId } = params;

  const { data: beat, error: beatErr } = await admin
    .from("beats")
    .select("id, ownership_type, tags")
    .eq("id", beatId)
    .maybeSingle();
  if (beatErr) return fail(beatId, "beat_load_failed");
  if (!beat || beat.ownership_type !== "PLATFORM") return fail(beatId, "not_platform");

  const { data: master, error: mErr } = await admin
    .from("beat_audio_assets")
    .select(ASSET_COLS)
    .eq("beat_id", beatId)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();
  if (mErr) return fail(beatId, "master_load_failed");
  if (!master) return fail(beatId, "master_missing");
  const masterRow = master as AssetRow;

  const { data: current, error: cErr } = await admin
    .from("beat_audio_assets")
    .select(ASSET_COLS)
    .eq("beat_id", beatId)
    .eq("purpose", "DOWNLOAD")
    .eq("is_active", true)
    .maybeSingle();
  if (cErr) return fail(beatId, "download_load_failed");
  const currentRow = (current as AssetRow | null) ?? null;

  if (
    !params.force &&
    isOpsMp3Fresh({ asset: currentRow, masterAssetId: masterRow.id })
  ) {
    await clearOpsMp3WantedTag(admin, beatId, beat.tags);
    return { beatId, outcome: "skipped_fresh", assetId: currentRow!.id };
  }

  // Master already MP3 — admin signs MASTER directly; just clear the queue tag.
  if (isMpeg(masterRow.content_type) && !params.force) {
    await clearOpsMp3WantedTag(admin, beatId, beat.tags);
    return { beatId, outcome: "copied_mpeg_master", assetId: masterRow.id };
  }

  const work = await mkdtemp(path.join(tmpdir(), "brd-ops-mp3-"));
  const runFfmpeg = deps.runFfmpeg ?? defaultRunFfmpeg;
  try {
    const srcBytes = await downloadMasterBytes(admin, masterRow);
    if (!srcBytes) return fail(beatId, "master_download_failed");
    const src = path.join(work, "master.bin");
    const out = path.join(work, "ops.mp3");
    await writeFile(src, srcBytes);
    try {
      await runFfmpeg(buildOpsMp3FfmpegArgs({ input: src, output: out }));
    } catch {
      return fail(beatId, "ffmpeg_failed");
    }
    const bytes = await readFile(out).catch(() => null);
    if (!bytes || bytes.byteLength === 0) return fail(beatId, "mp3_empty");

    const stored = await storeOpsMp3Bytes(admin, {
      beatId,
      masterId: masterRow.id,
      currentRow,
      bytes,
      contentType: OPS_MP3_CONTENT_TYPE,
    });
    if (!stored.ok) return fail(beatId, stored.errorCode);
    await clearOpsMp3WantedTag(admin, beatId, beat.tags);
    return {
      beatId,
      outcome: currentRow ? "replaced" : "created",
      assetId: stored.assetId,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function downloadMasterBytes(
  admin: SupabaseClient,
  master: AssetRow,
): Promise<Buffer | null> {
  const { data: blob, error } = await admin.storage
    .from(master.storage_bucket)
    .download(master.object_key);
  if (error || !blob) return null;
  return Buffer.from(await blob.arrayBuffer());
}

async function storeOpsMp3Bytes(
  admin: SupabaseClient,
  params: {
    beatId: string;
    masterId: string;
    currentRow: AssetRow | null;
    bytes: Buffer;
    contentType: string;
  },
): Promise<{ ok: true; assetId: string } | { ok: false; errorCode: string }> {
  const assetId = randomUUID();
  const objectKey = buildOpsMp3ObjectKey({ beatId: params.beatId, assetId });
  const { error: upErr } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .upload(objectKey, params.bytes, { contentType: params.contentType, upsert: false });
  if (upErr) return { ok: false, errorCode: "upload_failed" };

  const { error: insErr } = await admin.from("beat_audio_assets").insert({
    id: assetId,
    beat_id: params.beatId,
    purpose: "DOWNLOAD",
    status: "READY",
    storage_bucket: BEAT_AUDIO_BUCKET,
    object_key: objectKey,
    content_type: params.contentType,
    byte_size: params.bytes.byteLength,
    checksum_sha256: createHash("sha256").update(params.bytes).digest("hex"),
    original_filename: opsMp3SourceMarker(params.masterId),
    is_active: false,
  });
  if (insErr) {
    await admin.storage.from(BEAT_AUDIO_BUCKET).remove([objectKey]).catch(() => undefined);
    return { ok: false, errorCode: "asset_insert_failed" };
  }

  if (params.currentRow) {
    const { error: oldErr } = await admin
      .from("beat_audio_assets")
      .update({ is_active: false, status: "REPLACED", replaced_by_asset_id: assetId })
      .eq("id", params.currentRow.id);
    if (oldErr) return { ok: false, errorCode: "old_deactivate_failed" };
  }
  const { error: actErr } = await admin
    .from("beat_audio_assets")
    .update({ is_active: true })
    .eq("id", assetId);
  if (actErr) {
    if (params.currentRow) {
      await admin
        .from("beat_audio_assets")
        .update({ is_active: true, status: "READY", replaced_by_asset_id: null })
        .eq("id", params.currentRow.id);
    }
    return { ok: false, errorCode: "activate_failed" };
  }
  return { ok: true, assetId };
}

async function clearOpsMp3WantedTag(
  admin: SupabaseClient,
  beatId: string,
  tags: unknown,
): Promise<void> {
  const next = tagsWithoutOpsMp3Wanted(tags);
  const prev = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [];
  if (next.length === prev.length && !prev.includes(OPS_MP3_WANTED_TAG)) return;
  await admin.from("beats").update({ tags: next }).eq("id", beatId);
}

/** Beats tagged for Contabo encode, newest first. */
export async function listBeatsNeedingOpsMp3(
  admin: SupabaseClient,
  options?: { limit?: number },
): Promise<string[]> {
  const limit = Math.min(Math.max(options?.limit ?? 1, 1), 20);
  const { data, error } = await admin
    .from("beats")
    .select("id")
    .eq("ownership_type", "PLATFORM")
    .contains("tags", [OPS_MP3_WANTED_TAG])
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}
