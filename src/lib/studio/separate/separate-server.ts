import "server-only";

import { projectAnalysisObject } from "@/lib/studio/analysis/project-audio";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { STEM_NAMES, type StemName } from "./separate-worker-env";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNED_SECONDS = 600;

const missing = (error: { code?: string } | null) =>
  !!error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42883");

export type SeparateJobView = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  errorCode: string | null;
  stems: Partial<Record<StemName, string>> | null;
};

export async function enqueueSeparateJob(ownerId: string, projectId: string) {
  if (!UUID.test(projectId)) return { ok: false as const, error: "bad_request" };
  const source = await projectAnalysisObject(ownerId, projectId);
  // Owner rule 2026-11-12: nobody gets stems of the clean Bit. Only an approved master (Bit + own recording) is split.
  if (!source || source.kind !== "master") return { ok: false as const, error: "no_audio" };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("enqueue_studio_separate_job", {
    p_owner: ownerId,
    p_project: projectId,
    p_source_kind: source.kind,
    p_source_bucket: source.bucket,
    p_source_key: source.key,
  });
  if (error?.message?.includes("SEPARATE_IN_PROGRESS")) return { ok: false as const, error: "in_progress" };
  if (missing(error)) return { ok: false as const, error: "unavailable" };
  if (error) throw new Error(`separate_enqueue:${error.code ?? "?"}`);
  const row = (Array.isArray(data) ? data[0] : data) as { id?: string; status?: string } | null;
  if (!row?.id) return { ok: false as const, error: "unavailable" };
  return { ok: true as const, jobId: row.id, status: row.status ?? "queued" };
}

export async function latestSeparateJob(ownerId: string, projectId: string): Promise<SeparateJobView | null | "unavailable"> {
  if (!UUID.test(projectId)) return null;
  const admin = createSupabaseAdminClient();
  const owned = await admin.from("studio_projects").select("id").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (owned.error) throw new Error("separate_project_lookup");
  if (!owned.data) return null;
  const { data, error } = await admin
    .from("studio_separate_jobs")
    .select("id, status, error_code, stems")
    .eq("owner_id", ownerId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (missing(error)) return "unavailable";
  if (error) throw new Error(`separate_list:${error.code ?? "?"}`);
  const row = data as { id: string; status: SeparateJobView["status"]; error_code: string | null; stems: Record<string, string> | null } | null;
  if (!row) return null;
  let stems: SeparateJobView["stems"] = null;
  if (row.status === "succeeded" && row.stems && typeof row.stems === "object") {
    stems = {};
    for (const name of STEM_NAMES) {
      const key = row.stems[name];
      if (typeof key !== "string" || !key.startsWith(`separate/${ownerId}/`)) continue;
      const signed = await admin.storage.from("audio-artifacts").createSignedUrl(key, SIGNED_SECONDS);
      if (signed.data?.signedUrl) stems[name] = signed.data.signedUrl;
    }
  }
  return { id: row.id, status: row.status, errorCode: row.error_code, stems };
}
