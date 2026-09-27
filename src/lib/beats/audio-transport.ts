import "server-only";

import { createHash, randomUUID } from "crypto";

import type { BeatAudioAsset, BeatAudioPurpose } from "@/types/domain";
import { AuthError, requirePermission } from "@/lib/auth/session";
import {
  analyzeBeatAudioBytes,
  type AnalyzedBeatBpm,
} from "@/lib/beats/audio-duration";
import { resolveCreateBpm } from "@/lib/beats/audio-bpm-rank";
import {
  BEAT_AUDIO_ASSET_SELECT,
  mapBeatAudioAssetRow,
  type BeatAudioAssetRow,
} from "@/lib/beats/audio-types";
import {
  BEAT_AUDIO_BUCKET,
  BEAT_AUDIO_MAX_BYTES,
  buildBeatAudioObjectKey,
  resolveAudioContentType,
  validateAudioUploadMeta,
} from "@/lib/beats/audio-validation";
import { suggestTitleFromFilename } from "@/lib/beats/filename-title";
import {
  createPlatformBeat,
  updateBeatMetadata,
} from "@/lib/beats/service";
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

async function markAssetFailed(assetId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from("beat_audio_assets")
    .update({ status: "FAILED", is_active: false })
    .eq("id", assetId);
}

async function activateAssetReady(params: {
  assetId: string;
  beatId: string;
  purpose: BeatAudioPurpose;
  contentType: string;
  byteSize: number;
  checksum: string;
}): Promise<BeatAudioAsset> {
  const admin = createSupabaseAdminClient();

  const { data: previousActive } = await admin
    .from("beat_audio_assets")
    .select("id")
    .eq("beat_id", params.beatId)
    .eq("purpose", params.purpose)
    .eq("is_active", true)
    .maybeSingle();

  if (previousActive?.id && previousActive.id !== params.assetId) {
    await admin
      .from("beat_audio_assets")
      .update({
        is_active: false,
        status: "REPLACED",
        replaced_by_asset_id: params.assetId,
      })
      .eq("id", previousActive.id);
  }

  const { data: ready, error } = await admin
    .from("beat_audio_assets")
    .update({
      status: "READY",
      is_active: true,
      content_type: params.contentType,
      byte_size: params.byteSize,
      checksum_sha256: params.checksum,
    })
    .eq("id", params.assetId)
    .select(BEAT_AUDIO_ASSET_SELECT)
    .single();

  if (error || !ready) {
    throw new Error(error?.message ?? "Failed to activate audio asset.");
  }
  return mapBeatAudioAssetRow(ready as BeatAudioAssetRow);
}

function mapBpmForClient(bpm: AnalyzedBeatBpm): {
  bpmDecision: "AUTO_SUGGEST" | "MANUAL_REQUIRED";
  bpm: number | null;
  bpmReason?: string;
  bpmMessage?: string;
} {
  if (bpm.status === "auto_suggest") {
    return {
      bpmDecision: "AUTO_SUGGEST",
      bpm: bpm.bpm,
      bpmReason: bpm.reason,
    };
  }
  if (bpm.status === "manual_required") {
    return {
      bpmDecision: "MANUAL_REQUIRED",
      bpm: null,
      bpmReason: bpm.reason,
      bpmMessage: bpm.message,
    };
  }
  return {
    bpmDecision: "MANUAL_REQUIRED",
    bpm: null,
    bpmReason: bpm.reason,
    bpmMessage: bpm.message,
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
    throw new Error(meta.errors.join("; "));
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
 * After client binary upload: download object, analyze duration+BPM, update draft duration.
 * Asset stays PENDING_UPLOAD (not READY).
 */
export async function analyzePlatformBeatPendingUpload(params: {
  beatId: string;
  assetId: string;
}): Promise<TransportAnalyzeResult> {
  await requireAdminCreate();
  await loadPlatformBeatOrThrow(params.beatId);
  const asset = await loadAssetOrThrow(params.assetId);

  if (asset.beat_id !== params.beatId) {
    throw new AuthError("FORBIDDEN", "Asset does not belong to beat.");
  }
  if (asset.status !== "PENDING_UPLOAD") {
    throw new Error("Asset is not awaiting analysis (PENDING_UPLOAD).");
  }

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
    throw new Error(`byteSize must be at most ${BEAT_AUDIO_MAX_BYTES}`);
  }

  const meta = validateAudioUploadMeta({
    contentType: asset.content_type ?? "application/octet-stream",
    byteSize: bytes.byteLength,
  });
  if (!meta.ok) {
    await markAssetFailed(params.assetId);
    throw new Error(meta.errors.join("; "));
  }

  const analyzed = await analyzeBeatAudioBytes({
    bytes,
    contentType: asset.content_type ?? "audio/wav",
    originalFilename: asset.original_filename,
  });

  if (!analyzed.ok) {
    await markAssetFailed(params.assetId);
    throw new Error(analyzed.error);
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const admin = createSupabaseAdminClient();
  await admin
    .from("beat_audio_assets")
    .update({
      byte_size: bytes.byteLength,
      checksum_sha256: checksum,
      content_type: analyzed.contentType,
    })
    .eq("id", params.assetId);

  await updateBeatMetadata(params.beatId, {
    durationSeconds: analyzed.durationSeconds,
    title: analyzed.titleSuggestion || undefined,
  });

  const bpmMapped = mapBpmForClient(analyzed.bpm);

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
 * Finalize metadata + BPM policy + mark MASTER READY.
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
  bpmManualOverride?: boolean;
  key?: string | null;
  scale?: string | null;
  tags?: string[];
  coverRef?: string | null;
}): Promise<{ beatId: string }> {
  await requireAdminCreate();
  await loadPlatformBeatOrThrow(params.beatId);
  const asset = await loadAssetOrThrow(params.assetId);

  if (asset.beat_id !== params.beatId) {
    throw new AuthError("FORBIDDEN", "Asset does not belong to beat.");
  }
  if (asset.status === "READY" && asset.is_active) {
    throw new Error("Asset already READY.");
  }
  if (asset.status === "FAILED") {
    throw new Error("Asset FAILED — upload/analyze again.");
  }

  const bytes = await downloadBeatAudioObjectBytes(asset.object_key);
  const analyzed = await analyzeBeatAudioBytes({
    bytes,
    contentType: asset.content_type ?? "audio/wav",
    originalFilename: asset.original_filename,
  });
  if (!analyzed.ok) {
    await markAssetFailed(params.assetId);
    throw new Error(analyzed.error);
  }

  const suggestedBpm =
    analyzed.bpm.status === "auto_suggest" ? analyzed.bpm.bpm : null;
  const decodeAvailable =
    analyzed.bpm.status === "auto_suggest" ||
    analyzed.bpm.status === "manual_required";

  const bpmResolved = resolveCreateBpm({
    clientBpm: params.bpm,
    bpmManualOverride: Boolean(params.bpmManualOverride),
    suggestedBpm,
    decodeAvailable,
  });
  if (!bpmResolved.ok) {
    throw new Error(bpmResolved.error);
  }

  await updateBeatMetadata(params.beatId, {
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
  await activateAssetReady({
    assetId: params.assetId,
    beatId: params.beatId,
    purpose: "MASTER",
    contentType: analyzed.contentType,
    byteSize: bytes.byteLength,
    checksum,
  });

  return { beatId: params.beatId };
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
    throw new Error(meta.errors.join("; "));
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
 * Complete MASTER replace: validate object exists, mark READY (no BPM path).
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
    throw new Error(meta.errors.join("; "));
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  return activateAssetReady({
    assetId: params.assetId,
    beatId: params.beatId,
    purpose: "MASTER",
    contentType: asset.content_type ?? "audio/mpeg",
    byteSize: bytes.byteLength,
    checksum,
  });
}
