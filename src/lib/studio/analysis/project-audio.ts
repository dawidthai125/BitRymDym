import "server-only";

import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import { previewKeyFor } from "@/lib/studio/master/preview";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MASTER_BUCKET = "audio-artifacts";
const SIGNED_SECONDS = 600;

export type ProjectAudioObject = {
  kind: "master" | "beat";
  bucket: string;
  key: string;
};

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Audio that belongs to the project: the approved master while the document
 * still matches, otherwise the project's beat (playback, then master asset).
 */
export async function projectAnalysisObject(ownerId: string, projectId: string): Promise<ProjectAudioObject | null> {
  if (!UUID.test(projectId)) return null;
  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("studio_projects")
    .select("id, beat_id, document_version")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error("project_audio_lookup");
  if (!project) return null;
  const row = project as { beat_id: string | null; document_version: number };
  const master = await approvedMasterKey(admin, ownerId, projectId, Number(row.document_version));
  if (master) return { kind: "master", bucket: MASTER_BUCKET, key: master };
  if (!row.beat_id || !UUID.test(row.beat_id)) return null;
  const beatKey = await beatObjectKey(admin, row.beat_id);
  if (!beatKey) return null;
  return { kind: "beat", bucket: BEAT_AUDIO_BUCKET, key: beatKey };
}

/**
 * Owner rule: the clean master leaves the server only through the approved, quota-counted download (Free gets the
 * watermarked MP3 there). The browser analysis therefore gets the watermarked master preview, never the FLAC.
 * Pure: the object the browser may be signed for, or null (fail closed).
 */
export function clientAnalysisObject(source: ProjectAudioObject): { bucket: string; key: string } | null {
  if (source.kind !== "master") return { bucket: source.bucket, key: source.key };
  const previewKey = previewKeyFor(source.key);
  return previewKey ? { bucket: source.bucket, key: previewKey } : null;
}

export async function signProjectAnalysisAudio(
  ownerId: string,
  projectId: string,
): Promise<{ url: string; kind: ProjectAudioObject["kind"] } | null> {
  const source = await projectAnalysisObject(ownerId, projectId);
  if (!source) return null;
  const target = clientAnalysisObject(source);
  if (!target) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(target.bucket).createSignedUrl(target.key, SIGNED_SECONDS);
  if (error || !data?.signedUrl) return null;
  return { url: data.signedUrl, kind: source.kind };
}

async function approvedMasterKey(admin: Admin, ownerId: string, projectId: string, documentVersion: number): Promise<string | null> {
  const { data, error } = await admin
    .from("studio_master_jobs")
    .select("result_object_key, source_document_version")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .eq("kind", "master")
    .eq("status", "succeeded")
    .not("approved_at", "is", null)
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("project_audio_master");
  const row = data as { result_object_key: string | null; source_document_version: number } | null;
  if (!row?.result_object_key) return null;
  if (Number(row.source_document_version) !== documentVersion) return null;
  return row.result_object_key;
}

async function beatObjectKey(admin: Admin, beatId: string): Promise<string | null> {
  for (const purpose of ["PLAYBACK", "MASTER"] as const) {
    const { data, error } = await admin
      .from("beat_audio_assets")
      .select("object_key")
      .eq("beat_id", beatId)
      .eq("purpose", purpose)
      .eq("is_active", true)
      .eq("status", "READY")
      .maybeSingle();
    if (error) throw new Error("project_audio_beat");
    const key = (data as { object_key?: string } | null)?.object_key;
    if (key) return key;
  }
  return null;
}
