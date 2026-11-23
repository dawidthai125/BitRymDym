import "server-only";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { AuthError } from "@/lib/auth/session";
import { parseCatalogCopyTakeTitle } from "@/lib/catalog/catalog-originals";
import type { AuthContext } from "@/lib/auth/types";
import {
  BEAT_AUDIO_BUCKET,
  buildCatalogOriginalObjectKey,
  validateCatalogOriginalContentSniff,
} from "@/lib/beats/audio-validation";
import { probeAudioDurationFromBytes } from "@/lib/beats/audio-duration";
import { executeCatalogAssetCopyFor } from "@/lib/catalog/catalog-copy-service";
import {
  applyConsentPatch,
  CONSENT_KEYS,
  consentColumns,
  consentsFromRow,
  type ConsentPatch,
  type ListingConsents,
} from "@/lib/community/consents";
import { TakeClaimError } from "@/lib/takes/claim-errors";
import { expectedUserTakeObjectKey } from "@/lib/takes/object-key";
import {
  createTakeRecordingSessionFor,
  finalizeTakeRecordingFor,
} from "@/lib/takes/take-transport";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingRpcFunction } from "@/lib/supabase/rpc-errors";
import {
  SAMPLE_CAP,
  SAMPLE_COPY_FAILED,
  SAMPLE_FORBIDDEN,
  SAMPLE_INVALID,
  SAMPLE_NOT_FOUND,
  SAMPLE_PROJECT_NO_BEAT,
  SAMPLE_TABLE_UNAVAILABLE,
  STUDIO_SAMPLES_TABLE,
  buildUserSampleObjectKey,
  catalogDurationSeconds,
  effectiveSampleCap,
  evaluateSampleAudioMeta,
  evaluateSampleCreate,
  evaluateSampleDelete,
  evaluateSampleReview,
  evaluateSampleSubmit,
  instrumentKind,
  isSampleInstrumentId,
  isSampleUuid,
  normalizeSampleNote,
  normalizeSampleTitle,
  sampleCopyTakeTitle,
  sampleObjectKeyMatches,
  SAMPLE_DOWNLOAD_BLOCKED,
  parseSampleCopyTakeTitle,
  type SampleKind,
  type SampleLabMeta,
  type SampleStatus,
} from "@/lib/studio/samples/sample-policy";
import { wavDurationMs } from "@/lib/studio/samples/sample-synth";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type StudioSampleDto = {
  id: string;
  title: string;
  kind: SampleKind;
  instrument: string | null;
  status: SampleStatus;
  durationMs: number;
  catalogAssetId: string | null;
  moderationNote: string | null;
  mine: boolean;
  /** Author switches. Null for someone else's sample. */
  consents: ListingConsents | null;
  /** Sample Lab metadata; null until the lab columns exist or when not set. */
  sampleType: SampleLabMeta["sampleType"] | null;
  bpm: number | null;
  musicalKey: string | null;
  bars: number | null;
  source: SampleLabMeta["source"] | null;
  beatId: string | null;
  createdAt: string | null;
};

type SampleRow = {
  id: string;
  owner_id: string;
  title: string;
  kind: string;
  instrument: string | null;
  status: string;
  rights_accepted: boolean;
  object_key: string;
  content_type: string;
  byte_size: number;
  duration_ms: number;
  catalog_asset_id: string | null;
  moderation_note: string | null;
  public_listing?: boolean;
  allow_ratings?: boolean;
  allow_comments?: boolean;
  in_rankings?: boolean;
};

export type SampleFailure = { ok: false; error: string; details?: string[] };
export type SampleSuccess<T> = { ok: true } & T;

const SELECT_ROW =
  "id, owner_id, title, kind, instrument, status, rights_accepted, object_key, content_type, byte_size, duration_ms, catalog_asset_id, moderation_note, public_listing, allow_ratings, allow_comments, in_rankings";

function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    (message.includes("does not exist") &&
      (message.includes("studio_samples") || message.includes("catalog_assets")))
  );
}

function toDto(row: SampleRow, viewerId: string): StudioSampleDto {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind === "effect" ? "effect" : "instrument",
    instrument: row.instrument,
    status: row.status as SampleStatus,
    durationMs: Number(row.duration_ms),
    catalogAssetId: row.catalog_asset_id,
    moderationNote: row.owner_id === viewerId ? row.moderation_note : null,
    mine: row.owner_id === viewerId,
    consents: row.owner_id === viewerId ? consentsFromRow(row, row.public_listing === true) : null,
    sampleType: null,
    bpm: null,
    musicalKey: null,
    bars: null,
    source: null,
    beatId: null,
    createdAt: null,
  };
}

/** Lab metadata in a separate read so a DB without the lab columns still lists samples. */
async function attachLabMeta(admin: AdminClient, samples: StudioSampleDto[]): Promise<StudioSampleDto[]> {
  if (samples.length === 0) return samples;
  const loaded = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select("id, sample_type, bpm, musical_key, bars, source, beat_id, created_at")
    .in("id", samples.map((sample) => sample.id));
  if (loaded.error) return samples;
  const rows = new Map(((loaded.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]));
  return samples.map((sample) => {
    const row = rows.get(sample.id);
    if (!row) return sample;
    return {
      ...sample,
      sampleType: (row.sample_type as SampleLabMeta["sampleType"] | null) ?? null,
      bpm: row.bpm == null ? null : Number(row.bpm),
      musicalKey: (row.musical_key as string | null) ?? null,
      bars: row.bars == null ? null : Number(row.bars),
      source: (row.source as SampleLabMeta["source"] | null) ?? null,
      beatId: (row.beat_id as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
    };
  });
}

function mapThrown(error: unknown): SampleFailure {
  if (error instanceof TakeClaimError) {
    return { ok: false, error: SAMPLE_COPY_FAILED, details: [error.claimCode] };
  }
  if (error instanceof AuthError) {
    return { ok: false, error: error.code, details: [error.message] };
  }
  return { ok: false, error: SAMPLE_COPY_FAILED, details: ["sample copy stopped"] };
}

async function readDurationMs(
  bytes: Uint8Array,
  contentType: string,
): Promise<number | null> {
  if (contentType === "audio/wav" || contentType === "audio/x-wav") {
    return wavDurationMs(bytes);
  }
  const probed = await probeAudioDurationFromBytes({
    bytes,
    contentTypeHint: contentType,
    originalFilename: "sample.mp3",
  });
  if (!probed.ok) return null;
  return Math.round(probed.durationRawSeconds * 1000);
}

export async function listMyStudioSamples(
  context: AuthContext,
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<SampleSuccess<{ samples: StudioSampleDto[] }> | SampleFailure> {
  const { data, error } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select(SELECT_ROW)
    .eq("owner_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error && isMissingRelation(error)) {
    return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  }
  if (error) return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  return {
    ok: true,
    samples: await attachLabMeta(admin, ((data ?? []) as SampleRow[]).map((row) => toDto(row, context.userId))),
  };
}

export async function listPublishedStudioSamples(
  context: AuthContext,
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<SampleSuccess<{ samples: StudioSampleDto[] }> | SampleFailure> {
  const { data, error } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select(SELECT_ROW)
    .eq("status", "PUBLISHED")
    .eq("public_listing", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error && isMissingRelation(error)) {
    return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  }
  if (error) return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  return {
    ok: true,
    samples: await attachLabMeta(admin, ((data ?? []) as SampleRow[]).map((row) => toDto(row, context.userId))),
  };
}

export async function listPendingStudioSamples(
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<SampleSuccess<{ samples: SampleRow[] }> | SampleFailure> {
  const { data, error } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select(SELECT_ROW)
    .eq("status", "PENDING_REVIEW")
    .order("created_at", { ascending: true })
    .limit(80);
  if (error && isMissingRelation(error)) {
    return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  }
  if (error) return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  return { ok: true, samples: (data ?? []) as SampleRow[] };
}

async function loadOwnedOrPublic(
  admin: AdminClient,
  sampleId: string,
): Promise<SampleRow | null | "missing"> {
  const { data, error } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select(SELECT_ROW)
    .eq("id", sampleId)
    .maybeSingle();
  if (error && isMissingRelation(error)) return "missing";
  if (error || !data) return null;
  return data as SampleRow;
}

export async function createStudioSample(
  context: AuthContext,
  input: {
    title: string;
    kind: SampleKind;
    instrument: string | null;
    rightsAccepted: boolean;
    bytes: Uint8Array;
    declaredContentType: string;
    cap: number;
    /** Sample Lab metadata (only written when given, so the old desk works without the lab columns). */
    meta?: SampleLabMeta | null;
  },
  admin: AdminClient = createSupabaseAdminClient(),
  sampleId: string = crypto.randomUUID(),
): Promise<SampleSuccess<{ sample: StudioSampleDto }> | SampleFailure> {
  const title = normalizeSampleTitle(input.title);
  if (!title) {
    return { ok: false, error: SAMPLE_INVALID, details: ["title is required"] };
  }
  if (input.kind !== "instrument" && input.kind !== "effect") {
    return { ok: false, error: SAMPLE_INVALID, details: ["kind is invalid"] };
  }
  if (input.instrument != null && !isSampleInstrumentId(input.instrument)) {
    return { ok: false, error: SAMPLE_INVALID, details: ["instrument is invalid"] };
  }
  if (
    input.instrument != null &&
    isSampleInstrumentId(input.instrument) &&
    instrumentKind(input.instrument) !== input.kind
  ) {
    return { ok: false, error: SAMPLE_INVALID, details: ["kind does not match the instrument"] };
  }

  const { count, error: countError } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("owner_id", context.userId);
  if (countError && isMissingRelation(countError)) {
    return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  }
  if (countError) return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  const gate = evaluateSampleCreate({
    rightsAccepted: input.rightsAccepted,
    ownedCount: count ?? 0,
    cap: input.cap,
  });
  if (!gate.ok) return gate;

  const sniffed = validateCatalogOriginalContentSniff({
    bytes: input.bytes,
    declaredContentType: input.declaredContentType,
  });
  if (!sniffed.ok) {
    return { ok: false, error: SAMPLE_INVALID, details: sniffed.details };
  }
  const durationMs = await readDurationMs(input.bytes, sniffed.sniffedContentType);
  if (durationMs == null) {
    return { ok: false, error: SAMPLE_INVALID, details: ["duration could not be read"] };
  }
  const meta = evaluateSampleAudioMeta({
    byteSize: input.bytes.byteLength,
    durationMs,
    contentType: sniffed.sniffedContentType,
  });
  if (!meta.ok) return meta;

  const objectKey = buildUserSampleObjectKey(sampleId);
  const { error: uploadError } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .upload(objectKey, input.bytes, {
      contentType: sniffed.sniffedContentType,
      upsert: false,
    });
  if (uploadError) {
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["sample upload failed"] };
  }

  const lab = input.meta
    ? {
        sample_type: input.meta.sampleType,
        bpm: input.meta.bpm,
        musical_key: input.meta.musicalKey,
        bars: input.meta.bars,
        source: input.meta.source,
        beat_id: input.meta.beatId,
      }
    : null;
  const base = {
    id: sampleId,
    owner_id: context.userId,
    title,
    kind: input.kind,
    instrument: input.instrument,
    status: "PRIVATE",
    rights_accepted: true,
    object_key: objectKey,
    content_type: sniffed.sniffedContentType,
    byte_size: input.bytes.byteLength,
    duration_ms: durationMs,
  };
  // Count + insert under a per-owner advisory lock (closes the parallel-upload race past the cap).
  const claimed = await admin.rpc("create_studio_sample_capped", {
    p_owner: context.userId,
    p_cap: effectiveSampleCap(input.cap),
    p_id: sampleId,
    p_title: base.title,
    p_kind: base.kind,
    p_instrument: base.instrument,
    p_object_key: base.object_key,
    p_content_type: base.content_type,
    p_byte_size: base.byte_size,
    p_duration_ms: base.duration_ms,
    p_lab: lab,
  });
  let data: unknown = Array.isArray(claimed.data) ? claimed.data[0] : claimed.data;
  let error: { message?: string; code?: string } | null = claimed.error;
  if (isMissingRpcFunction(error)) {
    // Migration 20261121150000 not applied yet: previous (non-atomic) insert; the count gate above still applies.
    const legacy = await admin
      .from(STUDIO_SAMPLES_TABLE)
      .insert({ ...base, ...(lab ?? {}) })
      .select(SELECT_ROW)
      .single();
    data = legacy.data;
    error = legacy.error;
  }
  if (error || !data) {
    await admin.storage.from(BEAT_AUDIO_BUCKET).remove([objectKey]);
    if (error && /SAMPLE_CAP_REACHED/.test(error.message ?? "")) {
      return { ok: false, error: SAMPLE_CAP, details: ["sample count cap reached"] };
    }
    if (isMissingRelation(error)) {
      return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
    }
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["sample row was not saved"] };
  }
  const [created] = await attachLabMeta(admin, [toDto(data as SampleRow, context.userId)]);
  return { ok: true, sample: created };
}

export async function deleteStudioSample(
  context: AuthContext,
  sampleId: string,
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<SampleSuccess<{ deleted: true }> | SampleFailure> {
  if (!isSampleUuid(sampleId)) return { ok: false, error: SAMPLE_NOT_FOUND };
  const row = await loadOwnedOrPublic(admin, sampleId);
  if (row === "missing") return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  if (!row) return { ok: false, error: SAMPLE_NOT_FOUND };
  const gate = evaluateSampleDelete({
    status: row.status,
    owner: row.owner_id === context.userId,
  });
  if (!gate.ok) return gate;
  const { error } = await admin.from(STUDIO_SAMPLES_TABLE).delete().eq("id", row.id);
  if (error) return { ok: false, error: SAMPLE_COPY_FAILED };
  await admin.storage.from(BEAT_AUDIO_BUCKET).remove([row.object_key]);
  return { ok: true, deleted: true };
}

export async function submitStudioSample(
  context: AuthContext,
  sampleId: string,
  /** Sending means "put it in the catalogue" unless the author says otherwise. */
  wishes: ConsentPatch = {},
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<SampleSuccess<{ sample: StudioSampleDto }> | SampleFailure> {
  if (!isSampleUuid(sampleId)) return { ok: false, error: SAMPLE_NOT_FOUND };
  const row = await loadOwnedOrPublic(admin, sampleId);
  if (row === "missing") return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  if (!row) return { ok: false, error: SAMPLE_NOT_FOUND };
  const gate = evaluateSampleSubmit({
    status: row.status,
    rightsAccepted: row.rights_accepted === true,
    owner: row.owner_id === context.userId,
  });
  if (!gate.ok) return gate;
  const consents = applyConsentPatch(consentsFromRow(row, true), wishes);
  const { data, error } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .update({
      status: "PENDING_REVIEW",
      moderation_note: null,
      ...consentColumns(consents),
      public_listing: consents.listed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("owner_id", context.userId)
    .select(SELECT_ROW)
    .single();
  if (error || !data) return { ok: false, error: SAMPLE_COPY_FAILED };
  return { ok: true, sample: toDto(data as SampleRow, context.userId) };
}

/**
 * Author switches: catalogue, ratings, comments, ranking. Works before and after review (the choice
 * made while waiting decides whether the approved sample enters the catalogue). Does not skip review.
 */
export async function updateStudioSampleShare(
  context: AuthContext,
  sampleId: string,
  input: ConsentPatch,
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<SampleSuccess<{ sample: StudioSampleDto }> | SampleFailure> {
  if (!isSampleUuid(sampleId)) return { ok: false, error: SAMPLE_NOT_FOUND };
  if (!CONSENT_KEYS.some((key) => typeof input[key] === "boolean")) {
    return { ok: false, error: SAMPLE_INVALID, details: ["share flag is required"] };
  }
  const row = await loadOwnedOrPublic(admin, sampleId);
  if (row === "missing") return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  if (!row) return { ok: false, error: SAMPLE_NOT_FOUND };
  if (row.owner_id !== context.userId) return { ok: false, error: SAMPLE_FORBIDDEN };
  if (row.status !== "PUBLISHED" && row.status !== "PENDING_REVIEW") {
    return { ok: false, error: SAMPLE_INVALID, details: ["send the sample to review first"] };
  }
  const consents = applyConsentPatch(consentsFromRow(row, row.public_listing === true), input);
  const updated = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .update({ ...consentColumns(consents), public_listing: consents.listed, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("owner_id", context.userId)
    .eq("status", row.status);
  if (updated.error) return { ok: false, error: SAMPLE_COPY_FAILED };
  const saved: SampleRow = { ...row, ...consentColumns(consents), public_listing: consents.listed };
  return { ok: true, sample: toDto(saved, context.userId) };
}

/** Someone else's sample is usable only while its author keeps it in the catalogue. */
function sampleOpenToOthers(row: SampleRow): boolean {
  return row.status === "PUBLISHED" && row.catalog_asset_id != null && row.public_listing !== false;
}

/**
 * Guard for a copy by catalogue asset id: an asset of a sample its author took out of the
 * catalogue is not handed to others. Copies already placed in projects are separate files.
 */
export async function catalogAssetOpenTo(
  userId: string,
  catalogAssetId: string,
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<boolean> {
  if (!isSampleUuid(catalogAssetId)) return true; // the copy service rejects a malformed id itself
  const { data, error } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select(SELECT_ROW)
    .eq("catalog_asset_id", catalogAssetId)
    .maybeSingle();
  if (error) return false;
  if (!data) return true;
  const row = data as SampleRow;
  return row.owner_id === userId || sampleOpenToOthers(row);
}

export async function signStudioSamplePlayback(
  actor: { userId: string; moderator: boolean },
  sampleId: string,
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<SampleSuccess<{ url: string }> | SampleFailure> {
  if (!isSampleUuid(sampleId)) return { ok: false, error: SAMPLE_NOT_FOUND };
  const row = await loadOwnedOrPublic(admin, sampleId);
  if (row === "missing") return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  if (!row) return { ok: false, error: SAMPLE_NOT_FOUND };
  const allowed =
    row.owner_id === actor.userId ||
    actor.moderator ||
    sampleOpenToOthers(row);
  if (!allowed) return { ok: false, error: SAMPLE_FORBIDDEN };
  if (!sampleObjectKeyMatches(row.id, row.object_key)) {
    return { ok: false, error: SAMPLE_INVALID, details: ["sample object key is not canonical"] };
  }
  const signed = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .createSignedUrl(row.object_key, 60);
  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["playback url was not signed"] };
  }
  return { ok: true, url: signed.data.signedUrl };
}

async function abortClaimedTake(
  admin: AdminClient,
  takeId: string,
  objectKey: string | null,
  reason: string,
): Promise<void> {
  await admin
    .from("takes")
    .update({ status: "FAILED", failure_reason: reason })
    .eq("id", takeId)
    .eq("status", "PENDING_UPLOAD");
  if (objectKey) {
    await admin.storage.from(TAKE_AUDIO_BUCKET).remove([objectKey]);
  }
}

export async function copyStudioSampleToTake(
  context: AuthContext,
  input: { sampleId: string; projectId: string },
  injected?: {
    admin?: AdminClient;
    createTakeSession?: typeof createTakeRecordingSessionFor;
    finalizeTake?: typeof finalizeTakeRecordingFor;
    copyCatalog?: typeof executeCatalogAssetCopyFor;
  },
): Promise<
  SampleSuccess<{ takeId: string; beatId: string; reusedExisting: boolean }> | SampleFailure
> {
  const admin = injected?.admin ?? createSupabaseAdminClient();
  const createTakeSession = injected?.createTakeSession ?? createTakeRecordingSessionFor;
  const finalizeTake = injected?.finalizeTake ?? finalizeTakeRecordingFor;
  const copyCatalog = injected?.copyCatalog ?? executeCatalogAssetCopyFor;
  if (!isSampleUuid(input.sampleId) || !isSampleUuid(input.projectId)) {
    return { ok: false, error: SAMPLE_NOT_FOUND };
  }
  const row = await loadOwnedOrPublic(admin, input.sampleId);
  if (row === "missing") return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  if (!row) return { ok: false, error: SAMPLE_NOT_FOUND };

  if (row.status === "PUBLISHED" && row.catalog_asset_id) {
    if (row.owner_id !== context.userId && !sampleOpenToOthers(row)) {
      return { ok: false, error: SAMPLE_FORBIDDEN, details: ["sample left the catalogue"] };
    }
    const copied = await copyCatalog(context, {
      catalogAssetId: row.catalog_asset_id,
      projectId: input.projectId,
    });
    if (!copied.ok) return { ok: false, error: copied.error, details: copied.details };
    return {
      ok: true,
      takeId: copied.takeId,
      beatId: copied.beatId,
      reusedExisting: copied.reusedExisting,
    };
  }
  if (row.owner_id !== context.userId) {
    return { ok: false, error: SAMPLE_FORBIDDEN, details: ["unpublished sample is private"] };
  }
  if (!sampleObjectKeyMatches(row.id, row.object_key)) {
    return { ok: false, error: SAMPLE_INVALID, details: ["sample object key is not canonical"] };
  }

  const { data: project, error: projectError } = await admin
    .from("studio_projects")
    .select("id, owner_id, beat_id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (projectError || !project) {
    return { ok: false, error: SAMPLE_NOT_FOUND, details: ["studio project not found"] };
  }
  if ((project.owner_id as string) !== context.userId) {
    return { ok: false, error: SAMPLE_FORBIDDEN };
  }
  const beatId = project.beat_id as string | null;
  if (!beatId) return { ok: false, error: SAMPLE_PROJECT_NO_BEAT };

  const downloaded = await admin.storage.from(BEAT_AUDIO_BUCKET).download(row.object_key);
  if (downloaded.error || !downloaded.data) {
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["sample audio is missing"] };
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  if (bytes.byteLength !== Number(row.byte_size)) {
    return { ok: false, error: SAMPLE_INVALID, details: ["sample byte size does not match"] };
  }

  const title = sampleCopyTakeTitle(row.id);
  const { data: existingRows, error: existingError } = await admin
    .from("takes")
    .select("id, status, object_key")
    .eq("owner_id", context.userId)
    .eq("title", title)
    .eq("beat_id", beatId)
    .is("deleted_at", null);
  if (existingError) return { ok: false, error: SAMPLE_COPY_FAILED };
  const existingReady = (existingRows ?? []).find((item) => item.status === "READY");
  if (existingReady) {
    const objectKey = existingReady.object_key as string;
    const present = await admin.storage.from(TAKE_AUDIO_BUCKET).download(objectKey);
    if (
      present.data &&
      !present.error &&
      expectedUserTakeObjectKey({
        ownerId: context.userId,
        takeId: existingReady.id as string,
        objectKey,
      })
    ) {
      return {
        ok: true,
        takeId: existingReady.id as string,
        beatId,
        reusedExisting: true,
      };
    }
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["existing take audio is missing"] };
  }

  let session;
  try {
    session = await createTakeSession(context, {
      beatId,
      contentType: row.content_type,
      byteSize: bytes.byteLength,
    });
  } catch (error) {
    return mapThrown(error);
  }
  if (
    !expectedUserTakeObjectKey({
      ownerId: context.userId,
      takeId: session.takeId,
      objectKey: session.objectKey,
    })
  ) {
    await abortClaimedTake(admin, session.takeId, session.objectKey, "SAMPLE_COPY_KEY");
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["take key is not canonical"] };
  }
  const stamped = await admin
    .from("takes")
    .update({ recording_mode: "QUICK", title })
    .eq("id", session.takeId)
    .eq("status", "PENDING_UPLOAD");
  if (stamped.error) {
    await abortClaimedTake(admin, session.takeId, session.objectKey, "SAMPLE_COPY_STAMP");
    return { ok: false, error: SAMPLE_COPY_FAILED };
  }
  const uploaded = await admin.storage.from(TAKE_AUDIO_BUCKET).upload(session.objectKey, bytes, {
    contentType: row.content_type,
    upsert: false,
  });
  if (uploaded.error) {
    await abortClaimedTake(admin, session.takeId, session.objectKey, "SAMPLE_COPY_UPLOAD");
    return { ok: false, error: SAMPLE_COPY_FAILED };
  }
  try {
    const finalized = await finalizeTake(context, { takeId: session.takeId });
    if (finalized.status !== "READY") {
      await abortClaimedTake(admin, session.takeId, session.objectKey, "SAMPLE_COPY_FINALIZE");
      return { ok: false, error: SAMPLE_COPY_FAILED };
    }
    return {
      ok: true,
      takeId: finalized.takeId,
      beatId: finalized.beatId,
      reusedExisting: false,
    };
  } catch (error) {
    await abortClaimedTake(admin, session.takeId, session.objectKey, "SAMPLE_COPY_FINALIZE");
    return mapThrown(error);
  }
}

export async function reviewStudioSample(
  reviewer: AuthContext,
  input: { sampleId: string; action: "approve" | "reject"; note: string | null },
  injected?: {
    admin?: AdminClient;
    catalogAssetId?: string;
  },
): Promise<SampleSuccess<{ status: SampleStatus; catalogAssetId: string | null }> | SampleFailure> {
  const admin = injected?.admin ?? createSupabaseAdminClient();
  if (!isSampleUuid(input.sampleId)) return { ok: false, error: SAMPLE_NOT_FOUND };
  const row = await loadOwnedOrPublic(admin, input.sampleId);
  if (row === "missing") return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  if (!row) return { ok: false, error: SAMPLE_NOT_FOUND };
  const gate = evaluateSampleReview({
    status: row.status,
    rightsAccepted: row.rights_accepted === true,
    action: input.action,
  });
  if (!gate.ok) return gate;
  const note = normalizeSampleNote(input.note);

  if (input.action === "reject") {
    const { error } = await admin
      .from(STUDIO_SAMPLES_TABLE)
      .update({
        status: "REJECTED",
        moderation_note: note,
        reviewed_by: reviewer.userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "PENDING_REVIEW");
    if (error) return { ok: false, error: SAMPLE_COPY_FAILED };
    return { ok: true, status: "REJECTED", catalogAssetId: null };
  }

  if (!sampleObjectKeyMatches(row.id, row.object_key)) {
    return { ok: false, error: SAMPLE_INVALID, details: ["sample object key is not canonical"] };
  }
  const downloaded = await admin.storage.from(BEAT_AUDIO_BUCKET).download(row.object_key);
  if (downloaded.error || !downloaded.data) {
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["sample audio is missing"] };
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  if (bytes.byteLength !== Number(row.byte_size)) {
    return { ok: false, error: SAMPLE_INVALID, details: ["sample byte size does not match"] };
  }
  const sniffed = validateCatalogOriginalContentSniff({
    bytes,
    declaredContentType: row.content_type,
  });
  if (!sniffed.ok) return { ok: false, error: SAMPLE_INVALID, details: sniffed.details };

  const catalogAssetId = (injected?.catalogAssetId ?? crypto.randomUUID()).toLowerCase();
  const catalogKey = buildCatalogOriginalObjectKey(catalogAssetId);
  const uploaded = await admin.storage.from(BEAT_AUDIO_BUCKET).upload(catalogKey, bytes, {
    contentType: sniffed.sniffedContentType,
    upsert: false,
  });
  if (uploaded.error) {
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["catalog upload failed"] };
  }
  const inserted = await admin.from("catalog_assets").insert({
    id: catalogAssetId,
    publish_state: "PUBLISHED",
    license_allows_copy: true,
    license_allows_export: false,
    object_key: catalogKey,
    content_type: sniffed.sniffedContentType,
    byte_size: bytes.byteLength,
    duration_seconds: catalogDurationSeconds(Number(row.duration_ms)),
  });
  if (inserted.error) {
    await admin.storage.from(BEAT_AUDIO_BUCKET).remove([catalogKey]);
    if (isMissingRelation(inserted.error)) {
      return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
    }
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["catalog row was not saved"] };
  }
  const publishedAt = new Date().toISOString();
  const publishedPatch = {
    status: "PUBLISHED",
    catalog_asset_id: catalogAssetId,
    // public_listing is the author's choice made when sending (or changed while waiting).
    moderation_note: note,
    reviewed_by: reviewer.userId,
    reviewed_at: publishedAt,
    updated_at: publishedAt,
  };
  const updated = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .update(publishedPatch)
    .eq("id", row.id)
    .eq("status", "PENDING_REVIEW");
  if (updated.error) {
    await admin.from("catalog_assets").delete().eq("id", catalogAssetId);
    await admin.storage.from(BEAT_AUDIO_BUCKET).remove([catalogKey]);
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["sample was not marked published"] };
  }
  return { ok: true, status: "PUBLISHED", catalogAssetId };
}

/**
 * Download/export guard for takes: a private copy of SOMEONE ELSE'S catalog sample
 * (title "smp:<id>") may be played and mixed in a project, but never handed out as a file.
 * Copies of the user's own samples stay downloadable.
 */
export async function assertTakeIsNotForeignSampleCopy(
  takeId: string,
  userId: string,
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<void> {
  const { data: take } = await admin.from("takes").select("title, owner_id").eq("id", takeId).maybeSingle();
  const title = (take as { title?: string | null } | null)?.title;
  const sampleId = parseSampleCopyTakeTitle(title);
  if (sampleId) {
    const { data: sample } = await admin.from(STUDIO_SAMPLES_TABLE).select("owner_id").eq("id", sampleId).maybeSingle();
    if (sample && (sample as { owner_id: string }).owner_id === userId) return;
    throw new AuthError("FORBIDDEN", SAMPLE_DOWNLOAD_BLOCKED);
  }
  // A published catalog sample is copied as "catalog:<asset>:<project>": same rule.
  const catalog = parseCatalogCopyTakeTitle(title);
  if (!catalog) return;
  const { data: published } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select("owner_id")
    .eq("catalog_asset_id", catalog.catalogAssetId)
    .maybeSingle();
  if (!published || (published as { owner_id: string }).owner_id === userId) return;
  throw new AuthError("FORBIDDEN", SAMPLE_DOWNLOAD_BLOCKED);
}

/**
 * Bytes of a sample for in-page listening (no storage URL leaves the server).
 * Owner, moderator or a PUBLISHED sample only.
 */
export async function readStudioSampleForListening(
  actor: { userId: string; moderator: boolean },
  sampleId: string,
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<SampleSuccess<{ bytes: Uint8Array; contentType: string }> | SampleFailure> {
  if (!isSampleUuid(sampleId)) return { ok: false, error: SAMPLE_NOT_FOUND };
  const row = await loadOwnedOrPublic(admin, sampleId);
  if (row === "missing") return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  if (!row) return { ok: false, error: SAMPLE_NOT_FOUND };
  const allowed =
    row.owner_id === actor.userId || actor.moderator || (row.status === "PUBLISHED" && row.catalog_asset_id != null);
  if (!allowed) return { ok: false, error: SAMPLE_FORBIDDEN };
  if (!sampleObjectKeyMatches(row.id, row.object_key)) return { ok: false, error: SAMPLE_INVALID };
  const file = await admin.storage.from(BEAT_AUDIO_BUCKET).download(row.object_key);
  if (file.error || !file.data) return { ok: false, error: SAMPLE_COPY_FAILED };
  return { ok: true, bytes: new Uint8Array(await file.data.arrayBuffer()), contentType: row.content_type };
}
