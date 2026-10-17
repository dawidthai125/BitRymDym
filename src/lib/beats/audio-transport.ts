import "server-only";

import { createHash, randomUUID } from "crypto";

import type { Beat, BeatAudioAsset, BeatAudioPurpose } from "@/types/domain";
import type { AuthContext } from "@/lib/auth/types";
import {
  AuthError,
  requirePermission,
  requireUser,
} from "@/lib/auth/session";
import {
  analyzeBeatAudioBytes,
  probeAudioDurationFromBytes,
  type AnalyzedBeatBpm,
} from "@/lib/beats/audio-duration";
import {
  buildBpmUncertaintyEnvelopeFromProbe,
  resolveCreateBpm,
  type BpmSelectionMode,
  type BpmUncertaintyEnvelope,
} from "@/lib/beats/bpm-uncertainty";
import {
  BEAT_AUDIO_ASSET_SELECT,
  mapBeatAudioAssetRow,
  type BeatAudioAssetRow,
} from "@/lib/beats/audio-types";
import {
  BEAT_AUDIO_BUCKET,
  BEAT_AUDIO_MAX_BYTES,
  buildBeatAudioObjectKey,
  buildUserBeatAudioObjectKey,
  isUuid,
  resolveAudioContentType,
  validateAudioUploadMeta,
} from "@/lib/beats/audio-validation";
import { suggestTitleFromFilename } from "@/lib/beats/filename-title";
import { BeatRequestError } from "@/lib/beats/request-error";
import { createPlatformBeat } from "@/lib/beats/service";
import {
  assertUserAssetBinding,
  assertUserDraftTransportAccess,
  rejectClientChosenStorageParams,
  UserAudioAuthzError,
} from "@/lib/beats/user-audio-authz";
import {
  validateBeatInput,
  type BeatInput,
  type NormalizedBeatInput,
} from "@/lib/beats/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Placeholder until analyze/finalize overwrite. Never leave after successful finalize. */
export const PROVISIONAL_DRAFT_BPM = 1;
export const PROVISIONAL_DRAFT_DURATION_SECONDS = 1;

export type SignedUploadSession = {
  beatId: string;
  assetId: string;
  objectKey: string;
  path: string;
  token: string;
  signedUrl: string;
  titleSuggestion: string;
  contentType: string;
  declaredByteSize: number;
};

export type TransportAnalyzeResult = {
  beatId: string;
  assetId: string;
  durationSeconds: number;
  byteSize: number;
  contentType: string;
  titleSuggestion: string;
  bpmDecision: "AUTO_SUGGEST" | "MANUAL_REQUIRED";
  bpm: number | null;
  bpmReason?: string;
  bpmMessage?: string;
  /** Server uncertainty envelope — candidates / hypotheses / allowlist. */
  bpmEnvelope: BpmUncertaintyEnvelope;
};

async function requireAdminCreate() {
  const context = await requirePermission("beats.create");
  if (context.profile.role !== "ADMIN") {
    throw new AuthError("FORBIDDEN", "Only ADMIN may create PLATFORM beats.");
  }
  return context;
}

async function requireAdminEdit() {
  const context = await requirePermission("beats.edit");
  if (context.profile.role !== "ADMIN") {
    throw new AuthError("FORBIDDEN", "Only ADMIN may upload PLATFORM audio.");
  }
  return context;
}

async function loadPlatformBeatOrThrow(beatId: string) {
  if (!isUuid(beatId)) throw new AuthError("NOT_FOUND", "Beat not found.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beats")
    .select("id, ownership_type, status")
    .eq("id", beatId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Beat not found.");
  if (data.ownership_type !== "PLATFORM") {
    throw new AuthError(
      "FORBIDDEN",
      "Phase 1.5 audio is only allowed for PLATFORM beats.",
    );
  }
  return data;
}

async function loadAssetOrThrow(assetId: string): Promise<BeatAudioAssetRow> {
  if (!isUuid(assetId)) {
    throw new AuthError("NOT_FOUND", "Audio asset not found.");
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_audio_assets")
    .select(BEAT_AUDIO_ASSET_SELECT)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Audio asset not found.");
  return data as BeatAudioAssetRow;
}

export async function downloadBeatAudioObjectBytes(
  objectKey: string,
): Promise<Uint8Array> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .download(objectKey);
  if (error || !data) {
    throw new Error(error?.message ?? "Nie udało się odczytać pliku audio.");
  }
  const buf = Buffer.from(await data.arrayBuffer());
  return new Uint8Array(buf);
}

/**
 * Best effort on an error path: callers always rethrow the original error, so
 * a failure here is logged instead of replacing it. Only a PENDING_UPLOAD
 * asset may become FAILED (never an active / READY / REPLACED one).
 */
async function markAssetFailed(assetId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("beat_audio_assets")
    .update({ status: "FAILED", is_active: false })
    .eq("id", assetId)
    .eq("status", "PENDING_UPLOAD");
  if (error) {
    console.error("[beats/audio-transport] markAssetFailed failed", {
      assetId,
      error: error.message,
    });
  }
}

const NOT_PENDING_MASTER = "Asset is not a pending MASTER upload.";
const ACTIVE_AUDIO_CHANGED = "Active audio changed during the update. Try again.";
const BEAT_CHANGED = "Beat changed during the update. Reload and try again.";

/** Only the PENDING_UPLOAD MASTER of an upload session may be analyzed. */
function assertPendingMasterUpload(asset: BeatAudioAssetRow): void {
  if (asset.purpose !== "MASTER" || asset.status !== "PENDING_UPLOAD") {
    throw new BeatRequestError(NOT_PENDING_MASTER, "CONFLICT");
  }
}

/**
 * Finalize accepts a pending MASTER, or the active READY MASTER so that a retry
 * after a lost response reaches the RPC, which answers it as an idempotent
 * replay only when the request matches what was committed.
 */
function assertFinalizableMasterAsset(asset: BeatAudioAssetRow): void {
  const replayCandidate = asset.status === "READY" && asset.is_active;
  if (asset.purpose !== "MASTER" || (asset.status !== "PENDING_UPLOAD" && !replayCandidate)) {
    throw new BeatRequestError(NOT_PENDING_MASTER, "CONFLICT");
  }
}

/** Beat columns committed together with the MASTER they describe. */
type FinalizeBeatMetadata = Omit<
  NormalizedBeatInput,
  "ownershipType" | "ownerId" | "status"
>;

function validateFinalizeMetadata(
  input: Omit<BeatInput, "status">,
): FinalizeBeatMetadata {
  // Metadata rules do not depend on status; "DRAFT" only satisfies the
  // create-time rule for USER beats.
  const validated = validateBeatInput({ ...input, status: "DRAFT" });
  if (!validated.ok) {
    throw new BeatRequestError(validated.errors.join("; "));
  }
  const value = validated.value;
  return {
    title: value.title,
    producer: value.producer,
    description: value.description,
    genre: value.genre,
    style: value.style,
    bpm: value.bpm,
    key: value.key,
    scale: value.scale,
    durationSeconds: value.durationSeconds,
    tags: value.tags,
    coverRef: value.coverRef,
  };
}

const FINALIZE_RPC_ERRORS: Record<string, () => Error> = {
  BEAT_NOT_FOUND: () => new AuthError("NOT_FOUND", "Beat not found."),
  ASSET_NOT_FOUND: () => new AuthError("NOT_FOUND", "Audio asset not found."),
  ASSET_BEAT_MISMATCH: () =>
    new AuthError("FORBIDDEN", "Asset does not belong to beat."),
  BEAT_CHANGED: () => new AuthError("CONFLICT", BEAT_CHANGED),
  NOT_PENDING_MASTER: () => new BeatRequestError(NOT_PENDING_MASTER, "CONFLICT"),
  ALREADY_FINALIZED: () => new BeatRequestError(NOT_PENDING_MASTER, "CONFLICT"),
  ACTIVE_AUDIO_CHANGED: () =>
    new BeatRequestError(ACTIVE_AUDIO_CHANGED, "CONFLICT"),
};

type FinalizeRpcResult = {
  beat_id: string;
  asset: BeatAudioAssetRow;
  replaced_asset_id: string | null;
  idempotent_replay: boolean;
};

/**
 * Activate a pending MASTER in one database transaction
 * (`finalize_beat_master_asset`): the previous active MASTER becomes REPLACED,
 * the asset becomes READY + active and the beat gets `durationSeconds` plus,
 * when given, the full metadata of this upload — all or nothing. Callers
 * authorize first; the RPC re-checks beat ownership / status and asset state
 * under row locks. Domain refusals are AuthError / CONFLICT; anything else
 * (connection, permission, constraint) is an unexpected error.
 */
async function finalizeMasterAssetAtomically(params: {
  beatId: string;
  assetId: string;
  ownershipType: Beat["ownershipType"];
  ownerId: string | null;
  contentType: string;
  byteSize: number;
  checksum: string;
  durationSeconds: number;
  metadata: FinalizeBeatMetadata | null;
}): Promise<BeatAudioAsset> {
  const admin = createSupabaseAdminClient();
  const metadata = params.metadata;
  const { data, error } = await admin.rpc("finalize_beat_master_asset", {
    p_beat_id: params.beatId,
    p_asset_id: params.assetId,
    p_ownership_type: params.ownershipType,
    p_owner_id: params.ownerId,
    p_content_type: params.contentType,
    p_byte_size: params.byteSize,
    p_checksum_sha256: params.checksum,
    p_duration_seconds: params.durationSeconds,
    p_apply_metadata: metadata !== null,
    p_title: metadata?.title ?? null,
    p_producer: metadata?.producer ?? null,
    p_description: metadata?.description ?? null,
    p_genre: metadata?.genre ?? null,
    p_style: metadata?.style ?? null,
    p_bpm: metadata?.bpm ?? null,
    p_key: metadata?.key ?? null,
    p_scale: metadata?.scale ?? null,
    p_tags: metadata?.tags ?? null,
    p_cover_ref: metadata?.coverRef ?? null,
  });

  if (error) {
    const domainError =
      error.code === "P0001" ? FINALIZE_RPC_ERRORS[error.message] : undefined;
    if (domainError) throw domainError();
    throw new Error(error.message);
  }
  const result = data as FinalizeRpcResult | null;
  if (!result?.asset || result.asset.id !== params.assetId) {
    throw new Error("finalize_beat_master_asset returned no asset.");
  }
  return mapBeatAudioAssetRow(result.asset);
}

function mapBpmForClient(
  bpm: AnalyzedBeatBpm,
  envelope: BpmUncertaintyEnvelope,
): {
  bpmDecision: "AUTO_SUGGEST" | "MANUAL_REQUIRED";
  bpm: number | null;
  bpmReason?: string;
  bpmMessage?: string;
  bpmEnvelope: BpmUncertaintyEnvelope;
} {
  if (bpm.status === "auto_suggest") {
    return {
      bpmDecision: "AUTO_SUGGEST",
      bpm: bpm.bpm,
      bpmReason: bpm.reason,
      bpmEnvelope: envelope,
    };
  }
  if (bpm.status === "manual_required") {
    return {
      bpmDecision: "MANUAL_REQUIRED",
      bpm: null,
      bpmReason: bpm.reason,
      bpmMessage: bpm.message,
      bpmEnvelope: envelope,
    };
  }
  return {
    bpmDecision: "MANUAL_REQUIRED",
    bpm: null,
    bpmReason: bpm.reason,
    bpmMessage: bpm.message,
    bpmEnvelope: envelope,
  };
}

/**
 * Create DRAFT beat + PENDING_UPLOAD asset + short-lived signed upload URL.
 * Client uploads binary via uploadToSignedUrl — no base64 Server Action.
 */
export async function createPlatformBeatSignedUploadSession(params: {
  contentType: string;
  byteSize: number;
  originalFilename?: string | null;
}): Promise<SignedUploadSession> {
  const context = await requireAdminCreate();

  const contentType =
    resolveAudioContentType({
      fileType: params.contentType,
      filename: params.originalFilename,
    }) ?? params.contentType;

  const meta = validateAudioUploadMeta({
    contentType,
    byteSize: params.byteSize,
  });
  if (!meta.ok) {
    throw new BeatRequestError(meta.errors.join("; "));
  }

  const titleSuggestion =
    suggestTitleFromFilename(params.originalFilename) || "Untitled draft";

  const beat = await createPlatformBeat({
    title: titleSuggestion,
    producer: null,
    description: null,
    genre: null,
    style: null,
    bpm: PROVISIONAL_DRAFT_BPM,
    key: null,
    scale: null,
    durationSeconds: PROVISIONAL_DRAFT_DURATION_SECONDS,
    tags: [],
    coverRef: null,
    status: "DRAFT",
  });

  const purpose: BeatAudioPurpose = "MASTER";
  const assetId = randomUUID();
  const objectKey = buildBeatAudioObjectKey({
    beatId: beat.id,
    assetId,
    purpose,
  });

  const admin = createSupabaseAdminClient();
  const { error: insertError } = await admin.from("beat_audio_assets").insert({
    id: assetId,
    beat_id: beat.id,
    purpose,
    status: "PENDING_UPLOAD",
    storage_bucket: BEAT_AUDIO_BUCKET,
    object_key: objectKey,
    content_type: contentType,
    byte_size: params.byteSize,
    checksum_sha256: null,
    original_filename: params.originalFilename ?? null,
    is_active: false,
    created_by: context.userId,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .createSignedUploadUrl(objectKey);

  if (signError || !signed) {
    await markAssetFailed(assetId);
    throw new Error(
      signError?.message ?? "Nie udało się utworzyć URL uploadu.",
    );
  }

  return {
    beatId: beat.id,
    assetId,
    objectKey,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    titleSuggestion,
    contentType,
    declaredByteSize: params.byteSize,
  };
}

/**
 * After client binary upload: download object, analyze duration+BPM and store
 * size / checksum on the pending asset. Asset stays PENDING_UPLOAD; the beat is
 * not written — its duration and metadata are committed with the MASTER at
 * finalize.
 */
export async function analyzePlatformBeatPendingUpload(params: {
  beatId: string;
  assetId: string;
}): Promise<TransportAnalyzeResult> {
  await requireAdminCreate();
  // Analyze writes the asset row (beats.edit); check it before any read or
  // write so a denial leaves no partial state.
  await requireAdminEdit();
  await loadPlatformBeatOrThrow(params.beatId);
  const asset = await loadAssetOrThrow(params.assetId);

  if (asset.beat_id !== params.beatId) {
    throw new AuthError("FORBIDDEN", "Asset does not belong to beat.");
  }
  assertPendingMasterUpload(asset);

  let bytes: Uint8Array;
  try {
    bytes = await downloadBeatAudioObjectBytes(asset.object_key);
  } catch (error) {
    await markAssetFailed(params.assetId);
    throw error instanceof Error
      ? error
      : new Error("Upload incomplete or unreadable.");
  }

  if (bytes.byteLength > BEAT_AUDIO_MAX_BYTES) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(
      `byteSize must be at most ${BEAT_AUDIO_MAX_BYTES}`,
    );
  }

  const meta = validateAudioUploadMeta({
    contentType: asset.content_type ?? "application/octet-stream",
    byteSize: bytes.byteLength,
  });
  if (!meta.ok) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(meta.errors.join("; "));
  }

  const analyzed = await analyzeBeatAudioBytes({
    bytes,
    contentType: asset.content_type ?? "audio/wav",
    originalFilename: asset.original_filename,
  });

  if (!analyzed.ok) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(analyzed.error);
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const admin = createSupabaseAdminClient();
  const { error: assetUpdateError } = await admin
    .from("beat_audio_assets")
    .update({
      byte_size: bytes.byteLength,
      checksum_sha256: checksum,
      content_type: analyzed.contentType,
    })
    .eq("id", params.assetId)
    .eq("status", "PENDING_UPLOAD");
  if (assetUpdateError) throw new Error(assetUpdateError.message);

  const bpmEnvelope = buildBpmUncertaintyEnvelopeFromProbe(analyzed.bpmProbe);
  const bpmMapped = mapBpmForClient(analyzed.bpm, bpmEnvelope);

  return {
    beatId: params.beatId,
    assetId: params.assetId,
    durationSeconds: analyzed.durationSeconds,
    byteSize: analyzed.byteSize,
    contentType: analyzed.contentType,
    titleSuggestion: analyzed.titleSuggestion,
    ...bpmMapped,
  };
}

/**
 * Finalize: BPM policy, then metadata + MASTER activation in one transaction.
 * Re-downloads audio for server revalidation (client BPM untrusted).
 */
export async function finalizePlatformBeatAfterUpload(params: {
  beatId: string;
  assetId: string;
  title: string;
  producer?: string | null;
  description?: string | null;
  genre?: string | null;
  style?: string | null;
  bpm: number;
  /** Legacy — never grants free 1–300; allowlist still enforced. */
  bpmManualOverride?: boolean;
  bpmSelectionMode?: BpmSelectionMode;
  key?: string | null;
  scale?: string | null;
  tags?: string[];
  coverRef?: string | null;
}): Promise<{ beatId: string; bpmSource?: string }> {
  await requireAdminCreate();
  // Finalize writes beat metadata (beats.edit) and may mark the asset FAILED
  // before that; check it first so a denial leaves no partial state.
  await requireAdminEdit();
  await loadPlatformBeatOrThrow(params.beatId);
  const asset = await loadAssetOrThrow(params.assetId);

  if (asset.beat_id !== params.beatId) {
    throw new AuthError("FORBIDDEN", "Asset does not belong to beat.");
  }
  assertFinalizableMasterAsset(asset);

  const bytes = await downloadBeatAudioObjectBytes(asset.object_key);
  const analyzed = await analyzeBeatAudioBytes({
    bytes,
    contentType: asset.content_type ?? "audio/wav",
    originalFilename: asset.original_filename,
  });
  if (!analyzed.ok) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(analyzed.error);
  }

  // Security boundary: rebuild envelope from bytes — never trust client candidates.
  const envelope = buildBpmUncertaintyEnvelopeFromProbe(analyzed.bpmProbe);
  const bpmResolved = resolveCreateBpm({
    clientBpm: params.bpm,
    envelope,
    selectionMode: params.bpmSelectionMode,
    bpmManualOverride: Boolean(params.bpmManualOverride),
  });
  if (!bpmResolved.ok) {
    throw new BeatRequestError(bpmResolved.error);
  }

  const metadata = validateFinalizeMetadata({
    ownershipType: "PLATFORM",
    ownerId: null,
    title: params.title,
    producer: params.producer ?? null,
    description: params.description ?? null,
    genre: params.genre ?? null,
    style: params.style ?? null,
    bpm: bpmResolved.bpm,
    key: params.key ?? null,
    scale: params.scale ?? null,
    durationSeconds: analyzed.durationSeconds,
    tags: params.tags ?? [],
    coverRef: params.coverRef ?? null,
  });

  const checksum = createHash("sha256").update(bytes).digest("hex");
  await finalizeMasterAssetAtomically({
    beatId: params.beatId,
    assetId: params.assetId,
    ownershipType: "PLATFORM",
    ownerId: null,
    contentType: analyzed.contentType,
    byteSize: bytes.byteLength,
    checksum,
    durationSeconds: metadata.durationSeconds,
    metadata,
  });

  return { beatId: params.beatId, bpmSource: bpmResolved.bpmSource };
}

/**
 * MASTER replace on existing beat: signed session (no new beat).
 */
export async function createMasterReplaceSignedUploadSession(params: {
  beatId: string;
  contentType: string;
  byteSize: number;
  originalFilename?: string | null;
}): Promise<SignedUploadSession> {
  const context = await requireAdminEdit();
  await loadPlatformBeatOrThrow(params.beatId);

  const contentType =
    resolveAudioContentType({
      fileType: params.contentType,
      filename: params.originalFilename,
    }) ?? params.contentType;

  const meta = validateAudioUploadMeta({
    contentType,
    byteSize: params.byteSize,
  });
  if (!meta.ok) {
    throw new BeatRequestError(meta.errors.join("; "));
  }

  const purpose: BeatAudioPurpose = "MASTER";
  const assetId = randomUUID();
  const objectKey = buildBeatAudioObjectKey({
    beatId: params.beatId,
    assetId,
    purpose,
  });

  const admin = createSupabaseAdminClient();
  const { error: insertError } = await admin.from("beat_audio_assets").insert({
    id: assetId,
    beat_id: params.beatId,
    purpose,
    status: "PENDING_UPLOAD",
    storage_bucket: BEAT_AUDIO_BUCKET,
    object_key: objectKey,
    content_type: contentType,
    byte_size: params.byteSize,
    checksum_sha256: null,
    original_filename: params.originalFilename ?? null,
    is_active: false,
    created_by: context.userId,
  });
  if (insertError) throw new Error(insertError.message);

  const { data: signed, error: signError } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .createSignedUploadUrl(objectKey);

  if (signError || !signed) {
    await markAssetFailed(assetId);
    throw new Error(
      signError?.message ?? "Nie udało się utworzyć URL uploadu.",
    );
  }

  return {
    beatId: params.beatId,
    assetId,
    objectKey,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    titleSuggestion: suggestTitleFromFilename(params.originalFilename) || "",
    contentType,
    declaredByteSize: params.byteSize,
  };
}

/**
 * Complete MASTER replace: validate the object, measure its duration and
 * activate it with the beat duration in one transaction. Other metadata,
 * including BPM, is kept (no BPM path here).
 */
export async function completeMasterReplaceUpload(params: {
  beatId: string;
  assetId: string;
}): Promise<BeatAudioAsset> {
  await requireAdminEdit();
  await loadPlatformBeatOrThrow(params.beatId);
  const asset = await loadAssetOrThrow(params.assetId);
  if (asset.beat_id !== params.beatId) {
    throw new AuthError("FORBIDDEN", "Asset does not belong to beat.");
  }
  assertFinalizableMasterAsset(asset);

  let bytes: Uint8Array;
  try {
    bytes = await downloadBeatAudioObjectBytes(asset.object_key);
  } catch (error) {
    await markAssetFailed(params.assetId);
    throw error instanceof Error
      ? error
      : new Error("Upload incomplete or unreadable.");
  }

  const meta = validateAudioUploadMeta({
    contentType: asset.content_type ?? "application/octet-stream",
    byteSize: bytes.byteLength,
  });
  if (!meta.ok) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(meta.errors.join("; "));
  }

  const contentType = asset.content_type ?? "audio/mpeg";
  const duration = await probeAudioDurationFromBytes({
    bytes,
    contentTypeHint: contentType,
    originalFilename: asset.original_filename,
  });
  if (!duration.ok) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(duration.error);
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  return finalizeMasterAssetAtomically({
    beatId: params.beatId,
    assetId: params.assetId,
    ownershipType: "PLATFORM",
    ownerId: null,
    contentType,
    byteSize: bytes.byteLength,
    checksum,
    durationSeconds: duration.durationSeconds,
    metadata: null,
  });
}

// ---------------------------------------------------------------------------
// Community Wave 2 — USER signed upload (reuse PLATFORM transport primitives)
// ---------------------------------------------------------------------------

async function requireUserCommunityUpload(): Promise<AuthContext> {
  const context = await requireUser();
  if (context.profile.role !== "USER") {
    throw new AuthError(
      "FORBIDDEN",
      "Community audio transport is for USER role only.",
    );
  }
  await requirePermission("beats.create");
  return context;
}

function rethrowAuthz(error: unknown): never {
  if (error instanceof UserAudioAuthzError) {
    throw new AuthError(error.code, error.message);
  }
  throw error;
}

async function loadUserOwnedDraftOrThrow(
  context: AuthContext,
  beatId: string,
): Promise<Beat> {
  if (!isUuid(beatId)) throw new AuthError("NOT_FOUND", "Beat not found.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beats")
    .select(
      "id, owner_id, ownership_type, title, producer, description, genre, style, bpm, key, scale, duration_seconds, tags, cover_ref, status, rejection_reason, created_at, updated_at",
    )
    .eq("id", beatId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Beat not found.");

  const beat: Beat = {
    id: data.id as string,
    ownerId: (data.owner_id as string | null) ?? null,
    ownershipType: data.ownership_type as Beat["ownershipType"],
    title: data.title as string,
    producer: (data.producer as string | null) ?? null,
    description: (data.description as string | null) ?? null,
    genre: (data.genre as string | null) ?? null,
    style: (data.style as string | null) ?? null,
    bpm: data.bpm as number,
    key: (data.key as string | null) ?? null,
    scale: (data.scale as string | null) ?? null,
    durationSeconds: data.duration_seconds as number,
    tags: (data.tags as string[] | null) ?? [],
    coverRef: (data.cover_ref as string | null) ?? null,
    status: data.status as Beat["status"],
    rejectionReason: (data.rejection_reason as string | null) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };

  try {
    assertUserDraftTransportAccess({ context, beat });
  } catch (error) {
    rethrowAuthz(error);
  }
  return beat;
}

/**
 * Attach PENDING_UPLOAD MASTER + signed URL to an existing USER DRAFT.
 * Replaces active MASTER on finalize (finalize_beat_master_asset → REPLACED).
 * Client must not supply objectKey / ownerId / bucket / assetId.
 */
export async function createUserBeatSignedUploadSessionFor(
  context: AuthContext,
  params: {
    beatId: string;
    contentType: string;
    byteSize: number;
    originalFilename?: string | null;
    /** Reject if client tries to spoof — must be absent. */
    objectKey?: string | null;
    ownerId?: string | null;
    bucket?: string | null;
    assetId?: string | null;
  },
): Promise<SignedUploadSession> {
  try {
    rejectClientChosenStorageParams({
      objectKey: params.objectKey,
      ownerId: params.ownerId,
      bucket: params.bucket,
      assetId: params.assetId,
    });
  } catch (error) {
    rethrowAuthz(error);
  }
  const beat = await loadUserOwnedDraftOrThrow(context, params.beatId);

  const contentType =
    resolveAudioContentType({
      fileType: params.contentType,
      filename: params.originalFilename,
    }) ?? params.contentType;

  const meta = validateAudioUploadMeta({
    contentType,
    byteSize: params.byteSize,
  });
  if (!meta.ok) {
    throw new BeatRequestError(meta.errors.join("; "));
  }

  const purpose: BeatAudioPurpose = "MASTER";
  const assetId = randomUUID();
  const objectKey = buildUserBeatAudioObjectKey({
    ownerId: context.userId,
    beatId: beat.id,
    assetId,
    purpose,
  });

  const admin = createSupabaseAdminClient();
  const { error: insertError } = await admin.from("beat_audio_assets").insert({
    id: assetId,
    beat_id: beat.id,
    purpose,
    status: "PENDING_UPLOAD",
    storage_bucket: BEAT_AUDIO_BUCKET,
    object_key: objectKey,
    content_type: contentType,
    byte_size: params.byteSize,
    checksum_sha256: null,
    original_filename: params.originalFilename ?? null,
    is_active: false,
    created_by: context.userId,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .createSignedUploadUrl(objectKey);

  if (signError || !signed) {
    await markAssetFailed(assetId);
    throw new Error(
      signError?.message ?? "Nie udało się utworzyć URL uploadu.",
    );
  }

  return {
    beatId: beat.id,
    assetId,
    objectKey,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    titleSuggestion:
      suggestTitleFromFilename(params.originalFilename) || beat.title,
    contentType,
    declaredByteSize: params.byteSize,
  };
}

export async function createUserBeatSignedUploadSession(params: {
  beatId: string;
  contentType: string;
  byteSize: number;
  originalFilename?: string | null;
  objectKey?: string | null;
  ownerId?: string | null;
  bucket?: string | null;
  assetId?: string | null;
}): Promise<SignedUploadSession> {
  const context = await requireUserCommunityUpload();
  return createUserBeatSignedUploadSessionFor(context, params);
}

export async function analyzeUserBeatPendingUploadFor(
  context: AuthContext,
  params: { beatId: string; assetId: string },
): Promise<TransportAnalyzeResult> {
  const beat = await loadUserOwnedDraftOrThrow(context, params.beatId);
  const asset = await loadAssetOrThrow(params.assetId);
  try {
    assertUserAssetBinding({
      context,
      beat,
      asset,
      beatId: params.beatId,
      assetId: params.assetId,
    });
  } catch (error) {
    rethrowAuthz(error);
  }

  assertPendingMasterUpload(asset);

  let bytes: Uint8Array;
  try {
    bytes = await downloadBeatAudioObjectBytes(asset.object_key);
  } catch (error) {
    await markAssetFailed(params.assetId);
    throw error instanceof Error
      ? error
      : new Error("Upload incomplete or unreadable.");
  }

  if (bytes.byteLength > BEAT_AUDIO_MAX_BYTES) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(
      `byteSize must be at most ${BEAT_AUDIO_MAX_BYTES}`,
    );
  }

  const meta = validateAudioUploadMeta({
    contentType: asset.content_type ?? "application/octet-stream",
    byteSize: bytes.byteLength,
  });
  if (!meta.ok) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(meta.errors.join("; "));
  }

  const analyzed = await analyzeBeatAudioBytes({
    bytes,
    contentType: asset.content_type ?? "audio/wav",
    originalFilename: asset.original_filename,
  });

  if (!analyzed.ok) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(analyzed.error);
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const admin = createSupabaseAdminClient();
  const { error: assetUpdateError } = await admin
    .from("beat_audio_assets")
    .update({
      byte_size: bytes.byteLength,
      checksum_sha256: checksum,
      content_type: analyzed.contentType,
    })
    .eq("id", params.assetId)
    .eq("status", "PENDING_UPLOAD");
  if (assetUpdateError) throw new Error(assetUpdateError.message);

  // The beat is not written here: duration and metadata are committed with the
  // MASTER at finalize, so an abandoned or replaced upload never shows up on it.
  const bpmEnvelope = buildBpmUncertaintyEnvelopeFromProbe(analyzed.bpmProbe);
  const bpmMapped = mapBpmForClient(analyzed.bpm, bpmEnvelope);

  return {
    beatId: params.beatId,
    assetId: params.assetId,
    durationSeconds: analyzed.durationSeconds,
    byteSize: analyzed.byteSize,
    contentType: analyzed.contentType,
    titleSuggestion: analyzed.titleSuggestion,
    ...bpmMapped,
  };
}

export async function analyzeUserBeatPendingUpload(params: {
  beatId: string;
  assetId: string;
}): Promise<TransportAnalyzeResult> {
  const context = await requireUserCommunityUpload();
  return analyzeUserBeatPendingUploadFor(context, params);
}

export async function finalizeUserBeatAfterUploadFor(
  context: AuthContext,
  params: {
    beatId: string;
    assetId: string;
    title: string;
    producer?: string | null;
    description?: string | null;
    genre?: string | null;
    style?: string | null;
    bpm: number;
    /** Legacy — never grants free 1–300; allowlist still enforced. */
    bpmManualOverride?: boolean;
    bpmSelectionMode?: BpmSelectionMode;
    key?: string | null;
    scale?: string | null;
    tags?: string[];
    coverRef?: string | null;
  },
): Promise<{ beatId: string; bpmSource?: string }> {
  const beat = await loadUserOwnedDraftOrThrow(context, params.beatId);
  const asset = await loadAssetOrThrow(params.assetId);
  try {
    assertUserAssetBinding({
      context,
      beat,
      asset,
      beatId: params.beatId,
      assetId: params.assetId,
    });
  } catch (error) {
    rethrowAuthz(error);
  }

  assertFinalizableMasterAsset(asset);

  const bytes = await downloadBeatAudioObjectBytes(asset.object_key);
  if (bytes.byteLength > BEAT_AUDIO_MAX_BYTES) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(
      `byteSize must be at most ${BEAT_AUDIO_MAX_BYTES}`,
    );
  }

  const analyzed = await analyzeBeatAudioBytes({
    bytes,
    contentType: asset.content_type ?? "audio/wav",
    originalFilename: asset.original_filename,
  });
  if (!analyzed.ok) {
    await markAssetFailed(params.assetId);
    throw new BeatRequestError(analyzed.error);
  }

  const envelope = buildBpmUncertaintyEnvelopeFromProbe(analyzed.bpmProbe);
  const bpmResolved = resolveCreateBpm({
    clientBpm: params.bpm,
    envelope,
    selectionMode: params.bpmSelectionMode,
    bpmManualOverride: Boolean(params.bpmManualOverride),
  });
  if (!bpmResolved.ok) {
    throw new BeatRequestError(bpmResolved.error);
  }

  const metadata = validateFinalizeMetadata({
    ownershipType: "USER",
    ownerId: context.userId,
    title: params.title,
    producer: params.producer ?? null,
    description: params.description ?? null,
    genre: params.genre ?? null,
    style: params.style ?? null,
    bpm: bpmResolved.bpm,
    key: params.key ?? null,
    scale: params.scale ?? null,
    durationSeconds: analyzed.durationSeconds,
    tags: params.tags ?? [],
    coverRef: params.coverRef ?? null,
  });

  const checksum = createHash("sha256").update(bytes).digest("hex");
  // ownerId is always the session user; the RPC pins owner, USER type and
  // DRAFT / REJECTED status under the beat row lock.
  await finalizeMasterAssetAtomically({
    beatId: params.beatId,
    assetId: params.assetId,
    ownershipType: "USER",
    ownerId: context.userId,
    contentType: analyzed.contentType,
    byteSize: bytes.byteLength,
    checksum,
    durationSeconds: metadata.durationSeconds,
    metadata,
  });

  // Invariant: beat status is unchanged (DRAFT or REJECTED); finalize never submits.
  return { beatId: params.beatId, bpmSource: bpmResolved.bpmSource };
}

export async function finalizeUserBeatAfterUpload(params: {
  beatId: string;
  assetId: string;
  title: string;
  producer?: string | null;
  description?: string | null;
  genre?: string | null;
  style?: string | null;
  bpm: number;
  bpmManualOverride?: boolean;
  bpmSelectionMode?: BpmSelectionMode;
  key?: string | null;
  scale?: string | null;
  tags?: string[];
  coverRef?: string | null;
}): Promise<{ beatId: string }> {
  const context = await requireUserCommunityUpload();
  return finalizeUserBeatAfterUploadFor(context, params);
}
