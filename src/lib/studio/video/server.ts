import "server-only";

/**
 * Gold — YouTube MP4 server logic (service_role, owner-checked, tier from the server
 * entitlement). The video is an E3 job (kind youtube_video) from the approved master +
 * one image: the beat's approved cover or the owner's own graphic, which passed the
 * same Gemini content filter as beat covers.
 */
import { randomUUID } from "node:crypto";

import { BEAT_COVER_BUCKET } from "@/config/beat-covers";
import { AuthError } from "@/lib/auth/session";
import { beatCoverUrl } from "@/lib/beats/cover/cover-url";
import { BEAT_USAGE_COLUMNS, beatUsageSubjectFromRow } from "@/lib/beats/usage/beat-usage-server";
import { canViewBeat, isBeatOwner } from "@/lib/beats/usage/beat-usage-policy";
import { hasActiveRecordGrant } from "@/lib/grants/beat-access-grants";
import { warsawDayStartIso } from "@/lib/studio/cleanup/cleanup-server";
import { approvedMaster, getStudioJob, StudioMasterUnavailable } from "@/lib/studio/master/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BeatCoverStatus } from "@/types/domain";
import type { PremiumTier } from "@/types/premium";

import { filterVideoImage } from "./image";
import {
  cleanVideoText, decideYoutubeVideo, youtubeImageKey, youtubeVideoAllowed, youtubeVideoRenderEnabled, YT_VIDEO_PER_DAY,
  type YoutubeVideoDeny, type YoutubeVideoSpec,
} from "./youtube-video";

const ARTIFACTS = "audio-artifacts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Table / column missing (migration not applied yet) → feature unavailable, not a 500. */
const missing = (e: { code?: string } | null) => !!e && ["42P01", "PGRST205", "42703", "PGRST204"].includes(e.code ?? "");
function check(e: { code?: string; message?: string } | null) {
  if (!e) return;
  if (missing(e)) throw new StudioMasterUnavailable("video_missing");
  throw new Error(e.message ?? "db_error");
}

async function project(admin: Admin, ownerId: string, projectId: string) {
  if (!UUID.test(projectId)) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const { data, error } = await admin.from("studio_projects").select("id, title, beat_id").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const r = data as { title?: string | null; beat_id?: string | null };
  return { title: r.title ?? "", beatId: r.beat_id ?? null };
}

export type VideoBeatCover = { beatId: string; key: string; url: string };

/** The project's beat cover, only when approved and the owner may still see the beat. */
async function projectBeatCover(admin: Admin, ownerId: string, beatId: string | null): Promise<VideoBeatCover | null> {
  if (!beatId || !UUID.test(beatId)) return null;
  const { data } = await admin.from("beats").select(`id, ${BEAT_USAGE_COLUMNS}, cover_path, cover_status, cover_updated_at`).eq("id", beatId).maybeSingle();
  const row = data as (Record<string, unknown> & { cover_path: string | null; cover_status: BeatCoverStatus | null; cover_updated_at: string | null }) | null;
  if (!row?.cover_path || row.cover_status !== "approved") return null;
  const subject = beatUsageSubjectFromRow(row);
  if (!isBeatOwner(subject, ownerId)) {
    const grant = subject.status === "PUBLISHED" ? await hasActiveRecordGrant({ beatId, granteeUserId: ownerId }) : false;
    if (!canViewBeat(subject, { userId: ownerId, hasActiveGrant: grant }).allowed) return null;
  }
  const url = beatCoverUrl({ id: beatId, coverStatus: row.cover_status, coverUpdatedAt: row.cover_updated_at }, "full");
  return url ? { beatId, key: row.cover_path, url } : null;
}

async function usedToday(admin: Admin, ownerId: string): Promise<number> {
  const { count, error } = await admin.from("studio_master_jobs").select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId).eq("kind", "youtube_video").gte("created_at", warsawDayStartIso()).not("status", "in", "(failed,cancelled)");
  check(error);
  return count ?? 0;
}

/** UI state: plan gate, approved master, beat cover, today's count and the latest video (with its URL). */
export async function getYoutubeVideoState(p: { ownerId: string; projectId: string; tier: PremiumTier }) {
  const admin = createSupabaseAdminClient();
  const proj = await project(admin, p.ownerId, p.projectId);
  const allowed = youtubeVideoAllowed(p.tier);
  const approved = await approvedMaster(admin, p.ownerId, p.projectId).catch(() => null);
  const cover = await projectBeatCover(admin, p.ownerId, proj.beatId);
  const rendering = youtubeVideoRenderEnabled();
  if (!allowed) return { available: true as const, rendering, allowed, approved: !!approved, cover: cover ? { url: cover.url } : null, title: proj.title, latest: null, usage: null };
  const { data, error } = await admin.from("studio_master_jobs").select("id").eq("owner_id", p.ownerId).eq("project_id", p.projectId)
    .eq("kind", "youtube_video").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (missing(error)) return { available: false as const };
  check(error);
  const latest = data ? await getStudioJob({ ownerId: p.ownerId, projectId: p.projectId, jobId: String((data as { id: string }).id) }) : null;
  return {
    available: true as const, rendering, allowed, approved: !!approved, cover: cover ? { url: cover.url } : null, title: proj.title,
    latest, usage: { used: await usedToday(admin, p.ownerId), perDay: YT_VIDEO_PER_DAY },
  };
}

type Deny = { ok: false; error: YoutubeVideoDeny | "image_rejected"; message?: string };

/** Own graphic: Gold only → checks + content filter → stored (JPEG) under the owner + project. */
export async function uploadYoutubeImage(p: { ownerId: string; projectId: string; tier: PremiumTier; bytes: Uint8Array }):
  Promise<{ ok: true; imageId: string; previewUrl: string | null; width: number; height: number } | Deny> {
  if (!youtubeVideoAllowed(p.tier)) return { ok: false, error: "tier_video" };
  const admin = createSupabaseAdminClient();
  await project(admin, p.ownerId, p.projectId);
  const img = await filterVideoImage(p.bytes);
  const imageId = randomUUID();
  const key = youtubeImageKey(p.ownerId, p.projectId, imageId);
  const { error } = await admin.storage.from(ARTIFACTS).upload(key, img.image, { contentType: "image/jpeg", upsert: false });
  if (error) {
    // Bucket MIME list without image/jpeg = migration not applied yet.
    if (/mime|not allowed|invalid_mime/i.test(error.message)) throw new StudioMasterUnavailable("video_bucket");
    throw new Error("video_image_upload");
  }
  const { data: s } = await admin.storage.from(ARTIFACTS).createSignedUrl(key, 600);
  return { ok: true, imageId, previewUrl: s?.signedUrl ?? null, width: img.width, height: img.height };
}

async function ownImageExists(admin: Admin, key: string): Promise<boolean> {
  const i = key.lastIndexOf("/");
  const { data } = await admin.storage.from(ARTIFACTS).list(key.slice(0, i), { limit: 1, search: key.slice(i + 1) });
  return (data ?? []).some((f) => f.name === key.slice(i + 1));
}

/** Queue the E3 video job. Order of checks = {@link decideYoutubeVideo} (plan first → upsell), then the daily cap. */
export async function commitYoutubeVideo(p: {
  ownerId: string; projectId: string; tier: PremiumTier; source: unknown; imageId?: unknown; title?: unknown; artist?: unknown;
}): Promise<{ ok: true; jobId: string } | Deny> {
  if (!youtubeVideoAllowed(p.tier)) return { ok: false, error: "tier_video" };
  // No E3 worker for youtube_video yet → never queue a job nobody will process.
  if (!youtubeVideoRenderEnabled()) return { ok: false, error: "video_soon", message: "Wideo MP4 niedostępne — wkrótce." };
  const admin = createSupabaseAdminClient();
  const proj = await project(admin, p.ownerId, p.projectId);
  const approved = await approvedMaster(admin, p.ownerId, p.projectId);
  let image: YoutubeVideoSpec["image"] | null = null;
  if (p.source === "cover") {
    const c = await projectBeatCover(admin, p.ownerId, proj.beatId);
    if (c) image = { bucket: BEAT_COVER_BUCKET, key: c.key };
  } else if (p.source === "upload" && typeof p.imageId === "string" && UUID.test(p.imageId)) {
    const key = youtubeImageKey(p.ownerId, p.projectId, p.imageId);
    if (await ownImageExists(admin, key)) image = { bucket: ARTIFACTS, key };
  }
  const d = decideYoutubeVideo({ tier: p.tier, approved: !!approved?.result_object_key, source: p.source, hasImage: !!image });
  if (!d.allowed) return { ok: false, error: d.reason };
  if ((await usedToday(admin, p.ownerId)) >= YT_VIDEO_PER_DAY) return { ok: false, error: "daily_limit" };
  const spec: YoutubeVideoSpec = { source: p.source as YoutubeVideoSpec["source"], image: image!, title: cleanVideoText(p.title), artist: cleanVideoText(p.artist) };
  const jobId = randomUUID();
  const { error } = await admin.from("studio_master_jobs").insert({
    id: jobId, project_id: p.projectId, owner_id: p.ownerId, kind: "youtube_video", output_format: "MP4",
    source_artifact_id: approved!.id, source_document_version: approved!.source_document_version,
    video: spec,
  });
  if (error && (error.code === "23514" || missing(error))) throw new StudioMasterUnavailable("video_missing");
  check(error);
  return { ok: true, jobId };
}
