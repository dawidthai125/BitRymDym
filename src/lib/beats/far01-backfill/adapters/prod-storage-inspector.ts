/**
 * FAR-01 production Storage HEAD adapter (IA-2 / B-PDR-02).
 *
 * Implements Far01StorageInspector with metadata-only surface.
 * Does NOT expose upload / remove / copy / move.
 * Does NOT import Far01StorageMutator.
 *
 * Uses storage.list parent folder + filename match (read metadata).
 * HEAD metadata is never treated as checksum proof.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Far01StorageInspector } from "../mutators";
import type { Far01StorageObjectMeta } from "../types";
import { createFar01DryRunReadonlyClient } from "../readonly-client";

type StorageListClient = {
  storage: {
    from: (bucket: string) => {
      list: (
        path?: string,
        options?: { limit?: number; search?: string; offset?: number },
      ) => Promise<{
        data: Array<{
          name: string;
          id: string | null;
          metadata?: Record<string, unknown> | null;
        }> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

function splitObjectKey(key: string): { folder: string; name: string } {
  const idx = key.lastIndexOf("/");
  if (idx < 0) {
    return { folder: "", name: key };
  }
  return { folder: key.slice(0, idx), name: key.slice(idx + 1) };
}

function metaFromListEntry(entry: {
  metadata?: Record<string, unknown> | null;
}): Far01StorageObjectMeta {
  const md = entry.metadata ?? null;
  const sizeRaw = md?.size ?? md?.contentLength ?? null;
  let size: number | null = null;
  if (typeof sizeRaw === "number" && Number.isFinite(sizeRaw)) {
    size = sizeRaw;
  } else if (typeof sizeRaw === "string" && sizeRaw.trim() !== "") {
    const n = Number(sizeRaw);
    size = Number.isFinite(n) ? n : null;
  }
  const contentType =
    typeof md?.mimetype === "string"
      ? md.mimetype
      : typeof md?.contentType === "string"
        ? md.contentType
        : null;

  return {
    exists: true,
    size,
    contentType,
  };
}

/**
 * Metadata-only inspector. Returned object has exactly headObject.
 */
export function createFar01ProdStorageInspector(
  client: StorageListClient,
): Far01StorageInspector {
  const inspector: Far01StorageInspector = {
    async headObject(params: {
      bucket: string;
      key: string;
    }): Promise<Far01StorageObjectMeta> {
      const { bucket, key } = params;
      if (!bucket || !key || key.includes("..") || key.includes("//")) {
        return { exists: false, size: null, contentType: null };
      }

      const { folder, name } = splitObjectKey(key);
      const { data, error } = await client.storage.from(bucket).list(folder, {
        search: name,
        limit: 100,
      });

      if (error) {
        throw new Error(
          `Far01ProdStorageInspector.headObject: ${error.message}`,
        );
      }

      const match = (data ?? []).find((f) => f.name === name && f.id != null);
      if (!match) {
        return { exists: false, size: null, contentType: null };
      }
      return metaFromListEntry(match);
    },
  };

  return Object.freeze(inspector);
}

export function createFar01ProdStorageInspectorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Far01StorageInspector {
  return createFar01ProdStorageInspector(
    createFar01DryRunReadonlyClient(env) as unknown as StorageListClient,
  );
}

/**
 * Read-only list of object keys under a prefix (for orphan accounting).
 * Uses storage.list only — no download/upload/copy/remove.
 */
export async function listFar01StorageObjectKeys(params: {
  client: StorageListClient;
  bucket: string;
  prefix?: string;
  maxKeys?: number;
}): Promise<string[]> {
  const maxKeys = params.maxKeys ?? 50_000;
  const keys: string[] = [];

  async function walk(path: string): Promise<void> {
    if (keys.length >= maxKeys) {
      throw new Error(
        `Far01Storage list aborted: exceeded maxKeys=${maxKeys} (fail closed)`,
      );
    }
    let offset = 0;
    const limit = 1000;
    for (;;) {
      const { data, error } = await params.client.storage
        .from(params.bucket)
        .list(path, { limit, offset });
      if (error) {
        throw new Error(`Far01Storage list: ${error.message}`);
      }
      const batch = data ?? [];
      if (batch.length === 0) break;

      for (const item of batch) {
        const full = path ? `${path}/${item.name}` : item.name;
        const isFolder = item.id == null;
        if (isFolder) {
          await walk(full);
        } else {
          keys.push(full);
          if (keys.length >= maxKeys) {
            throw new Error(
              `Far01Storage list aborted: exceeded maxKeys=${maxKeys} (fail closed)`,
            );
          }
        }
      }
      if (batch.length < limit) break;
      offset += limit;
    }
  }

  await walk(params.prefix ?? "");
  return keys;
}

export function createFar01ProdStorageListClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StorageListClient {
  return createFar01DryRunReadonlyClient(env) as unknown as StorageListClient;
}

/** Type helper — ensure SupabaseClient satisfies list port when used in tests. */
export type { StorageListClient };
export type Far01ProdStorageInspectorClient = Pick<
  SupabaseClient,
  "storage"
>;
