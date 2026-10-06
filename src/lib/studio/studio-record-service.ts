import "server-only";

import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { geometryForStudioRecording } from "@/lib/studio/studio-record-ops";
import {
  addStudioClipFor,
  getStudioProjectDocumentFor,
} from "@/lib/studio/studio-service";
import type { StudioClipDto } from "@/lib/studio/studio-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Place an already-READY owned Take onto a Studio Track at the captured playhead.
 * Does not mutate Take / Beat / storage. Reuses addStudioClipFor ownership + TAKE checks.
 */
export async function placeReadyTakeAsStudioClipFor(
  context: AuthContext,
  input: {
    projectId: string;
    trackId: string;
    takeId: string;
    /** Playhead at record start — integer ms from Studio transport SSOT. */
    timelineStartMs: number;
  },
): Promise<{ clip: StudioClipDto; takeId: string; durationMs: number }> {
  if (!input.projectId || !input.trackId || !input.takeId) {
    throw new Error("projectId, trackId i takeId są wymagane.");
  }

  const document = await getStudioProjectDocumentFor(context, input.projectId);

  const track = document.tracks.find((t) => t.id === input.trackId);
  if (!track) {
    throw new AuthError("NOT_FOUND", "Ścieżka nie została znaleziona.");
  }

  const admin = createSupabaseAdminClient();
  const { data: take, error: takeError } = await admin
    .from("takes")
    .select("id, owner_id, status, deleted_at, duration_seconds, beat_id")
    .eq("id", input.takeId)
    .maybeSingle();
  if (takeError) throw new Error(takeError.message);
  if (
    !take ||
    take.owner_id !== context.userId ||
    take.status !== "READY" ||
    take.deleted_at
  ) {
    throw new AuthError(
      "FORBIDDEN",
      "Nagranie nie jest dostępne do umieszczenia w projekcie.",
    );
  }

  const durationSeconds = take.duration_seconds as number;
  const geometry = geometryForStudioRecording({
    playheadMs: input.timelineStartMs,
    durationSeconds,
    timelineLengthMs: document.project.timelineLengthMs,
  });

  const clip = await addStudioClipFor(context, {
    projectId: input.projectId,
    trackId: input.trackId,
    sourceKind: "TAKE",
    sourceTakeId: input.takeId,
    timelineStartMs: geometry.timelineStartMs,
    durationMs: geometry.durationMs,
    sourceOffsetMs: geometry.sourceOffsetMs,
  });

  return {
    clip,
    takeId: input.takeId,
    durationMs: geometry.durationMs,
  };
}

export async function placeReadyTakeAsStudioClip(
  input: Parameters<typeof placeReadyTakeAsStudioClipFor>[1],
): Promise<{ clip: StudioClipDto; takeId: string; durationMs: number }> {
  return placeReadyTakeAsStudioClipFor(await requireUser(), input);
}

/**
 * Resolve beatId required by the existing Take session pipeline for this project.
 * Studio recording is auth-only and requires a project beat (BEAT_REF context).
 */
export async function resolveStudioRecordingBeatIdFor(
  context: AuthContext,
  projectId: string,
): Promise<{ beatId: string; timelineLengthMs: number }> {
  const document = await getStudioProjectDocumentFor(context, projectId);
  const beatId = document.project.beatId;
  if (!beatId) {
    throw new AuthError(
      "FORBIDDEN",
      "Ten projekt nie ma bitu. Dodaj bit, aby nagrywać w Studio.",
    );
  }
  return {
    beatId,
    timelineLengthMs: document.project.timelineLengthMs,
  };
}

export async function resolveStudioRecordingBeatId(
  projectId: string,
): Promise<{ beatId: string; timelineLengthMs: number }> {
  return resolveStudioRecordingBeatIdFor(await requireUser(), projectId);
}
