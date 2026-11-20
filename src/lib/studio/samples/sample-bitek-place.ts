import "server-only";

import { clipPitchForTier } from "@/config/plan-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  planSamplePlacement,
  type PlacementScope,
  type SamplePlacementPlan,
} from "@/lib/studio/samples/sample-bitek-plan";
import { STUDIO_SAMPLES_TABLE, isSampleUuid, sampleUserMessage } from "@/lib/studio/samples/sample-policy";
import { copyStudioSampleToTake } from "@/lib/studio/samples/sample-service";
import { placeReadyTakeAsStudioClipFor } from "@/lib/studio/studio-record-service";
import {
  getStudioProjectDocumentFor,
  updateStudioClipGainFor,
  updateStudioClipPlaybackFor,
} from "@/lib/studio/studio-service";
import type { StudioClipDto } from "@/lib/studio/studio-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type BitekSampleRequest = {
  projectId: string;
  sampleId: string;
  trackId: string;
  playheadMs: number;
  scope: PlacementScope;
};

/** Read everything the plan needs; the user must own the project and see the sample. */
export async function previewBitekSamplePlacement(
  context: AuthContext,
  req: BitekSampleRequest,
): Promise<{ plan: SamplePlacementPlan; sampleTitle: string }> {
  if (!isSampleUuid(req.sampleId)) throw new AuthError("NOT_FOUND", sampleUserMessage("SAMPLE_NOT_FOUND"));
  const document = await getStudioProjectDocumentFor(context, req.projectId);
  if (!document.tracks.some((t) => t.id === req.trackId)) throw new AuthError("NOT_FOUND", "Ścieżka nie została znaleziona.");
  const admin = createSupabaseAdminClient();
  const { data: sample, error } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select("id, owner_id, title, status, duration_ms, sample_type, bpm, musical_key, bars")
    .eq("id", req.sampleId)
    .maybeSingle();
  if (error || !sample) throw new AuthError("NOT_FOUND", sampleUserMessage("SAMPLE_NOT_FOUND"));
  if (sample.owner_id !== context.userId && sample.status !== "PUBLISHED") {
    throw new AuthError("FORBIDDEN", sampleUserMessage("SAMPLE_FORBIDDEN"));
  }
  let projectKey: string | null = null;
  // "Whole song" ends with the beat, not with the (longer) empty timeline canvas.
  let songEndMs = document.project.timelineLengthMs;
  if (document.project.beatId) {
    const { data: beat } = await admin.from("beats").select("key, duration_seconds").eq("id", document.project.beatId).maybeSingle();
    projectKey = (beat?.key as string | null) ?? null;
    const beatMs = Math.round(Number(beat?.duration_seconds ?? 0) * 1000);
    if (beatMs > 0) songEndMs = Math.min(songEndMs, beatMs);
  }
  const tier = (await resolveProductEntitlementForAuthContext(context)).premiumTier;
  const plan = planSamplePlacement({
    sample: {
      type: (sample.sample_type as "oneshot" | "loop" | "phrase" | null) ?? "oneshot",
      bpm: sample.bpm == null ? null : Number(sample.bpm),
      key: (sample.musical_key as string | null) ?? null,
      bars: sample.bars == null ? null : Number(sample.bars),
      durationMs: Number(sample.duration_ms),
    },
    project: {
      bpm: document.project.tempoBpm,
      key: projectKey,
      timelineLengthMs: songEndMs,
      beatsPerBar: document.project.timeSignatureNum || 4,
      markers: (document.markers ?? []).map((m) => ({ kind: m.kind, positionMs: m.positionMs })),
    },
    playheadMs: Math.max(0, Math.floor(req.playheadMs)),
    scope: req.scope,
    canPitch: clipPitchForTier(tier),
  });
  return { plan, sampleTitle: String(sample.title) };
}

/**
 * Apply Bitek's plan: one private take copy, one clip per start, then tempo/key and level
 * on every clip. Each write passes the document version on (CAS), so a parallel edit stops it.
 */
export async function applyBitekSamplePlacement(
  context: AuthContext,
  req: BitekSampleRequest & { expectedDocumentVersion: number },
): Promise<{ clips: StudioClipDto[]; documentVersion: number; plan: SamplePlacementPlan }> {
  const { plan } = await previewBitekSamplePlacement(context, req);
  const copied = await copyStudioSampleToTake(context, { sampleId: req.sampleId, projectId: req.projectId });
  if (!copied.ok) throw new AuthError("FORBIDDEN", sampleUserMessage(copied.error));

  let version = req.expectedDocumentVersion;
  const clips: StudioClipDto[] = [];
  for (const start of plan.starts) {
    const placed = await placeReadyTakeAsStudioClipFor(context, {
      projectId: req.projectId,
      trackId: req.trackId,
      takeId: copied.takeId,
      timelineStartMs: start,
      expectedDocumentVersion: version,
    });
    version = placed.documentVersion;
    let clip = placed.clip;
    if (plan.stretch !== 1 || plan.pitchCents !== 0) {
      const res = await updateStudioClipPlaybackFor(context, {
        projectId: req.projectId,
        clipId: clip.id,
        expectedDocumentVersion: version,
        stretch: plan.stretch,
        pitchCents: plan.pitchCents,
      });
      clip = res.clip;
      version = res.documentVersion;
    }
    if (plan.gainDb !== 0) {
      const res = await updateStudioClipGainFor(context, {
        projectId: req.projectId,
        clipId: clip.id,
        expectedDocumentVersion: version,
        gainDb: plan.gainDb,
      });
      clip = res.clip;
      version = res.documentVersion;
    }
    clips.push(clip);
  }
  return { clips, documentVersion: version, plan };
}
