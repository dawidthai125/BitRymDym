import "server-only";

/**
 * Reference mastering — storage + row lifecycle (service role; used by the API and the
 * E3 worker). One active reference per project; the file is removed right after the
 * master job that used it, when replaced, on demand, or by the 24 h sweep.
 * Never logs keys or URLs.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { STUDIO_REFERENCE_ROOT } from "./reference";

export const REFERENCE_BUCKET = "audio-artifacts";

export type StudioReferenceRow = {
  id: string; owner_id: string; project_id: string; object_key: string; file_name: string;
  format: "mp3" | "wav"; byte_size: number; parts: number; duration_ms: number;
  status: "pending" | "ready" | "deleted"; created_at: string; expires_at: string;
};

export const REFERENCE_COLUMNS = "id, owner_id, project_id, object_key, file_name, format, byte_size, parts, duration_ms, status, created_at, expires_at";

const dirOf = (key: string) => key.slice(0, key.lastIndexOf("/"));

/** Remove every object under the reference's folder (whole file or .pNNN parts). */
async function removeObjects(key: string): Promise<void> {
  if (!key.startsWith(`${STUDIO_REFERENCE_ROOT}/`)) return;
  const storage = createSupabaseAdminClient().storage.from(REFERENCE_BUCKET);
  const dir = dirOf(key);
  const { data } = await storage.list(dir, { limit: 100 });
  const paths = (data ?? []).map((f) => `${dir}/${f.name}`);
  if (paths.length) {
    const { error } = await storage.remove(paths);
    if (error) throw new Error("reference_delete_failed");
  }
}

/** Delete the file(s) and mark the row deleted (idempotent). */
export async function deleteStudioReference(row: Pick<StudioReferenceRow, "id" | "object_key">): Promise<void> {
  await removeObjects(row.object_key);
  await createSupabaseAdminClient().from("studio_master_references")
    .update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", row.id).neq("status", "deleted");
}

export async function deleteStudioReferenceById(id: string): Promise<void> {
  const { data } = await createSupabaseAdminClient().from("studio_master_references").select("id, object_key").eq("id", id).maybeSingle();
  if (data) await deleteStudioReference(data as Pick<StudioReferenceRow, "id" | "object_key">);
}

/** Expired (unused or abandoned) references → deleted. Returns how many were removed. */
export async function sweepExpiredStudioReferences(limit = 50): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().from("studio_master_references")
    .select("id, object_key").neq("status", "deleted").lt("expires_at", new Date().toISOString()).limit(limit);
  if (error) throw new Error("reference_sweep_failed");
  let n = 0;
  for (const row of (data ?? []) as Pick<StudioReferenceRow, "id" | "object_key">[]) {
    try {
      await deleteStudioReference(row);
      n++;
    } catch {
      /* next sweep retries */
    }
  }
  return n;
}
