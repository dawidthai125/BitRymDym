import "server-only";

import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { STUDIO_TAKE_LANE_LIMITS } from "@/config/studio-recording-features";
import {
  buildCompClipSpecs,
  parseTakeLane,
  type TakeLane,
} from "@/lib/studio/recording/comping";
import {
  parseLatencyProfile,
  type LatencyProfile,
} from "@/lib/studio/recording/latency";
import { parseExpectedDocumentVersion } from "@/lib/studio/studio-fx-chain";
import {
  addStudioClipFor,
  deleteStudioClipFor,
  getStudioProjectDocumentFor,
  updateStudioClipFadesFor,
} from "@/lib/studio/studio-service";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Table not migrated yet → callers degrade to browser-local storage. */
export function isRecordingStoreMissing(
  error: { code?: string; message?: string } | null | undefined,
  table: "studio_take_lanes" | "studio_device_latency",
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const m = error.message ?? "";
  return m.includes(table) && /exist|schema cache/i.test(m);
}

function laneFromRow(r: Record<string, unknown>): TakeLane | null {
  return parseTakeLane({
    id: r.id,
    trackId: r.track_id,
    sectionStartMs: r.section_start_ms,
    sectionEndMs: r.section_end_ms,
    lineMs: r.line_ms,
    passes: r.passes,
    comp: r.comp,
    clipIds: r.clip_ids,
    updatedAt: r.updated_at,
  });
}

const LANE_COLS =
  "id, track_id, section_start_ms, section_end_ms, line_ms, passes, comp, clip_ids, updated_at";

export async function listTakeLanesFor(
  context: AuthContext,
  projectId: string,
): Promise<{ available: boolean; lanes: TakeLane[] }> {
  await getStudioProjectDocumentFor(context, projectId); // ownership
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_take_lanes")
    .select(LANE_COLS)
    .eq("project_id", projectId)
    .eq("owner_id", context.userId)
    .order("section_start_ms", { ascending: true })
    .limit(STUDIO_TAKE_LANE_LIMITS.maxLanesPerProject);
  if (error) {
    if (isRecordingStoreMissing(error, "studio_take_lanes")) {
      return { available: false, lanes: [] };
    }
    throw new Error(error.message);
  }
  return {
    available: true,
    lanes: (data ?? [])
      .map((r) => laneFromRow(r as Record<string, unknown>))
      .filter((l): l is TakeLane => l !== null),
  };
}

async function upsertLaneRow(
  context: AuthContext,
  projectId: string,
  lane: TakeLane,
): Promise<{ available: boolean; lane: TakeLane }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_take_lanes")
    .upsert(
      {
        id: lane.id,
        project_id: projectId,
        owner_id: context.userId,
        track_id: lane.trackId,
        section_start_ms: lane.sectionStartMs,
        section_end_ms: lane.sectionEndMs,
        line_ms: lane.lineMs,
        passes: lane.passes,
        comp: lane.comp,
        clip_ids: lane.clipIds,
      },
      { onConflict: "id" },
    )
    .select(LANE_COLS)
    .maybeSingle();
  if (error) {
    if (isRecordingStoreMissing(error, "studio_take_lanes")) {
      return { available: false, lane };
    }
    if (/TAKE_LANE_LIMIT/.test(error.message)) {
      throw new AuthError("FORBIDDEN", "Osiągnięto limit sekcji z take'ami w projekcie.");
    }
    if (/TAKE_LANE_/.test(error.message)) {
      throw new AuthError("FORBIDDEN", "Sekcja nie należy do tego projektu.");
    }
    throw new Error(error.message);
  }
  const saved = data ? laneFromRow(data as Record<string, unknown>) : null;
  return { available: true, lane: saved ?? lane };
}

/** Validate takes against the DB (owner, READY) and trust server durations. */
async function verifiedLane(
  context: AuthContext,
  document: StudioProjectDocument,
  raw: unknown,
): Promise<TakeLane> {
  const lane = parseTakeLane(raw);
  if (!lane || !UUID.test(lane.id) || lane.passes.some((p) => !UUID.test(p.takeId))) {
    throw new AuthError("FORBIDDEN", "Nieprawidłowa sekcja nagrania.");
  }
  if (!document.tracks.some((t) => t.id === lane.trackId)) {
    throw new AuthError("NOT_FOUND", "Ścieżka nie została znaleziona.");
  }
  if (lane.sectionEndMs > document.project.timelineLengthMs) {
    throw new AuthError("FORBIDDEN", "Sekcja wykracza poza długość projektu.");
  }
  const takeIds = [...new Set(lane.passes.map((p) => p.takeId))];
  if (takeIds.length === 0) return lane;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("takes")
    .select("id, owner_id, status, deleted_at, duration_seconds")
    .in("id", takeIds);
  if (error) throw new Error(error.message);
  const ok = new Map<string, number>();
  for (const t of data ?? []) {
    if (
      t.owner_id === context.userId &&
      t.status === "READY" &&
      !t.deleted_at &&
      Number(t.duration_seconds) > 0
    ) {
      ok.set(t.id as string, Math.round(Number(t.duration_seconds) * 1000));
    }
  }
  const passes = lane.passes
    .filter((p) => ok.has(p.takeId))
    .map((p) => ({ ...p, takeDurationMs: ok.get(p.takeId)! }))
    .filter((p) => p.sourceOffsetMs < p.takeDurationMs);
  return parseTakeLane({ ...lane, passes }) ?? { ...lane, passes: [] };
}

export async function saveTakeLaneFor(
  context: AuthContext,
  projectId: string,
  raw: unknown,
): Promise<{ available: boolean; lane: TakeLane }> {
  const document = await getStudioProjectDocumentFor(context, projectId);
  const lane = await verifiedLane(context, document, raw);
  return upsertLaneRow(context, projectId, lane);
}

export async function deleteTakeLaneFor(
  context: AuthContext,
  projectId: string,
  laneId: string,
): Promise<{ available: boolean }> {
  await getStudioProjectDocumentFor(context, projectId);
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("studio_take_lanes")
    .delete()
    .eq("id", laneId)
    .eq("project_id", projectId)
    .eq("owner_id", context.userId);
  if (error) {
    if (isRecordingStoreMissing(error, "studio_take_lanes")) return { available: false };
    throw new Error(error.message);
  }
  return { available: true };
}

/**
 * Apply a lane's comp to the timeline: remove the clips the lane created
 * before, add one clip per comp segment (overlapping crossfades) and save
 * the new clip ids. Chained CAS ops starting at expectedDocumentVersion.
 */
export async function applyTakeLaneCompFor(
  context: AuthContext,
  input: { projectId: string; lane: unknown; expectedDocumentVersion: unknown },
): Promise<{
  document: StudioProjectDocument;
  lane: TakeLane;
  available: boolean;
}> {
  let version = parseExpectedDocumentVersion(input.expectedDocumentVersion);
  const document = await getStudioProjectDocumentFor(context, input.projectId);
  const lane = await verifiedLane(context, document, input.lane);

  // Clip ids known to the server (if stored) + the client copy; only TAKE
  // clips of this lane's takes on this track are ever removed.
  let storedIds: string[] = [];
  const admin = createSupabaseAdminClient();
  const { data: row, error: rowError } = await admin
    .from("studio_take_lanes")
    .select("clip_ids")
    .eq("id", lane.id)
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (rowError && !isRecordingStoreMissing(rowError, "studio_take_lanes")) {
    throw new Error(rowError.message);
  }
  if (Array.isArray(row?.clip_ids)) storedIds = row.clip_ids as string[];
  const laneTakes = new Set(lane.passes.map((p) => p.takeId));
  const removable = new Set([...storedIds, ...lane.clipIds]);
  const toDelete = document.clips.filter(
    (c) =>
      removable.has(c.id) &&
      c.trackId === lane.trackId &&
      c.sourceKind === "TAKE" &&
      c.sourceTakeId != null &&
      laneTakes.has(c.sourceTakeId),
  );
  for (const clip of toDelete) {
    const r = await deleteStudioClipFor(context, {
      projectId: input.projectId,
      clipId: clip.id,
      expectedDocumentVersion: version,
    });
    version = r.documentVersion;
  }

  const clipIds: string[] = [];
  for (const spec of buildCompClipSpecs(lane)) {
    const added = await addStudioClipFor(context, {
      projectId: input.projectId,
      trackId: lane.trackId,
      expectedDocumentVersion: version,
      sourceKind: "TAKE",
      sourceTakeId: spec.takeId,
      timelineStartMs: spec.timelineStartMs,
      durationMs: spec.durationMs,
      sourceOffsetMs: spec.sourceOffsetMs,
    });
    version = added.documentVersion;
    clipIds.push(added.clip.id);
    if (spec.fadeInMs > 0 || spec.fadeOutMs > 0) {
      const faded = await updateStudioClipFadesFor(context, {
        projectId: input.projectId,
        clipId: added.clip.id,
        expectedDocumentVersion: version,
        fadeInMs: spec.fadeInMs,
        fadeOutMs: spec.fadeOutMs,
      });
      version = faded.documentVersion;
    }
  }

  const saved = await upsertLaneRow(context, input.projectId, {
    ...lane,
    clipIds,
  });
  const fresh = await getStudioProjectDocumentFor(context, input.projectId);
  return { document: fresh, lane: saved.lane, available: saved.available };
}

// ── Device latency profile (per user) ───────────────────────────────────────

export async function listDeviceLatencyFor(
  context: AuthContext,
): Promise<{ available: boolean; profiles: LatencyProfile[] }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_device_latency")
    .select("device_key, round_trip_ms, manual_offset_ms, method, spread_ms, updated_at")
    .eq("user_id", context.userId)
    .order("updated_at", { ascending: false })
    .limit(12);
  if (error) {
    if (isRecordingStoreMissing(error, "studio_device_latency")) {
      return { available: false, profiles: [] };
    }
    throw new Error(error.message);
  }
  return {
    available: true,
    profiles: (data ?? [])
      .map((r) =>
        parseLatencyProfile({
          deviceKey: r.device_key,
          roundTripMs: r.round_trip_ms == null ? null : Number(r.round_trip_ms),
          manualOffsetMs: r.manual_offset_ms,
          method: r.method,
          spreadMs: r.spread_ms == null ? null : Number(r.spread_ms),
          updatedAt: r.updated_at,
        }),
      )
      .filter((p): p is LatencyProfile => p !== null),
  };
}

export async function saveDeviceLatencyFor(
  context: AuthContext,
  raw: unknown,
): Promise<{ available: boolean; profile: LatencyProfile }> {
  const profile = parseLatencyProfile(raw);
  if (!profile) throw new AuthError("FORBIDDEN", "Nieprawidłowy profil opóźnienia.");
  const admin = createSupabaseAdminClient();
  const row = {
    user_id: context.userId,
    device_key: profile.deviceKey,
    round_trip_ms: profile.roundTripMs,
    manual_offset_ms: profile.manualOffsetMs,
    method: profile.method,
    spread_ms: profile.spreadMs,
  };
  let { error } = await admin
    .from("studio_device_latency")
    .upsert(row, { onConflict: "user_id,device_key" });
  if (error && /DEVICE_LATENCY_LIMIT/.test(error.message)) {
    // Drop the oldest device, then retry once.
    const { data: oldest } = await admin
      .from("studio_device_latency")
      .select("device_key")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: true })
      .limit(1);
    if (oldest?.[0]) {
      await admin
        .from("studio_device_latency")
        .delete()
        .eq("user_id", context.userId)
        .eq("device_key", oldest[0].device_key as string);
    }
    ({ error } = await admin
      .from("studio_device_latency")
      .upsert(row, { onConflict: "user_id,device_key" }));
  }
  if (error) {
    if (isRecordingStoreMissing(error, "studio_device_latency")) {
      return { available: false, profile };
    }
    throw new Error(error.message);
  }
  return { available: true, profile };
}
