/**
 * Render + store the guest preview asset for one beat (service_role only).
 * Used by the E3 auto-check worker (after an upload is checked), the idle
 * sweep, and scripts/beat-preview-backfill.ts. Logs/returns never include
 * keys, signed URLs or object paths.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveFfmpegBin,
  resolveFfprobeBin,
  runCapture,
} from "@/lib/audio/native-ffmpeg";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import {
  BEAT_PREVIEW_CONTENT_TYPE,
  beatTagTiming,
  buildPreviewFfmpegArgs,
  buildPreviewObjectKey,
  isPreviewFresh,
  paidWatermarkPreviewSourceMarker,
  previewSourceMarker,
} from "@/lib/beats/preview/beat-preview";
import {
  previewMixArgs,
  tagCycleArgs,
} from "@/lib/studio/master/preview";
import { PREVIEW_TAG_WAV_BASE64 } from "@/lib/studio/master/preview-tag";
import type { BeatOwnershipType } from "@/types/domain";

export type PreviewOutcome =
  | "skipped_fresh"
  | "would_create"
  | "would_replace"
  | "created"
  | "replaced"
  | "failed";

export type PreviewResult = {
  beatId: string;
  outcome: PreviewOutcome;
  previewAssetId?: string;
  byteSize?: number;
  errorCode?: string;
};

type AssetRow = {
  id: string;
  status: string;
  is_active: boolean;
  object_key: string;
  storage_bucket: string;
  original_filename: string | null;
};

export type PreviewDeps = {
  admin: SupabaseClient;
  /** Runs ffmpeg with the given args (default: native binary). */
  runFfmpeg?: (args: string[]) => Promise<void>;
  /** Source duration in seconds, or null when unknown. */
  probeDuration?: (file: string) => Promise<number | null>;
};

const ASSET_COLS = "id, status, is_active, object_key, storage_bucket, original_filename";

async function defaultRunFfmpeg(args: string[]): Promise<void> {
  await runCapture(resolveFfmpegBin(), args, { timeoutMs: 180_000 });
}

/** ffprobe container duration in seconds, or null (also reused by the work clip cut on E3). */
export async function probeAudioDurationSeconds(file: string): Promise<number | null> {
  try {
    const out = await runCapture(
      resolveFfprobeBin(),
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { timeoutMs: 60_000 },
    );
    const n = Number(String(out).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Every catalog lane gets the watermarked full preview (free since 2026-11-22). */
export function previewKindForLane(_catalogLane: string | null): "paidWm" | "short" {
  return "paidWm";
}

function fail(beatId: string, errorCode: string): PreviewResult {
  return { beatId, outcome: "failed", errorCode };
}

export async function ensureBeatPreviewAsset(
  deps: PreviewDeps,
  params: { beatId: string; force?: boolean; dryRun?: boolean },
): Promise<PreviewResult> {
  const { admin } = deps;
  const { beatId } = params;

  const { data: beat, error: beatErr } = await admin
    .from("beats")
    .select("id, ownership_type, owner_id, catalog_lane, bpm")
    .eq("id", beatId)
    .maybeSingle();
  if (beatErr) return fail(beatId, "beat_load_failed");
  if (!beat) return fail(beatId, "beat_missing");
  // Both lanes: full length with the voice tag in every 3rd bar (Owner 2026-11-22: the free-lane clean
  // 20 s cut is gone). Guests are still capped at 20 s by audio-access.
  const previewKind = previewKindForLane(beat.catalog_lane as string | null);
  const paidWm = previewKind === "paidWm";

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

  const { data: current, error: pErr } = await admin
    .from("beat_audio_assets")
    .select(ASSET_COLS)
    .eq("beat_id", beatId)
    .eq("purpose", "PREVIEW")
    .eq("is_active", true)
    .maybeSingle();
  if (pErr) return fail(beatId, "preview_load_failed");
  const currentRow = (current as AssetRow | null) ?? null;

  if (
    !params.force &&
    isPreviewFresh({
      preview: currentRow,
      masterAssetId: masterRow.id,
      kind: previewKind,
    })
  ) {
    return { beatId, outcome: "skipped_fresh", previewAssetId: currentRow!.id };
  }
  if (params.dryRun) {
    return { beatId, outcome: currentRow ? "would_replace" : "would_create" };
  }

  const work = await mkdtemp(path.join(tmpdir(), "brd-preview-"));
  const runFfmpeg = deps.runFfmpeg ?? defaultRunFfmpeg;
  const probe = deps.probeDuration ?? probeAudioDurationSeconds;
  let uploadedKey: string | null = null;
  try {
    const { data: blob, error: dErr } = await admin.storage
      .from(masterRow.storage_bucket)
      .download(masterRow.object_key);
    if (dErr || !blob) return fail(beatId, "master_download_failed");
    const src = path.join(work, "master.bin");
    await writeFile(src, Buffer.from(await blob.arrayBuffer()));

    const out = path.join(work, "preview.mp3");
    try {
      if (paidWm) {
        const tag = path.join(work, "wm_tag.wav");
        const cycle = path.join(work, "wm_tag_cycle.wav");
        await writeFile(tag, Buffer.from(PREVIEW_TAG_WAV_BASE64, "base64"));
        await runFfmpeg(tagCycleArgs(tag, cycle, beatTagTiming(Number(beat.bpm) || null)));
        await runFfmpeg(previewMixArgs(src, cycle, out));
      } else {
        await runFfmpeg(
          buildPreviewFfmpegArgs({
            input: src,
            output: out,
            sourceDurationSeconds: await probe(src),
          }),
        );
      }
    } catch {
      return fail(beatId, "ffmpeg_failed");
    }
    const bytes = await readFile(out).catch(() => null);
    if (!bytes || bytes.byteLength === 0) return fail(beatId, "preview_empty");

    const assetId = randomUUID();
    const objectKey = buildPreviewObjectKey({
      ownershipType: beat.ownership_type as BeatOwnershipType,
      ownerId: (beat.owner_id as string | null) ?? null,
      beatId,
      assetId,
    });
    const { error: upErr } = await admin.storage
      .from(BEAT_AUDIO_BUCKET)
      .upload(objectKey, bytes, { contentType: BEAT_PREVIEW_CONTENT_TYPE, upsert: false });
    if (upErr) return fail(beatId, "upload_failed");
    uploadedKey = objectKey;

    const { error: insErr } = await admin.from("beat_audio_assets").insert({
      id: assetId,
      beat_id: beatId,
      purpose: "PREVIEW",
      status: "READY",
      storage_bucket: BEAT_AUDIO_BUCKET,
      object_key: objectKey,
      content_type: BEAT_PREVIEW_CONTENT_TYPE,
      byte_size: bytes.byteLength,
      checksum_sha256: createHash("sha256").update(bytes).digest("hex"),
      original_filename: paidWm
        ? paidWatermarkPreviewSourceMarker(masterRow.id)
        : previewSourceMarker(masterRow.id),
      is_active: false,
    });
    if (insErr) return fail(beatId, "asset_insert_failed");
    uploadedKey = null; // row owns the object now

    if (currentRow) {
      const { error: oldErr } = await admin
        .from("beat_audio_assets")
        .update({ is_active: false, status: "REPLACED", replaced_by_asset_id: assetId })
        .eq("id", currentRow.id);
      if (oldErr) return fail(beatId, "old_preview_deactivate_failed");
    }
    const { error: actErr } = await admin
      .from("beat_audio_assets")
      .update({ is_active: true })
      .eq("id", assetId);
    if (actErr) {
      if (currentRow) {
        // Put the previous preview back so guests are not left without one.
        await admin
          .from("beat_audio_assets")
          .update({ is_active: true, status: "READY", replaced_by_asset_id: null })
          .eq("id", currentRow.id);
      }
      return fail(beatId, "activate_failed");
    }
    return {
      beatId,
      outcome: currentRow ? "replaced" : "created",
      previewAssetId: assetId,
      byteSize: bytes.byteLength,
    };
  } finally {
    if (uploadedKey) {
      await admin.storage.from(BEAT_AUDIO_BUCKET).remove([uploadedKey]).catch(() => undefined);
    }
    await rm(work, { recursive: true, force: true });
  }
}

/** Published beats whose active PREVIEW is missing or stale (cheap DB-only scan). */
export async function listBeatsNeedingPreview(
  admin: SupabaseClient,
  options?: { limit?: number; includeUnpublished?: boolean },
): Promise<string[]> {
  let q = admin
    .from("beats")
    .select("id, catalog_lane")
    .order("created_at", { ascending: true });
  if (!options?.includeUnpublished) q = q.eq("status", "PUBLISHED");
  const { data: beats, error } = await q;
  if (error) throw new Error("beats_list_failed");
  const rows = beats ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((b) => b.id as string);
  const laneById = new Map(
    rows.map((b) => [b.id as string, previewKindForLane(b.catalog_lane as string | null)]),
  );

  const { data: assets, error: aErr } = await admin
    .from("beat_audio_assets")
    .select("id, beat_id, purpose, status, is_active, original_filename")
    .in("beat_id", ids)
    .in("purpose", ["MASTER", "PREVIEW"])
    .eq("is_active", true);
  if (aErr) throw new Error("assets_list_failed");

  const master = new Map<string, string>();
  const preview = new Map<string, AssetRow>();
  for (const a of assets ?? []) {
    if (a.purpose === "MASTER" && a.status === "READY") master.set(a.beat_id as string, a.id as string);
    if (a.purpose === "PREVIEW") preview.set(a.beat_id as string, a as unknown as AssetRow);
  }
  const out = ids.filter((id) => {
    const m = master.get(id);
    if (!m) return false; // nothing to cut from
    return !isPreviewFresh({
      preview: preview.get(id) ?? null,
      masterAssetId: m,
      kind: laneById.get(id) ?? "short",
    });
  });
  return typeof options?.limit === "number" ? out.slice(0, options.limit) : out;
}
