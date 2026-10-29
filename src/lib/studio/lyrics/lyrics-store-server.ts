import "server-only";

import { AuthError } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { emptyLyricsDoc, readLyricsDoc, type LyricsDoc, type StoredLyrics } from "./lyrics";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Table not migrated yet → the client keeps lyrics in the browser only. */
export function isLyricsStoreMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const m = error.message ?? "";
  return m.includes("studio_project_lyrics") && /exist|schema cache/i.test(m);
}

async function assertOwner(admin: Admin, ownerId: string, projectId: string) {
  if (!UUID.test(projectId)) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const { data, error } = await admin
    .from("studio_projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
}

export async function getProjectLyrics(params: {
  ownerId: string;
  projectId: string;
}): Promise<{ available: boolean; lyrics: StoredLyrics }> {
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, params.ownerId, params.projectId);
  const { data, error } = await admin
    .from("studio_project_lyrics")
    .select("body, version, updated_at")
    .eq("project_id", params.projectId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();
  const empty: StoredLyrics = { doc: emptyLyricsDoc(), version: 0, updatedAt: null };
  if (error) {
    if (isLyricsStoreMissing(error)) return { available: false, lyrics: empty };
    throw new Error(error.message);
  }
  if (!data) return { available: true, lyrics: empty };
  return {
    available: true,
    lyrics: { doc: readLyricsDoc(data.body), version: Number(data.version), updatedAt: String(data.updated_at) },
  };
}

/**
 * Save with optimistic CAS: expectedVersion 0 = first save (insert),
 * otherwise update only when the stored version still matches.
 */
export async function saveProjectLyrics(params: {
  ownerId: string;
  projectId: string;
  doc: LyricsDoc;
  expectedVersion: number;
}): Promise<StoredLyrics> {
  if (!Number.isInteger(params.expectedVersion) || params.expectedVersion < 0) {
    throw new AuthError("CONFLICT", "Nieprawidłowa wersja tekstu.");
  }
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, params.ownerId, params.projectId);
  const conflict = () => new AuthError("CONFLICT", "Tekst zmienił się w innej karcie — odśwież i spróbuj ponownie.");
  if (params.expectedVersion === 0) {
    const { data, error } = await admin
      .from("studio_project_lyrics")
      .insert({ project_id: params.projectId, owner_id: params.ownerId, body: params.doc, version: 1 })
      .select("version, updated_at")
      .single();
    if (error) {
      if (error.code === "23505") throw conflict();
      throw new Error(error.message);
    }
    return { doc: params.doc, version: Number(data.version), updatedAt: String(data.updated_at) };
  }
  const { data, error } = await admin
    .from("studio_project_lyrics")
    .update({ body: params.doc, version: params.expectedVersion + 1 })
    .eq("project_id", params.projectId)
    .eq("owner_id", params.ownerId)
    .eq("version", params.expectedVersion)
    .select("version, updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw conflict();
  return { doc: params.doc, version: Number(data.version), updatedAt: String(data.updated_at) };
}
