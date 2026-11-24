import "server-only";

/**
 * "Usuń projekt". A project without any usage is deleted for good (deleteStudioProjectFor). A project
 * with exports, masters, finished songs, cleanups or stem splits keeps those rows: they are the plan
 * limits (deleting them gave the month's masters back) and the export history (ON DELETE RESTRICT).
 * Its content and files go, the project row stays as an ARCHIVED tombstone that no list shows.
 */
import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { deleteStudioProjectFor } from "@/lib/studio/studio-service";
import { removeStudioProjectFiles } from "@/lib/studio/studio-project-storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const REMOVED_PROJECT_TITLE = "Usunięty projekt";
export const PROJECT_BUSY_PL = "Trwa eksport albo mastering tego projektu. Poczekaj na koniec i spróbuj ponownie.";

/** Rows that count towards a limit or must be kept: any of them → tombstone. */
const USAGE_TABLES = [
  "render_jobs",
  "audio_artifacts",
  "studio_final_versions",
  "studio_master_jobs",
  "studio_song_completions",
  "studio_cleanup_jobs",
  "studio_separate_jobs",
] as const;

/**
 * The content of the project; everything here also goes with a plain delete (cascade).
 * studio_mix_working_revisions is not here: append-only by grant (service_role has no DELETE). Its rows
 * hold mix settings only and go with the account.
 */
const CONTENT_TABLES = [
  "catalog_works",
  "studio_listen_links",
  "studio_tracks",
  "studio_take_lanes",
  "studio_project_lyrics",
  "studio_bitek_messages",
  "studio_mix_working_idempotency",
  "studio_master_references",
] as const;

async function countRows(admin: Admin, table: string, projectId: string, statuses?: string[]): Promise<number> {
  let query = admin.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if (statuses) query = query.in("status", statuses);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function removeArtifacts(admin: Admin, projectId: string, ownerId: string): Promise<void> {
  const { data, error } = await admin
    .from("audio_artifacts")
    .select("id, storage_bucket, object_key")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null);
  if (error) throw new Error(`audio_artifacts: ${error.message}`);
  for (const row of (data ?? []) as { id: string; storage_bucket: string | null; object_key: string | null }[]) {
    if (row.object_key) {
      const removed = await admin.storage.from(row.storage_bucket ?? AUDIO_ARTIFACTS_BUCKET).remove([row.object_key]);
      if (removed.error) throw new Error(`export file: ${removed.error.message}`);
    }
    const marked = await admin.from("audio_artifacts").update({ status: "DELETED", deleted_at: new Date().toISOString() }).eq("id", row.id);
    if (marked.error) throw new Error(`audio_artifacts: ${marked.error.message}`);
  }
}

/** Content first, the status last: after an error the project is still on the list and can be removed again. */
async function tombstone(admin: Admin, projectId: string, ownerId: string): Promise<void> {
  const stems = await admin
    .from("takes")
    .update({ status: "DELETED", deleted_at: new Date().toISOString(), stem_project_id: null })
    .eq("stem_project_id", projectId);
  if (stems.error) throw new Error(`takes: ${stems.error.message}`);
  for (const table of CONTENT_TABLES) {
    const { error } = await admin.from(table).delete().eq("project_id", projectId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  await removeArtifacts(admin, projectId, ownerId);
  await removeStudioProjectFiles(admin, ownerId, projectId);
  const { error } = await admin
    .from("studio_projects")
    .update({ status: "ARCHIVED", title: REMOVED_PROJECT_TITLE, beat_id: null, markers: [], master_fx_chain: null })
    .eq("id", projectId)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`studio_projects: ${error.message}`);
}

export async function removeStudioProjectFor(context: AuthContext, projectId: string): Promise<{ id: string }> {
  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin.from("studio_projects").select("id, owner_id, status").eq("id", projectId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!project || project.status === "ARCHIVED") throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  if (project.owner_id !== context.userId) throw new AuthError("FORBIDDEN", "Brak dostępu do tego projektu.");

  const busy =
    (await countRows(admin, "render_jobs", projectId, ["QUEUED", "RUNNING"])) +
    (await countRows(admin, "studio_master_jobs", projectId, ["queued", "running"]));
  if (busy > 0) throw new AuthError("CONFLICT", PROJECT_BUSY_PL);

  const usage = await Promise.all(USAGE_TABLES.map((table) => countRows(admin, table, projectId)));
  if (usage.every((n) => n === 0)) return deleteStudioProjectFor(context, projectId);
  await tombstone(admin, projectId, context.userId);
  return { id: projectId };
}

export async function removeStudioProject(projectId: string): Promise<{ id: string }> {
  return removeStudioProjectFor(await requireUser(), projectId);
}
