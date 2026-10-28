import "server-only";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  BEAT_AUDIO_BUCKET,
  buildCatalogOriginalObjectKey,
} from "@/lib/beats/audio-validation";
import {
  CATALOG_ASSETS_TABLE,
  CATALOG_ASSET_NOT_COPYABLE,
  CATALOG_COPY_FAILED,
  CATALOG_NOT_FOUND,
  CATALOG_PROJECT_NO_BEAT,
  CATALOG_REQUIRED_STORAGE_POLICIES,
  CATALOG_SOURCE_UNAVAILABLE,
  CATALOG_STORAGE_POLICIES_UNAVAILABLE,
  CATALOG_TAKE_CAP,
  buildCatalogCopyTakeTitle,
  evaluateCatalogStorageReadiness,
  prepareCatalogAssetCopy,
  type CatalogStorageReadinessSnapshot,
} from "@/lib/catalog/catalog-originals";
import { TakeClaimError } from "@/lib/takes/claim-errors";
import {
  createTakeRecordingSessionFor,
  finalizeTakeRecordingFor,
} from "@/lib/takes/take-transport";
import { expectedUserTakeObjectKey } from "@/lib/takes/object-key";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type CatalogCopyDeps = {
  admin: AdminClient;
  createTakeSession: typeof createTakeRecordingSessionFor;
  finalizeTake: typeof finalizeTakeRecordingFor;
};

export type CatalogCopySuccess = {
  ok: true;
  takeId: string;
  beatId: string;
  objectKey: string;
  catalogAssetId: string;
  status: "READY";
  reusedExisting: boolean;
};

export type CatalogCopyFailure = {
  ok: false;
  error: string;
  details?: string[];
};

export type CatalogCopyResult = CatalogCopySuccess | CatalogCopyFailure;

type CatalogAssetRow = {
  id: string;
  publish_state: string;
  license_allows_copy: boolean;
  object_key: string;
  content_type: string;
  byte_size: number;
  duration_seconds: number;
};

function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    (message.includes("does not exist") && message.includes("catalog_assets"))
  );
}

function resolveDeps(injected?: Partial<CatalogCopyDeps>): CatalogCopyDeps {
  return {
    admin: injected?.admin ?? createSupabaseAdminClient(),
    createTakeSession: injected?.createTakeSession ?? createTakeRecordingSessionFor,
    finalizeTake: injected?.finalizeTake ?? finalizeTakeRecordingFor,
  };
}

function readinessWhenTablePresent(): CatalogStorageReadinessSnapshot {
  return {
    prodApplyConfirmed: true,
    catalogAssetsTablePresent: true,
    storagePolicyNames: CATALOG_REQUIRED_STORAGE_POLICIES,
  };
}

async function downloadCatalogOriginal(
  admin: AdminClient,
  objectKey: string,
): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage
    .from(BEAT_AUDIO_BUCKET)
    .download(objectKey);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function takeObjectExists(
  admin: AdminClient,
  objectKey: string,
): Promise<boolean> {
  const { data, error } = await admin.storage
    .from(TAKE_AUDIO_BUCKET)
    .download(objectKey);
  return Boolean(data) && !error;
}

async function abortClaimedTake(
  admin: AdminClient,
  takeId: string,
  objectKey: string | null,
  reason: string,
): Promise<void> {
  await admin
    .from("takes")
    .update({
      status: "FAILED",
      failure_reason: reason,
    })
    .eq("id", takeId)
    .eq("status", "PENDING_UPLOAD");
  if (objectKey) {
    await admin.storage.from(TAKE_AUDIO_BUCKET).remove([objectKey]);
  }
}

function mapThrownCopyError(error: unknown): CatalogCopyFailure {
  if (error instanceof TakeClaimError) {
    if (
      error.claimCode === "REPLACE_REQUIRED" ||
      error.claimCode === "SESSION_DAY_CAP" ||
      error.claimCode === "CLAIM_CAP_REACHED"
    ) {
      return { ok: false, error: CATALOG_TAKE_CAP, details: [error.claimCode] };
    }
    return { ok: false, error: error.code, details: [error.claimCode] };
  }
  if (error instanceof AuthError) {
    return { ok: false, error: error.code, details: [error.message] };
  }
  return {
    ok: false,
    error: CATALOG_COPY_FAILED,
    details: ["catalog copy stopped before READY"],
  };
}

/**
 * Server catalog original → private USER TAKE.
 * Reuses take claim + finalize. Fail-closed gates write nothing.
 */
export async function executeCatalogAssetCopyFor(
  context: AuthContext,
  input: { catalogAssetId: string; projectId: string },
  injected?: Partial<CatalogCopyDeps>,
): Promise<CatalogCopyResult> {
  const deps = resolveDeps(injected);
  const admin = deps.admin;

  const { data: assetRow, error: assetError } = await admin
    .from(CATALOG_ASSETS_TABLE)
    .select(
      "id, publish_state, license_allows_copy, object_key, content_type, byte_size, duration_seconds",
    )
    .eq("id", input.catalogAssetId)
    .maybeSingle();

  if (assetError && isMissingRelation(assetError)) {
    return {
      ok: false,
      error: CATALOG_STORAGE_POLICIES_UNAVAILABLE,
      details: ["catalog_assets table is missing or unknown"],
    };
  }
  if (assetError) {
    return {
      ok: false,
      error: CATALOG_STORAGE_POLICIES_UNAVAILABLE,
      details: ["catalog_assets probe failed"],
    };
  }

  const readiness = readinessWhenTablePresent();
  const storageReady = evaluateCatalogStorageReadiness(readiness);
  if (!storageReady.ok) {
    return {
      ok: false,
      error: storageReady.error,
      details: storageReady.details,
    };
  }

  if (!assetRow) {
    return {
      ok: false,
      error: CATALOG_NOT_FOUND,
      details: ["catalog asset was not loaded"],
    };
  }

  const asset = assetRow as CatalogAssetRow;
  const expectedKey = buildCatalogOriginalObjectKey(asset.id);
  if (asset.object_key !== expectedKey) {
    return {
      ok: false,
      error: CATALOG_ASSET_NOT_COPYABLE,
      details: ["catalog object_key does not match canon"],
    };
  }

  const { data: project, error: projectError } = await admin
    .from("studio_projects")
    .select("id, owner_id, beat_id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (projectError) {
    return {
      ok: false,
      error: CATALOG_COPY_FAILED,
      details: ["studio project probe failed"],
    };
  }
  if (!project) {
    return { ok: false, error: "NOT_FOUND", details: ["studio project not found"] };
  }
  if ((project.owner_id as string) !== context.userId) {
    return { ok: false, error: "FORBIDDEN", details: ["not project owner"] };
  }
  const beatId = project.beat_id as string | null;
  if (!beatId) {
    return {
      ok: false,
      error: CATALOG_PROJECT_NO_BEAT,
      details: ["project has no attached beat"],
    };
  }

  const originalBytes = await downloadCatalogOriginal(admin, expectedKey);
  if (!originalBytes) {
    return {
      ok: false,
      error: CATALOG_SOURCE_UNAVAILABLE,
      details: ["catalog original object is missing"],
    };
  }
  if (originalBytes.byteLength !== Number(asset.byte_size)) {
    return {
      ok: false,
      error: "VALIDATION_FAILED",
      details: ["original byte size does not match catalog asset"],
    };
  }

  const prepared = prepareCatalogAssetCopy(
    {
      catalogAssetId: asset.id,
      projectId: input.projectId,
      contentType: asset.content_type,
      byteSize: originalBytes.byteLength,
      durationSeconds: asset.duration_seconds,
    },
    {
      readiness,
      catalogAsset: {
        publishState: asset.publish_state,
        licenseAllowsCopy: asset.license_allows_copy === true,
      },
      originalBytes,
    },
  );
  if (!prepared.ok) {
    return {
      ok: false,
      error: prepared.error,
      details: prepared.details,
    };
  }

  const provenanceTitle = buildCatalogCopyTakeTitle({
    catalogAssetId: asset.id,
    projectId: input.projectId,
  });

  const { data: existingRows, error: existingError } = await admin
    .from("takes")
    .select(
      "id, status, object_key, storage_bucket, beat_id, title, duration_seconds, byte_size, content_type",
    )
    .eq("owner_id", context.userId)
    .eq("title", provenanceTitle)
    .eq("beat_id", beatId)
    .is("deleted_at", null);

  if (existingError) {
    return {
      ok: false,
      error: CATALOG_COPY_FAILED,
      details: ["idempotency lookup failed"],
    };
  }

  const existingReady = (existingRows ?? []).find(
    (row) => (row.status as string) === "READY",
  );
  if (existingReady) {
    const objectKey = existingReady.object_key as string;
    const hasObject = await takeObjectExists(admin, objectKey);
    if (
      hasObject &&
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
        objectKey,
        catalogAssetId: asset.id,
        status: "READY",
        reusedExisting: true,
      };
    }
    return {
      ok: false,
      error: CATALOG_COPY_FAILED,
      details: ["existing READY take is missing storage object"],
    };
  }

  for (const leftover of existingRows ?? []) {
    if ((leftover.status as string) === "PENDING_UPLOAD") {
      await abortClaimedTake(
        admin,
        leftover.id as string,
        leftover.object_key as string,
        "CATALOG_COPY_RETRY",
      );
    }
  }

  let session;
  try {
    session = await deps.createTakeSession(context, {
      beatId,
      contentType: asset.content_type,
      byteSize: originalBytes.byteLength,
    });
  } catch (error) {
    return mapThrownCopyError(error);
  }

  const destKey = session.objectKey;
  if (
    !expectedUserTakeObjectKey({
      ownerId: context.userId,
      takeId: session.takeId,
      objectKey: destKey,
    })
  ) {
    await abortClaimedTake(admin, session.takeId, destKey, "CATALOG_COPY_KEY");
    return {
      ok: false,
      error: CATALOG_COPY_FAILED,
      details: ["claimed take object_key is not canonical"],
    };
  }

  const authorized = prepareCatalogAssetCopy(
    {
      catalogAssetId: asset.id,
      projectId: input.projectId,
      contentType: asset.content_type,
      byteSize: originalBytes.byteLength,
      durationSeconds: asset.duration_seconds,
    },
    {
      readiness,
      catalogAsset: {
        publishState: asset.publish_state,
        licenseAllowsCopy: true,
      },
      originalBytes,
      dest: { ownerId: context.userId, takeId: session.takeId },
    },
  );
  if (
    !authorized.ok ||
    !authorized.write.allowed ||
    authorized.write.destObjectKey !== destKey
  ) {
    await abortClaimedTake(admin, session.takeId, destKey, "CATALOG_COPY_PLAN");
    return {
      ok: false,
      error: CATALOG_COPY_FAILED,
      details: ["copy plan rejected dest key"],
    };
  }

  const { error: stampError } = await admin
    .from("takes")
    .update({
      recording_mode: "QUICK",
      title: provenanceTitle,
    })
    .eq("id", session.takeId)
    .eq("status", "PENDING_UPLOAD");
  if (stampError) {
    await abortClaimedTake(admin, session.takeId, destKey, "CATALOG_COPY_STAMP");
    return {
      ok: false,
      error: CATALOG_COPY_FAILED,
      details: ["could not stamp catalog provenance"],
    };
  }

  const { error: uploadError } = await admin.storage
    .from(TAKE_AUDIO_BUCKET)
    .upload(destKey, originalBytes, {
      contentType: asset.content_type,
      upsert: false,
    });
  if (uploadError) {
    await abortClaimedTake(admin, session.takeId, destKey, "CATALOG_COPY_UPLOAD");
    return {
      ok: false,
      error: CATALOG_COPY_FAILED,
      details: ["take-audio upload failed"],
    };
  }

  try {
    const finalized = await deps.finalizeTake(context, {
      takeId: session.takeId,
    });
    if (finalized.status !== "READY") {
      await abortClaimedTake(
        admin,
        session.takeId,
        destKey,
        "CATALOG_COPY_FINALIZE",
      );
      return {
        ok: false,
        error: CATALOG_COPY_FAILED,
        details: ["finalize did not reach READY"],
      };
    }
    return {
      ok: true,
      takeId: finalized.takeId,
      beatId: finalized.beatId,
      objectKey: destKey,
      catalogAssetId: asset.id,
      status: "READY",
      reusedExisting: false,
    };
  } catch (error) {
    await abortClaimedTake(
      admin,
      session.takeId,
      destKey,
      "CATALOG_COPY_FINALIZE",
    );
    return mapThrownCopyError(error);
  }
}
