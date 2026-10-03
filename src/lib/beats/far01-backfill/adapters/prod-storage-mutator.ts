/**
 * FAR-01 production Storage COPY mutator (GC-MUT-01).
 *
 * Implements Far01StorageMutator with upsert:false / fail-if-exists.
 * Dependency-injected client only — never auto-runs, never imports
 * the Supabase admin client factory, never falls back to service-role.
 *
 * Does NOT provision LIVE credentials. Does NOT connect via FromEnv.
 */

import { Far01CredentialGateError, Far01MutationGateError } from "../errors";
import { isCanonicalUserMasterObjectKey } from "../mapping";
import type { Far01StorageMutator } from "../mutators";
import { createFar01ProdStorageInspector } from "./prod-storage-inspector";
import { FAR01_BACKFILL_BUCKET } from "../types";

type StorageListResult = {
  data: Array<{
    name: string;
    id: string | null;
    metadata?: Record<string, unknown> | null;
  }> | null;
  error: { message: string } | null;
};

export type Far01StorageMutatorClient = {
  storage: {
    from: (bucket: string) => {
      list: (
        path?: string,
        options?: { limit?: number; search?: string; offset?: number },
      ) => Promise<StorageListResult>;
      copy: (
        fromPath: string,
        toPath: string,
      ) => Promise<{
        data: { path: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
};

function assertSafeStorageKey(key: string, label: string): void {
  if (!key || typeof key !== "string") {
    throw new Far01MutationGateError(
      `Storage COPY denied: invalid ${label}`,
    );
  }
  if (key.includes("..") || key.includes("//")) {
    throw new Far01MutationGateError(
      `Storage COPY denied: ${label} path traversal forbidden`,
    );
  }
}

/**
 * Build production Storage mutator from an injected client.
 * Caller must supply a LIVE-scoped client; this factory never creates credentials.
 */
export function createFar01ProdStorageMutator(
  client: Far01StorageMutatorClient,
): Far01StorageMutator {
  const inspector = createFar01ProdStorageInspector(client);

  const mutator: Far01StorageMutator = {
    async copyObject(params) {
      if (params.upsert !== false) {
        throw new Far01MutationGateError(
          "Storage COPY denied: upsert must be false (no overwrite)",
        );
      }
      if (params.bucket !== FAR01_BACKFILL_BUCKET) {
        throw new Far01MutationGateError(
          `Storage COPY denied: bucket must be ${FAR01_BACKFILL_BUCKET}`,
        );
      }

      assertSafeStorageKey(params.sourceKey, "sourceKey");
      assertSafeStorageKey(params.destinationKey, "destinationKey");

      if (params.sourceKey === params.destinationKey) {
        throw new Far01MutationGateError(
          "Storage COPY denied: sourceKey === destinationKey",
        );
      }

      if (!isCanonicalUserMasterObjectKey(params.destinationKey)) {
        throw new Far01MutationGateError(
          "Storage COPY denied: destinationKey is not deterministic canonical MASTER key",
        );
      }

      // Mandatory re-HEAD immediately before COPY (defense in depth).
      const source = await inspector.headObject({
        bucket: params.bucket,
        key: params.sourceKey,
      });
      if (!source.exists) {
        throw new Far01MutationGateError(
          "Storage COPY denied: source missing on re-HEAD",
        );
      }

      const destination = await inspector.headObject({
        bucket: params.bucket,
        key: params.destinationKey,
      });
      if (destination.exists) {
        throw new Far01MutationGateError(
          "Storage COPY denied: DESTINATION_PRESENT — hard stop, no overwrite (upsert:false)",
        );
      }

      const { data, error } = await client.storage
        .from(params.bucket)
        .copy(params.sourceKey, params.destinationKey);

      if (error) {
        throw new Far01MutationGateError(
          `Storage COPY failed: ${error.message} — source retained, no DB update`,
        );
      }
      if (!data?.path) {
        throw new Far01MutationGateError(
          "Storage COPY failed: empty response — source retained, no DB update",
        );
      }
    },
  };

  return Object.freeze(mutator);
}

/**
 * Refuse wiring an admin / service-role client into the mutator path.
 */
export function assertFar01StorageMutatorClientAllowed(params: {
  usingAdminClient?: boolean;
  apiKey?: string;
  serviceRoleKey?: string;
}): void {
  if (params.usingAdminClient) {
    throw new Far01CredentialGateError(
      "Supabase admin client is forbidden for FAR-01 production mutator path",
    );
  }
  if (
    params.apiKey &&
    params.serviceRoleKey &&
    params.apiKey === params.serviceRoleKey
  ) {
    throw new Far01CredentialGateError(
      "Storage mutator denied: apiKey must not equal service-role key",
    );
  }
  if (params.apiKey?.startsWith("sb_secret_")) {
    throw new Far01CredentialGateError(
      "Storage mutator denied: sb_secret_ keys are forbidden",
    );
  }
}
