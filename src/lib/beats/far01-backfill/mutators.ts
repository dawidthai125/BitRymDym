/**
 * FAR-01 Backfill — mutator contracts (C-IMPL-03).
 *
 * Production adapters must enforce upsert:false / fail-if-exists and
 * expose read-only HEAD. This module defines contracts + safe helpers.
 * It does NOT connect to Production Storage/DB and does NOT execute
 * mutations unless a caller injects adapters under LIVE + verified grant.
 */

import { Far01MutationGateError } from "./errors";
import type { Far01StorageObjectMeta } from "./types";

export type Far01StorageInspector = {
  headObject: (params: {
    bucket: string;
    key: string;
  }) => Promise<Far01StorageObjectMeta>;
};

export type Far01StorageMutator = {
  /**
   * Copy source → destination with overwrite forbidden (upsert: false).
   * MUST throw if destination already exists.
   */
  copyObject: (params: {
    bucket: string;
    sourceKey: string;
    destinationKey: string;
    /** Contract flag — adapters must honor false. */
    upsert: false;
  }) => Promise<void>;
};

export type Far01DbMutator = {
  updateObjectKeyOptimistic: (params: {
    assetId: string;
    sourceKey: string;
    destinationKey: string;
  }) => Promise<{ rowsAffected: number }>;
};

export function denyStorageMutator(): Far01StorageMutator {
  return {
    async copyObject() {
      throw new Far01MutationGateError(
        "Storage COPY denied: no mutator authorized (Backfill GO / verified grant required)",
      );
    },
  };
}

export function denyDbMutator(): Far01DbMutator {
  return {
    async updateObjectKeyOptimistic() {
      throw new Far01MutationGateError(
        "DB UPDATE denied: no mutator authorized (Backfill GO / verified grant required)",
      );
    },
  };
}

export function denyStorageInspector(): Far01StorageInspector {
  return {
    async headObject() {
      throw new Far01MutationGateError(
        "Storage HEAD denied: inspector not authorized for this run",
      );
    },
  };
}

/**
 * Pre-mutation source/dest checks using inspector (read-only).
 * Destination present → HARD STOP (no overwrite, no skip-copy success).
 */
export async function preMutationHeadCheck(params: {
  inspector: Far01StorageInspector;
  bucket: string;
  sourceKey: string;
  destinationKey: string;
  expectedSourceSize: number | null;
}): Promise<{
  source: Far01StorageObjectMeta;
  destination: Far01StorageObjectMeta;
}> {
  const source = await params.inspector.headObject({
    bucket: params.bucket,
    key: params.sourceKey,
  });
  if (!source.exists) {
    throw new Far01MutationGateError(
      "pre-mutation HEAD: source missing — abort, no COPY, no DB update",
    );
  }
  if (
    params.expectedSourceSize != null &&
    source.size != null &&
    source.size !== params.expectedSourceSize
  ) {
    throw new Far01MutationGateError(
      "pre-mutation HEAD: source size drift vs preflight snapshot — abort",
    );
  }

  const destination = await params.inspector.headObject({
    bucket: params.bucket,
    key: params.destinationKey,
  });

  if (destination.exists) {
    throw new Far01MutationGateError(
      "pre-mutation HEAD: DESTINATION_PRESENT — hard stop, no overwrite (upsert:false) — OWNER_REVIEW / CONFLICT",
    );
  }

  return { source, destination };
}

/** Mandatory post-copy re-HEAD. Failure → no DB update. */
export async function postCopyReHeadVerify(params: {
  inspector: Far01StorageInspector;
  bucket: string;
  sourceKey: string;
  destinationKey: string;
  expectedSize: number | null;
}): Promise<{
  source: Far01StorageObjectMeta;
  destination: Far01StorageObjectMeta;
}> {
  const source = await params.inspector.headObject({
    bucket: params.bucket,
    key: params.sourceKey,
  });
  if (!source.exists) {
    throw new Far01MutationGateError(
      "post-copy re-HEAD: source missing — retain whatever remains; no DB update",
    );
  }

  const destination = await params.inspector.headObject({
    bucket: params.bucket,
    key: params.destinationKey,
  });
  if (!destination.exists) {
    throw new Far01MutationGateError(
      "post-copy re-HEAD: destination missing — abort DB update, source retained",
    );
  }
  if (
    params.expectedSize != null &&
    destination.size != null &&
    destination.size !== params.expectedSize
  ) {
    throw new Far01MutationGateError(
      "post-copy re-HEAD: destination size mismatch — abort DB update, source retained",
    );
  }
  if (
    source.size != null &&
    destination.size != null &&
    source.size !== destination.size
  ) {
    throw new Far01MutationGateError(
      "post-copy re-HEAD: source/dest size mismatch — abort DB update, source retained",
    );
  }

  return { source, destination };
}
