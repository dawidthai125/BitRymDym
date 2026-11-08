import "server-only";

import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { decideNoiseSave } from "../noise-decision";
import { readCanonicalWavInfo } from "../studio-wav-mono";

const BUCKET = "audio-artifacts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function clipNoiseObjectKey(ownerId: string, takeId: string, jobId: string): string {
  return `studio-cleanup/${ownerId}/${takeId}/${jobId}.wav`;
}

type TakeRow = {
  id: string;
  owner_id: string;
  status: string;
  duration_seconds: number | null;
  expires_at: string | null;
  deleted_at: string | null;
};

type ClipContext = { take: TakeRow; projectId: string };

async function clipTake(ownerId: string, projectId: string, clipId: string): Promise<ClipContext | null> {
  if (!UUID.test(projectId) || !UUID.test(clipId)) return null;
  const admin = createSupabaseAdminClient();
  const { data: clip, error } = await admin
    .from("studio_clips")
    .select("track_id, source_kind, source_take_id")
    .eq("id", clipId)
    .maybeSingle();
  if (error) throw new Error("noise_clip_lookup");
  const row = clip as { track_id: string; source_kind: string; source_take_id: string | null } | null;
  if (!row || row.source_kind !== "TAKE" || !row.source_take_id) return null;
  const { data: track, error: trackError } = await admin
    .from("studio_tracks")
    .select("project_id")
    .eq("id", row.track_id)
    .maybeSingle();
  if (trackError) throw new Error("noise_track_lookup");
  if ((track as { project_id?: string } | null)?.project_id !== projectId) return null;
  const { data: project, error: projectError } = await admin
    .from("studio_projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (projectError) throw new Error("noise_project_lookup");
  if (!project) return null;
  const { data: take, error: takeError } = await admin
    .from("takes")
    .select("id, owner_id, status, duration_seconds, expires_at, deleted_at")
    .eq("id", row.source_take_id)
    .maybeSingle();
  if (takeError) throw new Error("noise_take_lookup");
  const takeRow = take as TakeRow | null;
  if (!takeRow || takeRow.owner_id !== ownerId) return null;
  return { take: takeRow, projectId };
}

function takeReady(take: TakeRow): boolean {
  if (take.status !== "READY" || take.deleted_at) return false;
  if (take.expires_at && Date.parse(take.expires_at) <= Date.now()) return false;
  return true;
}

export async function prepareClipNoiseUpload(p: { ownerId: string; projectId: string; clipId: string }) {
  const found = await clipTake(p.ownerId, p.projectId, p.clipId);
  if (!found) return { ok: false as const, error: "not_found" };
  if (!takeReady(found.take)) return { ok: false as const, error: "take_unavailable" };
  const jobId = randomUUID();
  const key = clipNoiseObjectKey(p.ownerId, found.take.id, jobId);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(key);
  if (error || !data?.token || data.path !== key) return { ok: false as const, error: "upload_unavailable" };
  return { ok: true as const, jobId, bucket: BUCKET, path: key, token: data.token };
}

async function listedSize(key: string): Promise<number | null> {
  const slash = key.lastIndexOf("/");
  if (slash <= 0) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).list(key.slice(0, slash), { search: key.slice(slash + 1), limit: 10 });
  if (error || !data) return null;
  const hit = data.find((item) => item.name === key.slice(slash + 1));
  const size = (hit?.metadata as { size?: unknown } | undefined)?.size;
  const n = typeof size === "number" ? size : Number(size);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function readPrefix(response: Response, max: number): Promise<Uint8Array> {
  if (!response.body) {
    const all = new Uint8Array(await response.arrayBuffer());
    return all.subarray(0, max);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (got < max) {
    const step = await reader.read();
    if (step.done || !step.value) break;
    chunks.push(step.value);
    got += step.value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const out = new Uint8Array(Math.min(max, got));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, out.length - offset);
    out.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= out.length) break;
  }
  return out;
}

async function objectHead(key: string): Promise<{ bytes: Uint8Array; total: number } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(key, 60);
  if (error || !data?.signedUrl) return null;
  const response = await fetch(data.signedUrl, { headers: { Range: "bytes=0-127" } });
  if (!response.ok && response.status !== 206) return null;
  const bytes = await readPrefix(response, 128);
  const range = response.headers.get("content-range");
  const matched = range ? /\/(\d+)\s*$/.exec(range) : null;
  const headerTotal = matched
    ? Number(matched[1])
    : response.status === 200
      ? Number(response.headers.get("content-length"))
      : Number.NaN;
  const listed = await listedSize(key);
  const total = listed ?? (Number.isFinite(headerTotal) ? headerTotal : Number.NaN);
  if (!Number.isFinite(total)) return null;
  return { bytes, total };
}

export async function commitClipNoiseUpload(p: { ownerId: string; projectId: string; clipId: string; jobId: string }) {
  if (!UUID.test(p.jobId)) return { ok: false as const, error: "bad_request" };
  const found = await clipTake(p.ownerId, p.projectId, p.clipId);
  if (!found) return { ok: false as const, error: "not_found" };
  if (!takeReady(found.take)) return { ok: false as const, error: "take_unavailable" };
  const key = clipNoiseObjectKey(p.ownerId, found.take.id, p.jobId);
  const head = await objectHead(key);
  if (!head) return { ok: false as const, error: "not_uploaded" };
  const info = readCanonicalWavInfo(head.bytes);
  if (!info || head.total !== 44 + info.dataBytes) return { ok: false as const, error: "bad_wav" };
  const decision = decideNoiseSave({
    wavSeconds: info.dataBytes / 2 / info.sampleRate,
    byteSize: head.total,
    takeSeconds: found.take.duration_seconds == null ? null : Number(found.take.duration_seconds),
  });
  if (!decision.ok) {
    await createSupabaseAdminClient().storage.from(BUCKET).remove([key]);
    return decision;
  }
  const admin = createSupabaseAdminClient();
  const { error: insertError } = await admin.from("studio_cleanup_jobs").insert({
    id: p.jobId,
    owner_id: p.ownerId,
    project_id: p.projectId,
    take_id: found.take.id,
    status: "succeeded",
    settings: { source: "clip_noise" },
    result_object_key: key,
    applied: false,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
  if (insertError) {
    await admin.storage.from(BUCKET).remove([key]);
    return { ok: false as const, error: "save_failed" };
  }
  const { error: applyError } = await admin.rpc("apply_studio_cleanup_job", {
    p_owner: p.ownerId,
    p_take: found.take.id,
    p_job: p.jobId,
  });
  if (applyError) {
    await admin.from("studio_cleanup_jobs").delete().eq("id", p.jobId).eq("owner_id", p.ownerId);
    await admin.storage.from(BUCKET).remove([key]);
    return { ok: false as const, error: "save_failed" };
  }
  return { ok: true as const, jobId: p.jobId };
}
