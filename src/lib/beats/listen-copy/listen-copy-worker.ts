/**
 * E3 host: renders personal listen copies (see listen-copy-server.ts) and reads audio for the leak tool.
 * Master → 44.1 kHz stereo float → mark of the copy id → 256 kbps MP3 → beat-audio/listen/{beatId}/{copyId}.mp3.
 * Logs never include keys, signed URLs or user ids.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveFfmpegBin, runCapture } from "@/lib/audio/native-ffmpeg";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import { detectWatermark, embedWatermark } from "@/lib/beats/listen-copy/watermark";

export const LISTEN_COPY_SAMPLE_RATE = 44_100;
export const LISTEN_COPY_BITRATE = "256k";
/** Copies nobody opened for this long are deleted (a new open renders a fresh one). */
export const LISTEN_COPY_RETENTION_DAYS = 30;

export type ListenCopyJob = {
  id: string;
  beat_id: string;
  user_id: string;
  master_asset_id: string;
  attempts: number;
};

export function listenCopyKey(beatId: string, copyId: string): string {
  return `listen/${beatId}/${copyId}.mp3`;
}

/** ffmpeg: any audio file → raw little-endian float, fixed rate and channel count. */
export function decodeToFloatArgs(input: string, output: string, channels: number): string[] {
  return ["-nostdin", "-v", "error", "-y", "-i", input, "-vn", "-f", "f32le", "-ac", String(channels), "-ar", String(LISTEN_COPY_SAMPLE_RATE), output];
}

/** ffmpeg: raw float stereo → CBR MP3 with a gapless (LAME) header, no metadata. */
export function encodeListenCopyArgs(input: string, output: string): string[] {
  return [
    "-nostdin", "-v", "error", "-y",
    "-f", "f32le", "-ar", String(LISTEN_COPY_SAMPLE_RATE), "-ac", "2", "-i", input,
    "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", LISTEN_COPY_BITRATE,
    // LAME -q 7: about twice as fast; at 256 kbps the difference is not audible, and a listener waits for this.
    "-compression_level", "7", "-f", "mp3", output,
  ];
}

export async function readFloatFile(file: string): Promise<Float32Array> {
  const buf = await readFile(file);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)).slice();
}

/** Decode any audio file to mono float at 44.1 kHz (leak tool). */
export async function decodeMono(file: string, work: string, name: string): Promise<Float32Array> {
  const raw = path.join(work, `${name}.f32`);
  await runCapture(resolveFfmpegBin(), decodeToFloatArgs(file, raw, 1), { timeoutMs: 300_000 });
  return readFloatFile(raw);
}

/** Download the active master of a beat into `work`; returns the local path. */
export async function downloadMaster(admin: SupabaseClient, masterAssetId: string, work: string): Promise<string> {
  const { data: asset, error } = await admin
    .from("beat_audio_assets")
    .select("storage_bucket, object_key")
    .eq("id", masterAssetId)
    .maybeSingle();
  if (error || !asset) throw new Error("master_missing");
  const { data: blob, error: dErr } = await admin.storage
    .from(asset.storage_bucket as string)
    .download(asset.object_key as string);
  if (dErr || !blob) throw new Error("master_download_failed");
  const src = path.join(work, "master.bin");
  await writeFile(src, Buffer.from(await blob.arrayBuffer()));
  return src;
}

function errorCode(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  return /^[a-z_]{1,60}$/.test(m) ? m : "render_failed";
}

/** Render, upload and mark one claimed copy. Returns the outcome; never throws. */
export async function renderListenCopy(admin: SupabaseClient, job: ListenCopyJob): Promise<"ready" | "failed" | "retry"> {
  const work = await mkdtemp(path.join(tmpdir(), "brd-listen-"));
  try {
    const src = await downloadMaster(admin, job.master_asset_id, work);
    const rawIn = path.join(work, "in.f32");
    await runCapture(resolveFfmpegBin(), decodeToFloatArgs(src, rawIn, 2), { timeoutMs: 300_000 });
    const samples = await readFloatFile(rawIn);
    if (samples.length < LISTEN_COPY_SAMPLE_RATE * 2) throw new Error("master_too_short");
    const marked = embedWatermark(samples, 2, job.id);
    const rawOut = path.join(work, "out.f32");
    await writeFile(rawOut, Buffer.from(marked.buffer, marked.byteOffset, marked.byteLength));
    const mp3 = path.join(work, "copy.mp3");
    await runCapture(resolveFfmpegBin(), encodeListenCopyArgs(rawOut, mp3), { timeoutMs: 300_000 });
    const bytes = await readFile(mp3);
    if (bytes.byteLength < 1000) throw new Error("copy_empty");
    const key = listenCopyKey(job.beat_id, job.id);
    const { error: upErr } = await admin.storage
      .from(BEAT_AUDIO_BUCKET)
      .upload(key, bytes, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw new Error("upload_failed");
    const { error: updErr } = await admin
      .from("beat_listen_copies")
      .update({ status: "ready", object_key: key, byte_size: bytes.byteLength, ready_at: new Date().toISOString(), error_code: null })
      .eq("id", job.id);
    if (updErr) throw new Error("row_update_failed");
    return "ready";
  } catch (e) {
    const final = job.attempts >= 3;
    await admin
      .from("beat_listen_copies")
      .update({ status: final ? "failed" : "pending", error_code: errorCode(e) })
      .eq("id", job.id);
    return final ? "failed" : "retry";
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Delete copies nobody used for LISTEN_COPY_RETENTION_DAYS (file first, then the row). Returns how many. */
export async function purgeOldListenCopies(admin: SupabaseClient, now = Date.now(), limit = 200): Promise<number> {
  const cutoff = new Date(now - LISTEN_COPY_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("beat_listen_copies")
    .select("id, object_key")
    .lt("last_used_at", cutoff)
    .limit(limit);
  if (error || !data?.length) return 0;
  const keys = data.map((r) => r.object_key as string | null).filter((k): k is string => Boolean(k));
  if (keys.length) {
    const { error: rmErr } = await admin.storage.from(BEAT_AUDIO_BUCKET).remove(keys);
    if (rmErr) return 0;
  }
  const { error: delErr } = await admin.from("beat_listen_copies").delete().in("id", data.map((r) => r.id as string));
  return delErr ? 0 : data.length;
}

/** z at or above this is a match (wrong copies stay near 0; a real leak scores in the tens or hundreds). */
export const LEAK_MATCH_Z = 10;

export type LeakMatch = {
  copyId: string;
  userId: string;
  userNumber: number | null;
  name: string | null;
  z: number;
  match: boolean;
};

/**
 * Whose listen copy is `file`? Decodes it, aligns it with each master the beat's copies were made from and scores
 * every copy. Returns the top 5, best first (empty when the beat has no copies).
 */
export async function identifyLeak(admin: SupabaseClient, beatId: string, file: string): Promise<LeakMatch[]> {
  const { data: copies, error } = await admin
    .from("beat_listen_copies")
    .select("id, user_id, master_asset_id")
    .eq("beat_id", beatId);
  if (error) throw new Error("copies_load_failed");
  if (!copies?.length) return [];
  const work = await mkdtemp(path.join(tmpdir(), "brd-leak-"));
  try {
    const suspect = await decodeMono(file, work, "suspect");
    if (suspect.length < LISTEN_COPY_SAMPLE_RATE * 3) throw new Error("file_too_short");
    const byMaster = new Map<string, typeof copies>();
    for (const c of copies) {
      const key = c.master_asset_id as string;
      byMaster.set(key, [...(byMaster.get(key) ?? []), c]);
    }
    const scored: Array<{ copyId: string; userId: string; z: number }> = [];
    for (const [masterId, group] of byMaster) {
      const master = await decodeMono(await downloadMaster(admin, masterId, work), work, `master-${masterId}`);
      const r = detectWatermark(suspect, master, group.map((c) => c.id as string), LISTEN_COPY_SAMPLE_RATE);
      for (const s of r.scores) {
        const row = group.find((c) => c.id === s.copyId)!;
        scored.push({ copyId: s.copyId, userId: row.user_id as string, z: Math.round(s.z * 10) / 10 });
      }
    }
    scored.sort((a, b) => b.z - a.z);
    const top = scored.slice(0, 5);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, user_number, display_name")
      .in("id", top.map((t) => t.userId));
    return top.map((t) => {
      const p = profiles?.find((x) => x.id === t.userId);
      return {
        ...t,
        userNumber: (p?.user_number as number | null) ?? null,
        name: (p?.display_name as string | null) ?? null,
        match: t.z >= LEAK_MATCH_Z,
      };
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export type LeakCheckJob = { id: string; beat_id: string; object_key: string; attempts: number };

/** Admin "Wycieki": download the uploaded file, identify, store the result. Never throws. */
export async function runLeakCheck(admin: SupabaseClient, job: LeakCheckJob): Promise<"done" | "failed" | "retry"> {
  const work = await mkdtemp(path.join(tmpdir(), "brd-leakcheck-"));
  try {
    const { data: blob, error } = await admin.storage.from("leak-checks").download(job.object_key);
    if (error || !blob) throw new Error("file_download_failed");
    const file = path.join(work, "leak.bin");
    await writeFile(file, Buffer.from(await blob.arrayBuffer()));
    const matches = await identifyLeak(admin, job.beat_id, file);
    const { error: updErr } = await admin
      .from("leak_checks")
      .update({ status: "done", result: { matches }, error_code: null, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    if (updErr) throw new Error("row_update_failed");
    return "done";
  } catch (e) {
    const code = errorCode(e);
    // A file we cannot read will not get better on retry.
    const final = job.attempts >= 3 || code === "file_too_short" || code === "render_failed";
    await admin
      .from("leak_checks")
      .update({ status: final ? "failed" : "pending", error_code: code, finished_at: final ? new Date().toISOString() : null })
      .eq("id", job.id);
    return final ? "failed" : "retry";
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
