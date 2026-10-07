import "server-only";

import {
  STUDIO_DEFAULT_TEMPO_BPM,
  STUDIO_DEFAULT_TIMELINE_LENGTH_MS,
  STUDIO_MAX_PROJECTS_PER_USER,
  STUDIO_TITLE_MAX_LENGTH,
  STUDIO_TRACK_NAME_MAX_LENGTH,
  type StudioTrackType,
} from "@/config/studio";
import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  resolveFadesAfterSplit,
  resolveFadesAfterTrim,
  resolveStudioClipFadesForWrite,
} from "@/lib/studio/studio-clip-fade";
import {
  assertValidClipSource,
  assertClipPlacement,
  moveClipGeometry,
  splitClipGeometry,
  trimClipLeft,
  trimClipLeftToPlayhead,
  trimClipRight,
  trimClipRightToPlayhead,
  type StudioClipGeometry,
} from "@/lib/studio/studio-clip-ops";
import {
  applySortOrders,
  defaultTrackName,
  normalizePan,
  reorderTrackIds,
} from "@/lib/studio/studio-track-ops";
import type {
  StudioClipDto,
  StudioProjectDocument,
  StudioProjectSummary,
  StudioTrackDto,
} from "@/lib/studio/studio-types";
import {
  parseExpectedDocumentVersion,
  parseStudioFxChainForWrite,
  readStudioFxChain,
  StudioFxCasConflictError,
  StudioFxChainError,
  type StudioFxChainV1,
} from "@/lib/studio/studio-fx-chain";
import {
  parseStudioMasterGainDb,
  parseStudioMasterPan,
} from "@/lib/studio/studio-master-mix";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ProjectRow = {
  id: string;
  owner_id: string;
  title: string;
  status: string;
  tempo_bpm: number | string;
  time_signature_num: number;
  time_signature_den: number;
  beat_id: string | null;
  timeline_length_ms: number;
  master_gain_db: number | string;
  master_pan: number | string;
  schema_version: number;
  document_version: number;
  master_fx_chain?: unknown | null;
  created_at: string;
  updated_at: string;
};

type TrackRow = {
  id: string;
  project_id: string;
  name: string;
  track_type: string;
  sort_order: number;
  gain_db: number | string;
  pan: number | string;
  muted: boolean;
  solo: boolean;
  record_armed: boolean;
  input_device_hint: string | null;
  output_route: string;
  effects_chain?: unknown | null;
};

type ClipRow = {
  id: string;
  track_id: string;
  source_kind: string;
  source_take_id: string | null;
  source_beat_id: string | null;
  source_artifact_id: string | null;
  timeline_start_ms: number;
  duration_ms: number;
  source_offset_ms: number;
  gain_db: number | string;
  muted: boolean;
  fade_in_ms: number;
  fade_out_ms: number;
};

function num(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function mapProjectSummary(row: ProjectRow): StudioProjectSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status as StudioProjectSummary["status"],
    tempoBpm: num(row.tempo_bpm),
    timelineLengthMs: row.timeline_length_ms,
    beatId: row.beat_id,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function mapTrack(row: TrackRow): StudioTrackDto {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    trackType: row.track_type as StudioTrackType,
    sortOrder: row.sort_order,
    gainDb: num(row.gain_db),
    pan: num(row.pan),
    muted: row.muted,
    solo: row.solo,
    recordArmed: row.record_armed,
    inputDeviceHint: row.input_device_hint,
    outputRoute: row.output_route,
    effectsChain: readStudioFxChain(row.effects_chain, "track"),
  };
}

function mapClip(row: ClipRow): StudioClipDto {
  return {
    id: row.id,
    trackId: row.track_id,
    sourceKind: row.source_kind as StudioClipDto["sourceKind"],
    sourceTakeId: row.source_take_id,
    sourceBeatId: row.source_beat_id,
    sourceArtifactId: row.source_artifact_id,
    timelineStartMs: row.timeline_start_ms,
    durationMs: row.duration_ms,
    sourceOffsetMs: row.source_offset_ms,
    gainDb: num(row.gain_db),
    muted: row.muted,
    fadeInMs: row.fade_in_ms,
    fadeOutMs: row.fade_out_ms,
  };
}

async function assertOwnsProject(
  context: AuthContext,
  projectId: string,
): Promise<ProjectRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  }
  const row = data as ProjectRow;
  if (row.owner_id !== context.userId) {
    throw new AuthError("FORBIDDEN", "Brak dostępu do tego projektu.");
  }
  return row;
}

export async function listStudioProjectsFor(
  context: AuthContext,
): Promise<StudioProjectSummary[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_projects")
    .select("*")
    .eq("owner_id", context.userId)
    .neq("status", "ARCHIVED")
    .order("updated_at", { ascending: false })
    .limit(STUDIO_MAX_PROJECTS_PER_USER);
  if (error) throw new Error(error.message);
  return (data as ProjectRow[] | null)?.map(mapProjectSummary) ?? [];
}

export async function listStudioProjects(): Promise<StudioProjectSummary[]> {
  return listStudioProjectsFor(await requireUser());
}

export async function createStudioProjectFor(
  context: AuthContext,
  input?: { title?: string; beatId?: string | null },
): Promise<StudioProjectDocument> {
  const admin = createSupabaseAdminClient();
  const { count, error: countError } = await admin
    .from("studio_projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", context.userId)
    .neq("status", "ARCHIVED");
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= STUDIO_MAX_PROJECTS_PER_USER) {
    throw new AuthError(
      "FORBIDDEN",
      `Osiągnięto limit ${STUDIO_MAX_PROJECTS_PER_USER} projektów Studio.`,
    );
  }

  const title = (input?.title?.trim() || "Nowy projekt").slice(
    0,
    STUDIO_TITLE_MAX_LENGTH,
  );
  const beatId = input?.beatId ?? null;
  let tempoBpm = STUDIO_DEFAULT_TEMPO_BPM;
  let beatDurationMs = STUDIO_DEFAULT_TIMELINE_LENGTH_MS;

  if (beatId) {
    const { data: beat, error: beatError } = await admin
      .from("beats")
      .select("id, bpm, duration_seconds")
      .eq("id", beatId)
      .maybeSingle();
    if (beatError) throw new Error(beatError.message);
    if (!beat) {
      throw new AuthError("NOT_FOUND", "Wybrany bit nie istnieje.");
    }
    if (typeof beat.bpm === "number" && beat.bpm >= 20 && beat.bpm <= 400) {
      tempoBpm = beat.bpm;
    }
    const durSec = Number(beat.duration_seconds ?? 60);
    beatDurationMs = Math.min(
      STUDIO_DEFAULT_TIMELINE_LENGTH_MS,
      Math.max(1000, Math.round(durSec * 1000)),
    );
  }

  const { data: project, error: projectError } = await admin
    .from("studio_projects")
    .insert({
      owner_id: context.userId,
      title,
      status: "DRAFT",
      tempo_bpm: tempoBpm,
      beat_id: beatId,
      timeline_length_ms: STUDIO_DEFAULT_TIMELINE_LENGTH_MS,
    })
    .select("*")
    .single();
  if (projectError) throw new Error(projectError.message);

  const projectRow = project as ProjectRow;
  const seedTracks: Array<{
    project_id: string;
    name: string;
    track_type: StudioTrackType;
    sort_order: number;
    record_armed: boolean;
  }> = [
    {
      project_id: projectRow.id,
      name: defaultTrackName("BEAT"),
      track_type: "BEAT",
      sort_order: 0,
      record_armed: false,
    },
    {
      project_id: projectRow.id,
      name: defaultTrackName("VOCAL"),
      track_type: "VOCAL",
      sort_order: 1,
      record_armed: true,
    },
  ];

  const { data: tracks, error: tracksError } = await admin
    .from("studio_tracks")
    .insert(seedTracks)
    .select("*");
  if (tracksError) throw new Error(tracksError.message);

  const trackRows = (tracks as TrackRow[] | null) ?? [];
  const clips: ClipRow[] = [];

  if (beatId) {
    const beatTrack = trackRows.find((t) => t.track_type === "BEAT");
    if (beatTrack) {
      const { data: clip, error: clipError } = await admin
        .from("studio_clips")
        .insert({
          track_id: beatTrack.id,
          source_kind: "BEAT_REF",
          source_beat_id: beatId,
          timeline_start_ms: 0,
          duration_ms: beatDurationMs,
          source_offset_ms: 0,
        })
        .select("*")
        .single();
      if (clipError) throw new Error(clipError.message);
      clips.push(clip as ClipRow);
    }
  }

  return {
    project: {
      ...mapProjectSummary(projectRow),
      timeSignatureNum: projectRow.time_signature_num,
      timeSignatureDen: projectRow.time_signature_den,
      masterGainDb: num(projectRow.master_gain_db),
      masterPan: num(projectRow.master_pan),
      masterFxChain: readStudioFxChain(projectRow.master_fx_chain, "master"),
      documentVersion: projectRow.document_version,
      schemaVersion: projectRow.schema_version,
    },
    tracks: trackRows.map(mapTrack).sort((a, b) => a.sortOrder - b.sortOrder),
    clips: clips.map(mapClip),
  };
}

export async function createStudioProject(input?: {
  title?: string;
  beatId?: string | null;
}): Promise<StudioProjectDocument> {
  return createStudioProjectFor(await requireUser(), input);
}

export async function getStudioProjectDocumentFor(
  context: AuthContext,
  projectId: string,
): Promise<StudioProjectDocument> {
  const projectRow = await assertOwnsProject(context, projectId);
  const admin = createSupabaseAdminClient();

  const { data: tracks, error: tracksError } = await admin
    .from("studio_tracks")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (tracksError) throw new Error(tracksError.message);
  const trackRows = (tracks as TrackRow[] | null) ?? [];
  const trackIds = trackRows.map((t) => t.id);

  let clipRows: ClipRow[] = [];
  if (trackIds.length > 0) {
    const { data: clips, error: clipsError } = await admin
      .from("studio_clips")
      .select("*")
      .in("track_id", trackIds)
      .order("timeline_start_ms", { ascending: true });
    if (clipsError) throw new Error(clipsError.message);
    clipRows = (clips as ClipRow[] | null) ?? [];
  }

  return {
    project: {
      ...mapProjectSummary(projectRow),
      timeSignatureNum: projectRow.time_signature_num,
      timeSignatureDen: projectRow.time_signature_den,
      masterGainDb: num(projectRow.master_gain_db),
      masterPan: num(projectRow.master_pan),
      masterFxChain: readStudioFxChain(projectRow.master_fx_chain, "master"),
      documentVersion: projectRow.document_version,
      schemaVersion: projectRow.schema_version,
    },
    tracks: trackRows.map(mapTrack),
    clips: clipRows.map(mapClip),
  };
}

export async function getStudioProjectDocument(
  projectId: string,
): Promise<StudioProjectDocument> {
  return getStudioProjectDocumentFor(await requireUser(), projectId);
}

export async function updateStudioTrackControlsFor(
  context: AuthContext,
  input: {
    projectId: string;
    trackId: string;
    name?: string;
    muted?: boolean;
    solo?: boolean;
    gainDb?: number;
    pan?: number;
    recordArmed?: boolean;
  },
): Promise<{ track: StudioTrackDto; documentVersion: number }> {
  await assertOwnsProject(context, input.projectId);
  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadError } = await admin
    .from("studio_tracks")
    .select("*")
    .eq("id", input.trackId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!existing) {
    throw new AuthError("NOT_FOUND", "Ścieżka nie została znaleziona.");
  }

  const patch: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    const name = input.name.trim().slice(0, STUDIO_TRACK_NAME_MAX_LENGTH);
    if (!name) throw new AuthError("FORBIDDEN", "Nazwa ścieżki jest wymagana.");
    patch.name = name;
  }
  if (typeof input.muted === "boolean") patch.muted = input.muted;
  if (typeof input.solo === "boolean") patch.solo = input.solo;
  if (typeof input.gainDb === "number" && Number.isFinite(input.gainDb)) {
    patch.gain_db = input.gainDb;
  }
  if (typeof input.pan === "number") patch.pan = normalizePan(input.pan);
  if (typeof input.recordArmed === "boolean") {
    patch.record_armed = input.recordArmed;
    if (input.recordArmed) {
      await admin
        .from("studio_tracks")
        .update({ record_armed: false })
        .eq("project_id", input.projectId)
        .neq("id", input.trackId);
    }
  }

  const { data, error } = await admin
    .from("studio_tracks")
    .update(patch)
    .eq("id", input.trackId)
    .eq("project_id", input.projectId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const project = await assertOwnsProject(context, input.projectId);
  const nextVersion = project.document_version + 1;
  const { data: versionRow, error: versionError } = await admin
    .from("studio_projects")
    .update({ document_version: nextVersion })
    .eq("id", input.projectId)
    .select("document_version")
    .single();
  if (versionError) throw new Error(versionError.message);

  return {
    track: mapTrack(data as TrackRow),
    documentVersion: num(versionRow.document_version),
  };
}

export async function updateStudioTrackControls(
  input: Parameters<typeof updateStudioTrackControlsFor>[1],
): Promise<{ track: StudioTrackDto; documentVersion: number }> {
  return updateStudioTrackControlsFor(await requireUser(), input);
}

/**
 * P6.4.1 — Master Gain/Pan on existing studio_projects columns + document_version CAS.
 * No new table. No FX chain mutation.
 */
export async function updateStudioMasterMixFor(
  context: AuthContext,
  input: {
    projectId: string;
    expectedDocumentVersion: unknown;
    masterGainDb?: unknown;
    masterPan?: unknown;
  },
): Promise<{
  documentVersion: number;
  masterGainDb: number;
  masterPan: number;
}> {
  const project = await assertOwnsProject(context, input.projectId);
  const expected = parseExpectedDocumentVersion(input.expectedDocumentVersion);

  const hasGain = input.masterGainDb !== undefined;
  const hasPan = input.masterPan !== undefined;
  if (!hasGain && !hasPan) {
    throw new StudioFxChainError(
      "FX_CHAIN_INVALID",
      "Nie udało się zapisać Master. Sprawdź wartości i spróbuj ponownie. (empty patch)",
    );
  }

  const nextGain = hasGain
    ? parseStudioMasterGainDb(input.masterGainDb)
    : num(project.master_gain_db);
  const nextPan = hasPan
    ? parseStudioMasterPan(input.masterPan)
    : num(project.master_pan);

  if (expected !== project.document_version) {
    throw new StudioFxCasConflictError();
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_projects")
    .update({
      master_gain_db: nextGain,
      master_pan: nextPan,
      document_version: expected + 1,
    })
    .eq("id", input.projectId)
    .eq("owner_id", context.userId)
    .eq("document_version", expected)
    .select("document_version, master_gain_db, master_pan")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new StudioFxCasConflictError();

  return {
    documentVersion: num(data.document_version),
    masterGainDb: num(data.master_gain_db),
    masterPan: num(data.master_pan),
  };
}

export async function updateStudioMasterMix(
  input: Parameters<typeof updateStudioMasterMixFor>[1],
): Promise<{
  documentVersion: number;
  masterGainDb: number;
  masterPan: number;
}> {
  return updateStudioMasterMixFor(await requireUser(), input);
}

export async function reorderStudioTrackFor(
  context: AuthContext,
  input: { projectId: string; trackId: string; direction: "up" | "down" },
): Promise<StudioTrackDto[]> {
  await assertOwnsProject(context, input.projectId);
  const admin = createSupabaseAdminClient();
  const { data: tracks, error } = await admin
    .from("studio_tracks")
    .select("*")
    .eq("project_id", input.projectId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (tracks as TrackRow[] | null) ?? [];
  const ordered = reorderTrackIds({
    orderedIds: rows.map((r) => r.id),
    trackId: input.trackId,
    direction: input.direction,
  });
  const updates = applySortOrders(ordered);
  for (const u of updates) {
    const { error: upError } = await admin
      .from("studio_tracks")
      .update({ sort_order: u.sortOrder })
      .eq("id", u.id)
      .eq("project_id", input.projectId);
    if (upError) throw new Error(upError.message);
  }

  const { data: refreshed, error: refreshError } = await admin
    .from("studio_tracks")
    .select("*")
    .eq("project_id", input.projectId)
    .order("sort_order", { ascending: true });
  if (refreshError) throw new Error(refreshError.message);
  return ((refreshed as TrackRow[] | null) ?? []).map(mapTrack);
}

export async function reorderStudioTrack(
  input: Parameters<typeof reorderStudioTrackFor>[1],
): Promise<StudioTrackDto[]> {
  return reorderStudioTrackFor(await requireUser(), input);
}

export async function addStudioClipFor(
  context: AuthContext,
  input: {
    projectId: string;
    trackId: string;
    sourceKind: StudioClipDto["sourceKind"];
    sourceTakeId?: string | null;
    sourceBeatId?: string | null;
    sourceArtifactId?: string | null;
    timelineStartMs: number;
    durationMs: number;
    sourceOffsetMs?: number;
  },
): Promise<StudioClipDto> {
  const project = await assertOwnsProject(context, input.projectId);
  assertValidClipSource(input);
  assertClipPlacement({
    timelineStartMs: input.timelineStartMs,
    durationMs: input.durationMs,
    sourceOffsetMs: input.sourceOffsetMs ?? 0,
    timelineLengthMs: project.timeline_length_ms,
  });

  const admin = createSupabaseAdminClient();
  const { data: track, error: trackError } = await admin
    .from("studio_tracks")
    .select("id, project_id")
    .eq("id", input.trackId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (trackError) throw new Error(trackError.message);
  if (!track) {
    throw new AuthError("NOT_FOUND", "Ścieżka nie została znaleziona.");
  }

  if (input.sourceKind === "TAKE" && input.sourceTakeId) {
    const { data: take, error: takeError } = await admin
      .from("takes")
      .select("id, owner_id, status, deleted_at")
      .eq("id", input.sourceTakeId)
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
  }

  const { data, error } = await admin
    .from("studio_clips")
    .insert({
      track_id: input.trackId,
      source_kind: input.sourceKind,
      source_take_id: input.sourceTakeId ?? null,
      source_beat_id: input.sourceBeatId ?? null,
      source_artifact_id: input.sourceArtifactId ?? null,
      timeline_start_ms: input.timelineStartMs,
      duration_ms: input.durationMs,
      source_offset_ms: input.sourceOffsetMs ?? 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapClip(data as ClipRow);
}

export async function addStudioClip(
  input: Parameters<typeof addStudioClipFor>[1],
): Promise<StudioClipDto> {
  return addStudioClipFor(await requireUser(), input);
}

async function loadOwnedClip(
  context: AuthContext,
  projectId: string,
  clipId: string,
): Promise<{ project: ProjectRow; clip: ClipRow }> {
  const project = await assertOwnsProject(context, projectId);
  const admin = createSupabaseAdminClient();
  const { data: clip, error: clipError } = await admin
    .from("studio_clips")
    .select("*")
    .eq("id", clipId)
    .maybeSingle();
  if (clipError) throw new Error(clipError.message);
  if (!clip) {
    throw new AuthError("NOT_FOUND", "Klip nie został znaleziony.");
  }
  const row = clip as ClipRow;
  const { data: track, error: trackError } = await admin
    .from("studio_tracks")
    .select("id, project_id")
    .eq("id", row.track_id)
    .maybeSingle();
  if (trackError) throw new Error(trackError.message);
  if (!track || track.project_id !== projectId) {
    throw new AuthError("NOT_FOUND", "Klip nie został znaleziony.");
  }
  return { project, clip: row };
}

export type StudioClipGeometryPatch =
  | { op: "move"; timelineStartMs: number }
  | { op: "trim_left"; trimMs: number }
  | { op: "trim_right"; trimMs: number }
  | { op: "trim_left_to_playhead"; playheadMs: number }
  | { op: "trim_right_to_playhead"; playheadMs: number }
  | {
      op: "set_geometry";
      timelineStartMs: number;
      durationMs: number;
      sourceOffsetMs: number;
    };

export async function updateStudioClipGeometryFor(
  context: AuthContext,
  input: {
    projectId: string;
    clipId: string;
    patch: StudioClipGeometryPatch;
    expectedDocumentVersion?: unknown;
  },
): Promise<{ clip: StudioClipDto; documentVersion?: number }> {
  const { project, clip } = await loadOwnedClip(
    context,
    input.projectId,
    input.clipId,
  );
  const current: StudioClipGeometry = {
    timelineStartMs: clip.timeline_start_ms,
    durationMs: clip.duration_ms,
    sourceOffsetMs: clip.source_offset_ms,
  };
  const length = project.timeline_length_ms;

  let next: StudioClipGeometry;
  switch (input.patch.op) {
    case "move":
      next = moveClipGeometry({
        clip: current,
        timelineStartMs: input.patch.timelineStartMs,
        timelineLengthMs: length,
      });
      break;
    case "trim_left":
      next = trimClipLeft({
        clip: current,
        trimMs: input.patch.trimMs,
        timelineLengthMs: length,
      });
      break;
    case "trim_right":
      next = trimClipRight({
        clip: current,
        trimMs: input.patch.trimMs,
        timelineLengthMs: length,
      });
      break;
    case "trim_left_to_playhead":
      next = trimClipLeftToPlayhead({
        clip: current,
        playheadMs: input.patch.playheadMs,
        timelineLengthMs: length,
      });
      break;
    case "trim_right_to_playhead":
      next = trimClipRightToPlayhead({
        clip: current,
        playheadMs: input.patch.playheadMs,
        timelineLengthMs: length,
      });
      break;
    case "set_geometry":
      next = {
        timelineStartMs: input.patch.timelineStartMs,
        durationMs: input.patch.durationMs,
        sourceOffsetMs: input.patch.sourceOffsetMs,
      };
      assertClipPlacement({ ...next, timelineLengthMs: length });
      break;
    default:
      throw new Error("Nieznana operacja edycji klipu.");
  }

  const admin = createSupabaseAdminClient();
  const durationChanged = next.durationMs !== clip.duration_ms;

  // Move-only / duration-unchanged: pre-P6.7 non-CAS path (DF §17.3).
  if (!durationChanged) {
    const { data, error } = await admin
      .from("studio_clips")
      .update({
        timeline_start_ms: next.timelineStartMs,
        duration_ms: next.durationMs,
        source_offset_ms: next.sourceOffsetMs,
      })
      .eq("id", input.clipId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { clip: mapClip(data as ClipRow) };
  }

  // Duration-changing trim/geometry: clamp+normalize fades + atomic CAS (DF §14 / §17.2).
  const expected = parseExpectedDocumentVersion(input.expectedDocumentVersion);
  const fades = resolveFadesAfterTrim({
    fadeInMs: clip.fade_in_ms,
    fadeOutMs: clip.fade_out_ms,
    newDurationMs: next.durationMs,
  });

  const { data, error } = await admin.rpc("studio_cas_apply_clip_geometry_fades", {
    p_project_id: input.projectId,
    p_owner_id: context.userId,
    p_clip_id: input.clipId,
    p_expected: expected,
    p_timeline_start_ms: next.timelineStartMs,
    p_duration_ms: next.durationMs,
    p_source_offset_ms: next.sourceOffsetMs,
    p_fade_in_ms: fades.fadeInMs,
    p_fade_out_ms: fades.fadeOutMs,
  });
  if (error) {
    if (/CLIP_NOT_FOUND/i.test(error.message)) {
      throw new AuthError("NOT_FOUND", "Klip nie został znaleziony.");
    }
    throw new Error(error.message);
  }
  const rows =
    (data as Array<{ document_version: number }> | null) ?? [];
  const row = rows[0];
  if (!row) throw new StudioFxCasConflictError();

  const { data: refreshed, error: refreshError } = await admin
    .from("studio_clips")
    .select("*")
    .eq("id", input.clipId)
    .single();
  if (refreshError) throw new Error(refreshError.message);

  return {
    clip: mapClip(refreshed as ClipRow),
    documentVersion: num(row.document_version),
  };
}

export async function updateStudioClipGeometry(
  input: Parameters<typeof updateStudioClipGeometryFor>[1],
): Promise<{ clip: StudioClipDto; documentVersion?: number }> {
  return updateStudioClipGeometryFor(await requireUser(), input);
}

type ClipFadesCasRow = {
  document_version: number;
  fade_in_ms: number;
  fade_out_ms: number;
};

/**
 * P6.7.2 — Clip fade write path with atomic document_version CAS.
 * Persists existing fade_in_ms / fade_out_ms only. No new columns.
 */
export async function updateStudioClipFadesFor(
  context: AuthContext,
  input: {
    projectId: string;
    clipId: string;
    expectedDocumentVersion: unknown;
    fadeInMs: unknown;
    fadeOutMs: unknown;
  },
): Promise<{ clip: StudioClipDto; documentVersion: number }> {
  const { clip } = await loadOwnedClip(
    context,
    input.projectId,
    input.clipId,
  );
  const expected = parseExpectedDocumentVersion(input.expectedDocumentVersion);
  const normalized = resolveStudioClipFadesForWrite(
    input.fadeInMs,
    input.fadeOutMs,
    clip.duration_ms,
  );

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("studio_cas_apply_clip_fades", {
    p_project_id: input.projectId,
    p_owner_id: context.userId,
    p_clip_id: input.clipId,
    p_expected: expected,
    p_fade_in_ms: normalized.fadeInMs,
    p_fade_out_ms: normalized.fadeOutMs,
  });
  if (error) {
    if (/CLIP_NOT_FOUND/i.test(error.message)) {
      throw new AuthError("NOT_FOUND", "Klip nie został znaleziony.");
    }
    throw new Error(error.message);
  }
  const rows = (data as ClipFadesCasRow[] | null) ?? [];
  const row = rows[0];
  if (!row) throw new StudioFxCasConflictError();

  return {
    clip: mapClip({
      ...clip,
      fade_in_ms: num(row.fade_in_ms),
      fade_out_ms: num(row.fade_out_ms),
    }),
    documentVersion: num(row.document_version),
  };
}

export async function updateStudioClipFades(
  input: Parameters<typeof updateStudioClipFadesFor>[1],
): Promise<{ clip: StudioClipDto; documentVersion: number }> {
  return updateStudioClipFadesFor(await requireUser(), input);
}

export async function splitStudioClipFor(
  context: AuthContext,
  input: {
    projectId: string;
    clipId: string;
    atTimelineMs: number;
    expectedDocumentVersion: unknown;
  },
): Promise<{
  left: StudioClipDto;
  right: StudioClipDto;
  documentVersion: number;
}> {
  const { project, clip } = await loadOwnedClip(
    context,
    input.projectId,
    input.clipId,
  );
  const expected = parseExpectedDocumentVersion(input.expectedDocumentVersion);
  const { left, right } = splitClipGeometry({
    clip: {
      timelineStartMs: clip.timeline_start_ms,
      durationMs: clip.duration_ms,
      sourceOffsetMs: clip.source_offset_ms,
    },
    atTimelineMs: input.atTimelineMs,
    timelineLengthMs: project.timeline_length_ms,
  });
  const splitLocalMs = left.durationMs;
  const fades = resolveFadesAfterSplit({
    fadeInMs: clip.fade_in_ms,
    fadeOutMs: clip.fade_out_ms,
    durationMs: clip.duration_ms,
    splitLocalMs,
  });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("studio_cas_apply_clip_split", {
    p_project_id: input.projectId,
    p_owner_id: context.userId,
    p_clip_id: input.clipId,
    p_expected: expected,
    p_left_timeline_start_ms: left.timelineStartMs,
    p_left_duration_ms: left.durationMs,
    p_left_source_offset_ms: left.sourceOffsetMs,
    p_left_fade_in_ms: fades.left.fadeInMs,
    p_left_fade_out_ms: fades.left.fadeOutMs,
    p_right_timeline_start_ms: right.timelineStartMs,
    p_right_duration_ms: right.durationMs,
    p_right_source_offset_ms: right.sourceOffsetMs,
    p_right_fade_in_ms: fades.right.fadeInMs,
    p_right_fade_out_ms: fades.right.fadeOutMs,
  });
  if (error) {
    if (/CLIP_NOT_FOUND/i.test(error.message)) {
      throw new AuthError("NOT_FOUND", "Klip nie został znaleziony.");
    }
    throw new Error(error.message);
  }
  const rows =
    (data as Array<{ document_version: number; right_clip_id: string }> | null) ??
    [];
  const row = rows[0];
  if (!row) throw new StudioFxCasConflictError();

  const { data: leftRow, error: leftError } = await admin
    .from("studio_clips")
    .select("*")
    .eq("id", input.clipId)
    .single();
  if (leftError) throw new Error(leftError.message);

  const { data: rightRow, error: rightError } = await admin
    .from("studio_clips")
    .select("*")
    .eq("id", row.right_clip_id)
    .single();
  if (rightError) throw new Error(rightError.message);

  return {
    left: mapClip(leftRow as ClipRow),
    right: mapClip(rightRow as ClipRow),
    documentVersion: num(row.document_version),
  };
}

export async function splitStudioClip(
  input: Parameters<typeof splitStudioClipFor>[1],
): Promise<{
  left: StudioClipDto;
  right: StudioClipDto;
  documentVersion: number;
}> {
  return splitStudioClipFor(await requireUser(), input);
}

/**
 * Delete Clip row only. Source Take / Beat / Artifact / storage are untouched.
 */
export async function deleteStudioClipFor(
  context: AuthContext,
  input: { projectId: string; clipId: string },
): Promise<{ deletedClipId: string }> {
  await loadOwnedClip(context, input.projectId, input.clipId);
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("studio_clips")
    .delete()
    .eq("id", input.clipId);
  if (error) throw new Error(error.message);
  return { deletedClipId: input.clipId };
}

export async function deleteStudioClip(
  input: Parameters<typeof deleteStudioClipFor>[1],
): Promise<{ deletedClipId: string }> {
  return deleteStudioClipFor(await requireUser(), input);
}

type FxCasRow = {
  document_version: number;
  chain: StudioFxChainV1;
};

async function applyStudioFxChainCas(params: {
  ownerId: string;
  projectId: string;
  expectedDocumentVersion: number;
  chain: StudioFxChainV1;
  trackId: string | null;
}): Promise<FxCasRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("studio_cas_apply_fx_chain", {
    p_project_id: params.projectId,
    p_owner_id: params.ownerId,
    p_expected: params.expectedDocumentVersion,
    p_chain: params.chain,
    p_track_id: params.trackId,
  });
  if (error) {
    if (/TRACK_NOT_FOUND/i.test(error.message)) {
      throw new AuthError("NOT_FOUND", "Ścieżka nie została znaleziona.");
    }
    throw new Error(error.message);
  }
  const rows = (data as FxCasRow[] | null) ?? [];
  const row = rows[0];
  if (!row) throw new StudioFxCasConflictError();
  return row;
}

export async function updateStudioTrackEffectsChainFor(
  context: AuthContext,
  input: {
    projectId: string;
    trackId: string;
    expectedDocumentVersion: unknown;
    chain: unknown;
  },
): Promise<{
  documentVersion: number;
  effectsChain: StudioFxChainV1;
}> {
  await assertOwnsProject(context, input.projectId);
  const expected = parseExpectedDocumentVersion(input.expectedDocumentVersion);
  const chain = parseStudioFxChainForWrite(input.chain, { role: "track" });
  const admin = createSupabaseAdminClient();
  const { data: track, error } = await admin
    .from("studio_tracks")
    .select("id")
    .eq("id", input.trackId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!track) {
    throw new AuthError("NOT_FOUND", "Ścieżka nie została znaleziona.");
  }
  const applied = await applyStudioFxChainCas({
    ownerId: context.userId,
    projectId: input.projectId,
    expectedDocumentVersion: expected,
    chain,
    trackId: input.trackId,
  });
  return {
    documentVersion: applied.document_version,
    effectsChain: readStudioFxChain(applied.chain, "track"),
  };
}

export async function updateStudioTrackEffectsChain(
  input: Parameters<typeof updateStudioTrackEffectsChainFor>[1],
): Promise<{ documentVersion: number; effectsChain: StudioFxChainV1 }> {
  return updateStudioTrackEffectsChainFor(await requireUser(), input);
}

export async function updateStudioMasterFxChainFor(
  context: AuthContext,
  input: {
    projectId: string;
    expectedDocumentVersion: unknown;
    chain: unknown;
  },
): Promise<{
  documentVersion: number;
  masterFxChain: StudioFxChainV1;
}> {
  await assertOwnsProject(context, input.projectId);
  const expected = parseExpectedDocumentVersion(input.expectedDocumentVersion);
  const chain = parseStudioFxChainForWrite(input.chain, { role: "master" });
  const applied = await applyStudioFxChainCas({
    ownerId: context.userId,
    projectId: input.projectId,
    expectedDocumentVersion: expected,
    chain,
    trackId: null,
  });
  return {
    documentVersion: applied.document_version,
    masterFxChain: readStudioFxChain(applied.chain, "master"),
  };
}

export async function updateStudioMasterFxChain(
  input: Parameters<typeof updateStudioMasterFxChainFor>[1],
): Promise<{ documentVersion: number; masterFxChain: StudioFxChainV1 }> {
  return updateStudioMasterFxChainFor(await requireUser(), input);
}
