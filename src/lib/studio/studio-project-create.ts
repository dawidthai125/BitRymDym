import "server-only";

import { maxProjectsForTier } from "@/config/plan-policy";
import { StudioProjectLimitError } from "@/lib/studio/studio-plan-limits";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction } from "@/lib/supabase/rpc-errors";
import type { PremiumTier } from "@/types/premium";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Insert a DRAFT Studio project under the plan cap atomically
 * (RPC create_studio_project_capped: per-owner advisory lock → count → insert).
 * Cap SSOT = plan-policy maxProjects; the number is passed in, not stored in SQL.
 * Before migration 20261121150000 is applied, falls back to the previous plain insert
 * (the caller's count pre-check still applies). Returns the inserted row.
 */
export async function insertStudioProjectCapped(
  admin: AdminClient,
  input: {
    ownerId: string;
    tier: PremiumTier;
    title: string;
    tempoBpm: number;
    beatId: string | null;
    timelineLengthMs: number;
  },
): Promise<Record<string, unknown>> {
  const limit = maxProjectsForTier(input.tier);
  const { data, error } = await admin.rpc("create_studio_project_capped", {
    p_owner: input.ownerId,
    p_max_projects: limit,
    p_title: input.title,
    p_tempo_bpm: input.tempoBpm,
    p_beat_id: input.beatId,
    p_timeline_length_ms: input.timelineLengthMs,
  });
  if (isMissingRpcFunction(error)) {
    const legacy = await admin
      .from("studio_projects")
      .insert({
        owner_id: input.ownerId,
        title: input.title,
        status: "DRAFT",
        tempo_bpm: input.tempoBpm,
        beat_id: input.beatId,
        timeline_length_ms: input.timelineLengthMs,
      })
      .select("*")
      .single();
    if (legacy.error) throw new Error(legacy.error.message);
    return legacy.data as Record<string, unknown>;
  }
  if (error) {
    if (/PROJECT_LIMIT_REACHED/.test(error.message ?? "")) {
      throw new StudioProjectLimitError(input.tier, limit);
    }
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("Projekt nie został zapisany.");
  return row as Record<string, unknown>;
}
