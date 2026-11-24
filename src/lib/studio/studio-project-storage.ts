import "server-only";

import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 500;
/** A project keeps a few folders, two levels deep (job/out/file). */
const MAX_DEPTH = 5;

async function keysUnder(admin: Admin, dir: string, depth = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];
  const keys: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).list(dir, { limit: PAGE, offset });
    if (error) throw new Error(error.message);
    for (const entry of data ?? []) {
      const path = `${dir}/${entry.name}`;
      // A folder has no id.
      if (entry.id === null) keys.push(...(await keysUnder(admin, path, depth + 1)));
      else keys.push(path);
    }
    if ((data ?? []).length < PAGE) return keys;
  }
}

/**
 * Vocal cleanup results of the project (studio-cleanup/{owner}/{take}/{job}.flac). They are keyed by take, so the job
 * rows must be read BEFORE the project is deleted. Never blocks the deletion.
 */
export async function studioProjectCleanupKeys(admin: Admin, ownerId: string, projectId: string): Promise<string[]> {
  if (!UUID.test(ownerId) || !UUID.test(projectId)) return [];
  try {
    const { data, error } = await admin
      .from("studio_cleanup_jobs")
      .select("result_object_key")
      .eq("project_id", projectId)
      .eq("owner_id", ownerId)
      .not("result_object_key", "is", null);
    if (error) throw new Error(error.message);
    return ((data ?? []) as { result_object_key: string | null }[])
      .map((row) => row.result_object_key ?? "")
      .filter((key) => key.startsWith(`studio-cleanup/${ownerId}/`) && !key.includes(".."));
  } catch (error) {
    console.error("[studio-project] cleanup files not listed", projectId, error);
    return [];
  }
}

/**
 * Masters, downloads, videos and reference uploads of a project that was just deleted (its rows are gone, so nothing
 * else would ever remove the files). Best effort: the project is deleted either way.
 */
export async function removeStudioProjectFiles(
  admin: Admin,
  ownerId: string,
  projectId: string,
  /** From studioProjectCleanupKeys, read before the rows went. */
  cleanupKeys: readonly string[] = [],
): Promise<void> {
  if (!UUID.test(ownerId) || !UUID.test(projectId)) return;
  for (const root of ["studio-master", "studio-video", "studio-reference", "studio-cleanup"]) {
    try {
      const keys = root === "studio-cleanup" ? [...cleanupKeys] : await keysUnder(admin, `${root}/${ownerId}/${projectId}`);
      for (let i = 0; i < keys.length; i += 100) {
        const { error } = await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove(keys.slice(i, i + 100));
        if (error) throw new Error(error.message);
      }
    } catch (error) {
      console.error("[studio-project] files not removed", root, projectId, error);
    }
  }
}
