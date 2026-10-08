import "server-only";

import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  findIdenticalTakeClipPlacement,
  geometryForStudioRecording,
} from "@/lib/studio/studio-record-ops";
import { parseExpectedDocumentVersion } from "@/lib/studio/studio-fx-chain";
import {
  addStudioClipFor,
  getStudioProjectDocumentFor,
} from "@/lib/studio/studio-service";
import type {
  StudioClipDto,
  StudioPlaceableTakeDto,
} from "@/lib/studio/studio-types";
import { isTakeExpired } from "@/lib/takes/entitlement";
import { displayTakeTitle } from "@/lib/takes/take-title";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type { StudioPlaceableTakeDto };

/**
 * Place an already-READY owned Take onto a Studio Track at the captured playhead.
 * Does not mutate Take / Beat / storage. Reuses addStudioClipFor ownership + TAKE checks.
 * Idempotent for Keep retry: same track + take + timelineStart returns existing Clip.
 */
export async function placeReadyTakeAsStudioClipFor(
  context: AuthContext,
  input: {
    projectId: string;
    trackId: string;
    takeId: string;
    /** Playhead at record start — integer ms from Studio transport SSOT. */
    timelineStartMs: number;
    expectedDocumentVersion: unknown;
  },
): Promise<{
  clip: StudioClipDto;
  takeId: string;
  durationMs: number;
  reusedExisting: boolean;
  documentVersion: number;
}> {
  if (!input.projectId || !input.trackId || !input.takeId) {
    throw new Error("projectId, trackId i takeId są wymagane.");
  }
  // Validate CAS handshake even on idempotent reuse (no blind missing-version path).
  parseExpectedDocumentVersion(input.expectedDocumentVersion);

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

  // Keep / network retry: do not create a second identical Clip.
  const existing = findIdenticalTakeClipPlacement(document.clips, {
    trackId: input.trackId,
    takeId: input.takeId,
    timelineStartMs: geometry.timelineStartMs,
  });
  if (existing) {
    return {
      clip: existing,
      takeId: input.takeId,
      durationMs: existing.durationMs,
      reusedExisting: true,
      documentVersion: document.project.documentVersion,
    };
  }

  const placed = await addStudioClipFor(context, {
    projectId: input.projectId,
    trackId: input.trackId,
    expectedDocumentVersion: input.expectedDocumentVersion,
    sourceKind: "TAKE",
    sourceTakeId: input.takeId,
    timelineStartMs: geometry.timelineStartMs,
    durationMs: geometry.durationMs,
    sourceOffsetMs: geometry.sourceOffsetMs,
  });

  return {
    clip: placed.clip,
    takeId: input.takeId,
    durationMs: geometry.durationMs,
    reusedExisting: false,
    documentVersion: placed.documentVersion,
  };
}

export async function placeReadyTakeAsStudioClip(
  input: Parameters<typeof placeReadyTakeAsStudioClipFor>[1],
): Promise<{
  clip: StudioClipDto;
  takeId: string;
  durationMs: number;
  reusedExisting: boolean;
  documentVersion: number;
}> {
  return placeReadyTakeAsStudioClipFor(await requireUser(), input);
}

/**
 * Compact READY Take picker for Studio place-from-library (P5.6).
 * Prefers project's beat; may include other owned READY Takes (sameBeat=false).
 */
export async function listReadyTakesForStudioPlaceFor(
  context: AuthContext,
  projectId: string,
): Promise<{ beatId: string | null; takes: StudioPlaceableTakeDto[] }> {
  const document = await getStudioProjectDocumentFor(context, projectId);
  const projectBeatId = document.project.beatId;
  const admin = createSupabaseAdminClient();

  const { data: rows, error } = await admin
    .from("takes")
    .select(
      "id, title, beat_id, status, deleted_at, expires_at, duration_seconds, created_at",
    )
    .eq("owner_id", context.userId)
    .eq("status", "READY")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);

  const beatIds = [
    ...new Set((rows ?? []).map((r) => r.beat_id as string).filter(Boolean)),
  ];
  const titleByBeat = new Map<string, string>();
  if (beatIds.length > 0) {
    const { data: beats } = await admin
      .from("beats")
      .select("id, title")
      .in("id", beatIds);
    for (const b of beats ?? []) {
      titleByBeat.set(b.id as string, b.title as string);
    }
  }

  const takes: StudioPlaceableTakeDto[] = [];
  for (const row of rows ?? []) {
    if (isTakeExpired({ expiresAt: row.expires_at as string })) continue;
    const beatId = row.beat_id as string;
    takes.push({
      id: row.id as string,
      displayTitle: displayTakeTitle({
        title: (row.title as string | null) ?? null,
        beatTitle: titleByBeat.get(beatId) ?? null,
      }),
      beatId,
      durationSeconds:
        typeof row.duration_seconds === "number" ? row.duration_seconds : null,
      createdAt: row.created_at as string,
      sameBeat: Boolean(projectBeatId && beatId === projectBeatId),
    });
  }

  takes.sort((a, b) => {
    if (a.sameBeat !== b.sameBeat) return a.sameBeat ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return { beatId: projectBeatId, takes };
}

export async function listReadyTakesForStudioPlace(
  projectId: string,
): Promise<{ beatId: string | null; takes: StudioPlaceableTakeDto[] }> {
  return listReadyTakesForStudioPlaceFor(await requireUser(), projectId);
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
