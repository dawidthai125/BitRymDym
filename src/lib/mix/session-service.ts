/**
 * E3.3 — Mix Session service (service-role mutations; owner AuthZ first).
 */

import "server-only";

import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  assertMixBeatPlaybackAccess,
  assertMixRuntimeEnabled,
  assertMixTakeAccess,
  assertOwnMixSession,
  mixProAllowed,
  resolveMixEntitlement,
  sanitizeMixClientClaims,
  MixAuthzError,
} from "@/lib/mix/authz";
import {
  MIX_PARAMS_VERSION,
  defaultMixParameters,
  parseMixParameters,
  previewEngineForCapabilities,
  serializeMixParameters,
  type MixParameters,
} from "@/lib/mix/params";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { MixSessionStatus } from "@/types/domain";
import { requestBeatAudioAccess } from "@/lib/beats/audio-access";
import { createOwnTakePreviewSignedUrlFor } from "@/lib/takes/take-preview";
import { PUBLIC_PLAYBACK_PURPOSE } from "@/lib/beats/public";

export type MixSessionRecord = {
  id: string;
  ownerId: string;
  sourceTakeId: string;
  beatId: string;
  parameters: MixParameters;
  paramsVersion: number;
  previewEngineId: string | null;
  status: MixSessionStatus;
  createdAt: string;
  updatedAt: string;
  mixPro: boolean;
};

type MixSessionRow = {
  id: string;
  owner_id: string;
  source_take_id: string;
  beat_id: string;
  parameters: unknown;
  params_version: number;
  preview_engine_id: string | null;
  status: MixSessionStatus;
  created_at: string;
  updated_at: string;
};

function mapRow(
  row: MixSessionRow,
  mixPro: boolean,
): MixSessionRecord {
  const raw =
    row.parameters && typeof row.parameters === "object"
      ? { ...(row.parameters as Record<string, unknown>) }
      : {};
  if (!mixPro) {
    delete raw.pro;
  }
  return {
    id: row.id,
    ownerId: row.owner_id,
    sourceTakeId: row.source_take_id,
    beatId: row.beat_id,
    parameters: parseMixParameters(raw, { allowPro: mixPro }),
    paramsVersion: row.params_version,
    previewEngineId: row.preview_engine_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mixPro,
  };
}

async function loadTakeOrThrow(takeId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("takes")
    .select(
      "id, owner_id, beat_id, status, object_key, storage_bucket, content_type, duration_seconds, expires_at, deleted_at",
    )
    .eq("id", takeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Take not found.");
  return data;
}

async function loadBeatStatusOrThrow(beatId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beats")
    .select("id, status")
    .eq("id", beatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Beat not found.");
  return data.status as string;
}

export async function createMixSessionFor(
  context: AuthContext,
  input: {
    takeId: string;
    beatId: string;
    parameters?: unknown;
  },
): Promise<MixSessionRecord> {
  assertMixRuntimeEnabled();
  const entitlement = await resolveMixEntitlement(context);
  const allowPro = mixProAllowed(entitlement);

  const take = await loadTakeOrThrow(input.takeId);
  assertMixTakeAccess({
    take: {
      id: take.id as string,
      owner_id: take.owner_id as string | null,
      beat_id: take.beat_id as string,
      status: take.status as string,
      object_key: take.object_key as string,
      storage_bucket: take.storage_bucket as string,
      content_type: take.content_type as string | null,
      duration_seconds: take.duration_seconds as number | null,
      byte_size: null,
      expires_at: take.expires_at as string,
      deleted_at: take.deleted_at as string | null,
    },
    userId: context.userId,
    expectedBeatId: input.beatId,
  });

  const beatStatus = await loadBeatStatusOrThrow(input.beatId);
  assertMixBeatPlaybackAccess({
    beatStatus,
    actorRole: context.profile.role,
  });

  const parameters = parseMixParameters(
    input.parameters ?? defaultMixParameters(),
    { allowPro },
  );
  const previewEngineId = previewEngineForCapabilities(
    entitlement.capabilities,
  );

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("mix_sessions")
    .insert({
      owner_id: context.userId,
      source_take_id: input.takeId,
      beat_id: input.beatId,
      parameters: serializeMixParameters(parameters),
      params_version: MIX_PARAMS_VERSION,
      preview_engine_id: previewEngineId,
      status: "DRAFT",
    })
    .select(
      "id, owner_id, source_take_id, beat_id, parameters, params_version, preview_engine_id, status, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create mix session.");
  }
  return mapRow(data as MixSessionRow, allowPro);
}

export async function getMixSessionFor(
  context: AuthContext,
  sessionId: string,
): Promise<MixSessionRecord> {
  assertMixRuntimeEnabled();
  const entitlement = await resolveMixEntitlement(context);
  const allowPro = mixProAllowed(entitlement);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("mix_sessions")
    .select(
      "id, owner_id, source_take_id, beat_id, parameters, params_version, preview_engine_id, status, created_at, updated_at",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new MixAuthzError("Mix session not found.", "NOT_FOUND");

  assertOwnMixSession({
    sessionOwnerId: data.owner_id as string,
    userId: context.userId,
  });

  return mapRow(data as MixSessionRow, allowPro);
}

export async function updateMixSessionParametersFor(
  context: AuthContext,
  sessionId: string,
  parametersRaw: unknown,
): Promise<MixSessionRecord> {
  assertMixRuntimeEnabled();
  const entitlement = await resolveMixEntitlement(context);
  const allowPro = mixProAllowed(entitlement);

  const existing = await getMixSessionFor(context, sessionId);
  const parameters = parseMixParameters(parametersRaw, { allowPro });
  const previewEngineId = previewEngineForCapabilities(
    entitlement.capabilities,
  );

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("mix_sessions")
    .update({
      parameters: serializeMixParameters(parameters),
      params_version: MIX_PARAMS_VERSION,
      preview_engine_id: previewEngineId,
    })
    .eq("id", existing.id)
    .eq("owner_id", context.userId)
    .select(
      "id, owner_id, source_take_id, beat_id, parameters, params_version, preview_engine_id, status, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update mix session.");
  }
  return mapRow(data as MixSessionRow, allowPro);
}

export async function listOwnMixSessionsForBeat(
  context: AuthContext,
  beatId: string,
): Promise<MixSessionRecord[]> {
  assertMixRuntimeEnabled();
  const entitlement = await resolveMixEntitlement(context);
  const allowPro = mixProAllowed(entitlement);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("mix_sessions")
    .select(
      "id, owner_id, source_take_id, beat_id, parameters, params_version, preview_engine_id, status, created_at, updated_at",
    )
    .eq("owner_id", context.userId)
    .eq("beat_id", beatId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return (data as MixSessionRow[] | null)?.map((row) =>
    mapRow(row, allowPro),
  ) ?? [];
}

export type MixPreviewSources = {
  sessionId: string;
  take: { url: string; expiresAt: string; contentType: string };
  beat: { url: string; expiresAt: string };
  parameters: MixParameters;
  mixPro: boolean;
  previewEngineId: string | null;
};

export async function createMixPreviewSourcesFor(
  context: AuthContext,
  sessionId: string,
): Promise<MixPreviewSources> {
  assertMixRuntimeEnabled();
  const session = await getMixSessionFor(context, sessionId);

  const takePreview = await createOwnTakePreviewSignedUrlFor(context, {
    takeId: session.sourceTakeId,
  });
  if (takePreview.beatId !== session.beatId) {
    throw new MixAuthzError("Take/beat binding mismatch.", "FORBIDDEN");
  }

  const beatAccess = await requestBeatAudioAccess({
    beatId: session.beatId,
    purpose: PUBLIC_PLAYBACK_PURPOSE,
  });

  return {
    sessionId: session.id,
    take: {
      url: takePreview.url,
      expiresAt: takePreview.expiresAt,
      contentType: takePreview.contentType,
    },
    beat: {
      url: beatAccess.url,
      expiresAt: beatAccess.expiresAt,
    },
    parameters: session.parameters,
    mixPro: session.mixPro,
    previewEngineId: session.previewEngineId,
  };
}

export async function createMixSession(input: {
  takeId: string;
  beatId: string;
  parameters?: unknown;
  body?: Record<string, unknown>;
}): Promise<MixSessionRecord> {
  if (input.body) sanitizeMixClientClaims(input.body);
  const context = await requireUser();
  return createMixSessionFor(context, input);
}

export async function getMixSession(sessionId: string): Promise<MixSessionRecord> {
  const context = await requireUser();
  return getMixSessionFor(context, sessionId);
}

export async function updateMixSessionParameters(params: {
  sessionId: string;
  parameters: unknown;
  body?: Record<string, unknown>;
}): Promise<MixSessionRecord> {
  if (params.body) sanitizeMixClientClaims(params.body);
  const context = await requireUser();
  return updateMixSessionParametersFor(
    context,
    params.sessionId,
    params.parameters,
  );
}

export async function createMixPreviewSources(
  sessionId: string,
): Promise<MixPreviewSources> {
  const context = await requireUser();
  return createMixPreviewSourcesFor(context, sessionId);
}
