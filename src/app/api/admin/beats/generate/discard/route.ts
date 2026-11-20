import { NextResponse } from "next/server";

import { requireAdminGenerator } from "@/lib/beats/ai-beat/generate";
import { isUuid } from "@/lib/beats/audio-validation";
import { beatApiBadRequest, beatAudioApiErrorResponse } from "@/lib/beats/beat-operation-error";
import { GENERATED_BEAT_TAG } from "@/lib/beats/catalog-lane";
import { deleteBeat } from "@/lib/beats/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST JSON { beatId } — removes the losing variant of the one-button generator.
 * Only an unpublished generator draft can go this way; anything else is refused.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { beatId?: unknown } | null;
  if (!isUuid(body?.beatId)) return beatApiBadRequest("Nieznany bit.");
  try {
    await requireAdminGenerator();
    const { data } = await createSupabaseAdminClient()
      .from("beats")
      .select("status, tags")
      .eq("id", body.beatId)
      .maybeSingle();
    const tags = Array.isArray(data?.tags) ? (data.tags as unknown[]) : [];
    if (!data || data.status !== "DRAFT" || !tags.includes(GENERATED_BEAT_TAG)) {
      return beatApiBadRequest("Usunąć tak można tylko szkic z generatora.");
    }
    await deleteBeat(body.beatId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return beatAudioApiErrorResponse(error, "api/admin/beats/generate/discard");
  }
}
