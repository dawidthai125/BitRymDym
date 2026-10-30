import "server-only";

import { AuthError } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { parseBeatKey, type TuneKey } from "./tune";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectBeatKey = {
  beatId: string | null;
  /** Raw catalogue metadata (free text), for the UI hint. */
  rawKey: string | null;
  rawScale: string | null;
  /** Parsed key, or null when unknown → client detects from audio / user picks. */
  key: TuneKey | null;
};

/** Key/scale of the beat attached to an owned project (BRD Tune default). */
export async function getProjectBeatKey(params: { ownerId: string; projectId: string }): Promise<ProjectBeatKey> {
  if (!UUID.test(params.projectId)) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("studio_projects")
    .select("id, beat_id")
    .eq("id", params.projectId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!project) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const beatId = typeof project.beat_id === "string" ? project.beat_id : null;
  if (!beatId) return { beatId: null, rawKey: null, rawScale: null, key: null };
  const { data: beat, error: beatError } = await admin.from("beats").select("key, scale").eq("id", beatId).maybeSingle();
  if (beatError) throw new Error(beatError.message);
  const rawKey = typeof beat?.key === "string" && beat.key.trim() ? beat.key.trim() : null;
  const rawScale = typeof beat?.scale === "string" && beat.scale.trim() ? beat.scale.trim() : null;
  return { beatId, rawKey, rawScale, key: parseBeatKey(rawKey, rawScale) };
}
