/**
 * SFM master PCM bake — reuses Studio offline render + STUDIO_EXPORT AuthZ helpers.
 * Does NOT persist intermediate master PCM to Storage (QUALITY_ENCODE re-bakes).
 * Separate from Contabo STUDIO_EXPORT poller / E3 MIX / TAKE_EXPORT.
 */

import "server-only";

import type { BakePcmInput } from "@/lib/audio/mp3-encode";
import {
  decodeRenderSourceToStereoPcm,
  type DecodedPcmStereo,
} from "@/lib/audio/render-decode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { toStudioExportRenderPcm } from "@/lib/audio/render-worker-pipeline";
import { authorizeStudioExportSourcesForDocument } from "@/lib/audio/studio-export-source-resolution";
import { studioEngineDocumentFromProject } from "@/lib/studio/studio-engine-document-from-project";
import { planStudioExportDuration } from "@/lib/studio/studio-export-fx-post-roll";
import {
  renderStudioDocumentOffline,
  StudioOfflineRenderError,
  type StudioOfflinePcmResolver,
} from "@/lib/studio/studio-offline-render";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  qcSfmMasterBakePcm,
  type SfmMixPrepareValidation,
} from "@/lib/sfm/sfm-worker-core";

export type SfmBakeDownloadBytes = (params: {
  bucket: string;
  objectKey: string;
}) => Promise<Uint8Array>;

export type SfmBakeMasterDeps = {
  authorizeSources?: typeof authorizeStudioExportSourcesForDocument;
  downloadBytes?: SfmBakeDownloadBytes;
};

function decodedPcmToBakeInput(pcm: DecodedPcmStereo): BakePcmInput {
  return {
    interleaved: pcm.interleaved,
    sampleRate: pcm.sampleRate,
    channels: 2,
    frames: pcm.frames,
    durationMs: Math.max(1, Math.round((pcm.frames / pcm.sampleRate) * 1000)),
  };
}

async function defaultDownloadBytes(params: {
  bucket: string;
  objectKey: string;
}): Promise<Uint8Array> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(params.bucket)
    .download(params.objectKey);
  if (error || !data) {
    throw new RenderJobDomainError(
      `SFM source download failed: ${error?.message ?? "missing"}`,
      "NOT_FOUND",
    );
  }
  const buf = new Uint8Array(await data.arrayBuffer());
  if (buf.byteLength < 1) {
    throw new RenderJobDomainError("SFM source download empty.", "NOT_FOUND");
  }
  return buf;
}

function mapOfflineFail(error: StudioOfflineRenderError): RenderJobDomainError {
  if (
    error.code === "STUDIO_RENDER_SOURCE_MISSING" ||
    error.code === "STUDIO_RENDER_SOURCE_INVALID"
  ) {
    return new RenderJobDomainError(error.message, "NOT_FOUND");
  }
  if (
    error.code === "STUDIO_RENDER_DURATION_CAP" ||
    error.code === "STUDIO_RENDER_TAIL_DURATION_CAP" ||
    error.code === "STUDIO_RENDER_MEMORY_CAP"
  ) {
    return new RenderJobDomainError(error.message, "LIMIT");
  }
  return new RenderJobDomainError(error.message, "INVALID");
}

/**
 * Offline master PCM from an already-validated Accept snapshot + PCM resolver.
 * Pure relative to Storage/DB (caller supplies resolvePcm).
 */
export async function bakeSfmMasterPcmFromResolvedPcm(
  validation: SfmMixPrepareValidation,
  resolvePcm: StudioOfflinePcmResolver,
): Promise<BakePcmInput> {
  const engineDocument = studioEngineDocumentFromProject(
    validation.snapshot.document,
  );

  let durationPlan;
  try {
    durationPlan = planStudioExportDuration(engineDocument);
  } catch (error) {
    if (error instanceof StudioOfflineRenderError) {
      throw mapOfflineFail(error);
    }
    throw error;
  }

  let offline;
  try {
    offline = await renderStudioDocumentOffline({
      document: engineDocument,
      resolvePcm,
      exportDurationMs: durationPlan.exportDurationMs,
    });
  } catch (error) {
    if (error instanceof StudioOfflineRenderError) {
      throw mapOfflineFail(error);
    }
    throw error;
  }

  const bake = decodedPcmToBakeInput({
    interleaved: offline.interleaved,
    sampleRate: offline.sampleRate,
    channels: 2,
    frames: offline.frames,
  });
  qcSfmMasterBakePcm(bake);
  return bake;
}

/**
 * Default SFM master bake: FINDING-01 AuthZ on snapshot refs → decode → offline PCM.
 * No intermediate master object in Storage.
 */
export async function bakeSfmMasterPcmFromSnapshot(
  validation: SfmMixPrepareValidation,
  deps: SfmBakeMasterDeps = {},
): Promise<BakePcmInput> {
  const authorize =
    deps.authorizeSources ?? authorizeStudioExportSourcesForDocument;
  const download = deps.downloadBytes ?? defaultDownloadBytes;

  const authorized = await authorize({
    jobOwnerId: validation.snapshot.ownerId,
    document: validation.snapshot.document,
  });

  const pcmByTake = new Map<string, DecodedPcmStereo>();
  const pcmByBeat = new Map<string, DecodedPcmStereo>();

  for (const [takeId, ref] of Object.entries(authorized.takes)) {
    const bytes = await download({
      bucket: ref.storageBucket,
      objectKey: ref.objectKey,
    });
    const decoded = await decodeRenderSourceToStereoPcm({
      bytes,
      contentType: ref.contentType,
      label: "take",
    });
    pcmByTake.set(takeId, toStudioExportRenderPcm(decoded, `TAKE:${takeId}`));
  }

  for (const [beatId, ref] of Object.entries(authorized.beats)) {
    const bytes = await download({
      bucket: ref.storageBucket,
      objectKey: ref.objectKey,
    });
    const decoded = await decodeRenderSourceToStereoPcm({
      bytes,
      contentType: ref.contentType,
      label: "beat",
    });
    pcmByBeat.set(
      beatId,
      toStudioExportRenderPcm(decoded, `BEAT_REF:${beatId}`),
    );
  }

  const resolvePcm: StudioOfflinePcmResolver = (key) => {
    if (key.kind === "TAKE") return pcmByTake.get(key.takeId) ?? null;
    return pcmByBeat.get(key.beatId) ?? null;
  };

  return bakeSfmMasterPcmFromResolvedPcm(validation, resolvePcm);
}

/** MIX_PREPARE optional gate — sources must still AuthZ for version owner. */
export async function assertSfmMixPrepareSourcesAvailable(
  validation: SfmMixPrepareValidation,
): Promise<void> {
  await authorizeStudioExportSourcesForDocument({
    jobOwnerId: validation.snapshot.ownerId,
    document: validation.snapshot.document,
  });
}
