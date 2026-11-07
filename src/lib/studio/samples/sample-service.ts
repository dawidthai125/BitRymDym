import "server-only";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  BEAT_AUDIO_BUCKET,
  buildCatalogOriginalObjectKey,
  validateCatalogOriginalContentSniff,
} from "@/lib/beats/audio-validation";
import { probeAudioDurationFromBytes } from "@/lib/beats/audio-duration";
import { executeCatalogAssetCopyFor } from "@/lib/catalog/catalog-copy-service";
import { TakeClaimError } from "@/lib/takes/claim-errors";
import { expectedUserTakeObjectKey } from "@/lib/takes/object-key";
import {
  createTakeRecordingSessionFor,
  finalizeTakeRecordingFor,
} from "@/lib/takes/take-transport";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  SAMPLE_COPY_FAILED,
  SAMPLE_FORBIDDEN,
  SAMPLE_INVALID,
  SAMPLE_NOT_FOUND,
  SAMPLE_PROJECT_NO_BEAT,
  SAMPLE_SHARE_OFF,
  SAMPLE_TABLE_UNAVAILABLE,
  STUDIO_SAMPLES_TABLE,
  buildUserSampleObjectKey,
  catalogDurationSeconds,
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
  type SampleKind,
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
  /** Null until the share columns exist. */
  publicListing: boolean | null;
  allowComments: boolean | null;
  shareReady: boolean;
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
};

export type SampleFailure = { ok: false; error: string; details?: string[] };
export type SampleSuccess<T> = { ok: true } & T;

const SELECT_ROW =
  "id, owner_id, title, kind, instrument, status, rights_accepted, object_key, content_type, byte_size, duration_ms, catalog_asset_id, moderation_note";

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
    publicListing: null,
    allowComments: null,
    shareReady: false,
  };
}

function shareColumnMissing(error: { message?: string } | null, column: string): boolean {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes(column) &&
    (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find"))
  );
}

async function attachShareFlags(admin: AdminClient, samples: StudioSampleDto[]): Promise<StudioSampleDto[]> {
  if (samples.length === 0) return samples;
  const loaded = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select("id, public_listing, allow_comments")
    .in("id", samples.map((sample) => sample.id));
  if (loaded.error) return samples;
  const flags = new Map(
    ((loaded.data ?? []) as Array<{ id: string; public_listing?: boolean; allow_comments?: boolean }>).map((row) => [row.id, row]),
  );
  return samples.map((sample) => {
    const flag = flags.get(sample.id);
    return {
      ...sample,
      shareReady: true,
      publicListing: flag?.public_listing === true,
      allowComments: flag ? flag.allow_comments !== false : true,
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
    samples: await attachShareFlags(admin, ((data ?? []) as SampleRow[]).map((row) => toDto(row, context.userId))),
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
    .order("created_at", { ascending: false })
    .limit(80);
  if (error && isMissingRelation(error)) {
    return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  }
  if (error) return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  return {
    ok: true,
    samples: await attachShareFlags(admin, ((data ?? []) as SampleRow[]).map((row) => toDto(row, context.userId))),
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

  const { data, error } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .insert({
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
    })
    .select(SELECT_ROW)
    .single();
  if (error) {
    await admin.storage.from(BEAT_AUDIO_BUCKET).remove([objectKey]);
    if (isMissingRelation(error)) {
      return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
    }
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["sample row was not saved"] };
  }
  return { ok: true, sample: toDto(data as SampleRow, context.userId) };
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
  const { data, error } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .update({
      status: "PENDING_REVIEW",
      moderation_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("owner_id", context.userId)
    .select(SELECT_ROW)
    .single();
  if (error || !data) return { ok: false, error: SAMPLE_COPY_FAILED };
  return { ok: true, sample: toDto(data as SampleRow, context.userId) };
}

/** Author switch after moderation. Does not skip review. */
export async function updateStudioSampleShare(
  context: AuthContext,
  sampleId: string,
  input: { publicListing?: boolean; allowComments?: boolean },
  admin: AdminClient = createSupabaseAdminClient(),
): Promise<SampleSuccess<{ sample: StudioSampleDto }> | SampleFailure> {
  if (!isSampleUuid(sampleId)) return { ok: false, error: SAMPLE_NOT_FOUND };
  const listing = input.publicListing;
  const comments = input.allowComments;
  if (typeof listing !== "boolean" && typeof comments !== "boolean") {
    return { ok: false, error: SAMPLE_INVALID, details: ["share flag is required"] };
  }
  const row = await loadOwnedOrPublic(admin, sampleId);
  if (row === "missing") return { ok: false, error: SAMPLE_TABLE_UNAVAILABLE };
  if (!row) return { ok: false, error: SAMPLE_NOT_FOUND };
  if (row.owner_id !== context.userId) return { ok: false, error: SAMPLE_FORBIDDEN };
  if (row.status !== "PUBLISHED") {
    return { ok: false, error: SAMPLE_INVALID, details: ["public listing starts after moderation"] };
  }
  const patch: Record<string, boolean | string> = { updated_at: new Date().toISOString() };
  if (typeof listing === "boolean") patch.public_listing = listing;
  if (typeof comments === "boolean") patch.allow_comments = comments;
  const updated = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .update(patch)
    .eq("id", row.id)
    .eq("owner_id", context.userId)
    .eq("status", "PUBLISHED");
  if (
    updated.error &&
    (shareColumnMissing(updated.error, "public_listing") || shareColumnMissing(updated.error, "allow_comments"))
  ) {
    return { ok: false, error: SAMPLE_SHARE_OFF };
  }
  if (updated.error) return { ok: false, error: SAMPLE_COPY_FAILED };
  const [sample] = await attachShareFlags(admin, [toDto(row, context.userId)]);
  return { ok: true, sample: sample ?? toDto(row, context.userId) };
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
    (row.status === "PUBLISHED" && row.catalog_asset_id != null);
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
    public_listing: true,
    moderation_note: note,
    reviewed_by: reviewer.userId,
    reviewed_at: publishedAt,
    updated_at: publishedAt,
  };
  let updated = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .update(publishedPatch)
    .eq("id", row.id)
    .eq("status", "PENDING_REVIEW");
  if (updated.error && shareColumnMissing(updated.error, "public_listing")) {
    updated = await admin
      .from(STUDIO_SAMPLES_TABLE)
      .update({
        status: publishedPatch.status,
        catalog_asset_id: publishedPatch.catalog_asset_id,
        moderation_note: publishedPatch.moderation_note,
        reviewed_by: publishedPatch.reviewed_by,
        reviewed_at: publishedPatch.reviewed_at,
        updated_at: publishedPatch.updated_at,
      })
      .eq("id", row.id)
      .eq("status", "PENDING_REVIEW");
  }
  if (updated.error) {
    await admin.from("catalog_assets").delete().eq("id", catalogAssetId);
    await admin.storage.from(BEAT_AUDIO_BUCKET).remove([catalogKey]);
    return { ok: false, error: SAMPLE_COPY_FAILED, details: ["sample was not marked published"] };
  }
  return { ok: true, status: "PUBLISHED", catalogAssetId };
}
