/**
 * FAR-01 production DB UPDATE mutator (GC-MUT-02).
 *
 * Optimistic lock + pre-UPDATE re-read + post-UPDATE verify.
 * Updates ONLY object_key. Never checksum / owner / beat / status.
 *
 * Dependency-injected client only — never auto-runs, never imports
 * the Supabase admin client factory, never falls back to service-role.
 *
 * Does NOT provision LIVE credentials. Does NOT connect via FromEnv.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { Far01CredentialGateError, Far01MutationGateError } from "../errors";
import type { Far01DbMutator } from "../mutators";
import { FAR01_BACKFILL_BUCKET } from "../types";
import { FAR01_LOCKED_QUARANTINE_ASSET_IDS } from "../quarantine";

type DbClient = Pick<SupabaseClient, "from">;

type AssetRow = {
  id: string;
  object_key: string;
  storage_bucket: string;
  beat_id: string;
};

/**
 * Build production DB mutator from an injected PostgREST client.
 */
export function createFar01ProdDbMutator(client: DbClient): Far01DbMutator {
  const mutator: Far01DbMutator = {
    async updateObjectKeyOptimistic(params) {
      if (!params.assetId || typeof params.assetId !== "string") {
        throw new Far01MutationGateError(
          "DB UPDATE denied: invalid assetId",
        );
      }
      if (
        FAR01_LOCKED_QUARANTINE_ASSET_IDS.has(
          params.assetId.toLowerCase(),
        )
      ) {
        throw new Far01MutationGateError(
          "DB UPDATE denied: asset is LOCKED QUARANTINE (OD-BF-01)",
        );
      }
      if (!params.sourceKey || !params.destinationKey) {
        throw new Far01MutationGateError(
          "DB UPDATE denied: sourceKey and destinationKey required",
        );
      }
      if (params.sourceKey === params.destinationKey) {
        throw new Far01MutationGateError(
          "DB UPDATE denied: sourceKey === destinationKey",
        );
      }

      // DB RE-HEAD — re-read current record before UPDATE.
      const { data: before, error: readErr } = await client
        .from("beat_audio_assets")
        .select("id, object_key, storage_bucket, beat_id")
        .eq("id", params.assetId)
        .maybeSingle();

      if (readErr) {
        throw new Far01MutationGateError(
          `DB UPDATE denied: pre-update re-read failed: ${readErr.message}`,
        );
      }
      if (!before) {
        throw new Far01MutationGateError(
          "DB UPDATE denied: asset not found on pre-update re-read",
        );
      }

      const row = before as AssetRow;
      if (row.storage_bucket !== FAR01_BACKFILL_BUCKET) {
        throw new Far01MutationGateError(
          "DB UPDATE denied: storage_bucket mismatch",
        );
      }
      if (row.object_key !== params.sourceKey) {
        throw new Far01MutationGateError(
          "DB UPDATE denied: current object_key !== expected legacy source key (optimistic lock abort)",
        );
      }

      // Optimistic UPDATE — object_key only; asset-specific predicate.
      const { data: updated, error: updErr } = await client
        .from("beat_audio_assets")
        .update({ object_key: params.destinationKey })
        .eq("id", params.assetId)
        .eq("object_key", params.sourceKey)
        .eq("storage_bucket", FAR01_BACKFILL_BUCKET)
        .select("id, object_key")
        .maybeSingle();

      if (updErr) {
        throw new Far01MutationGateError(
          `DB UPDATE failed: ${updErr.message} — source retained`,
        );
      }
      if (!updated) {
        // Concurrent change — 0 rows.
        return { rowsAffected: 0 };
      }

      // POST-UPDATE VERIFY.
      const { data: after, error: verifyErr } = await client
        .from("beat_audio_assets")
        .select("id, object_key")
        .eq("id", params.assetId)
        .maybeSingle();

      if (verifyErr) {
        throw new Far01MutationGateError(
          `DB post-update verify failed: ${verifyErr.message} — source retained, no cleanup`,
        );
      }
      if (!after || (after as { object_key: string }).object_key !== params.destinationKey) {
        throw new Far01MutationGateError(
          "DB post-update verify failed: object_key !== canonical destination — source retained, no cleanup",
        );
      }

      return { rowsAffected: 1 };
    },
  };

  return Object.freeze(mutator);
}

export function assertFar01DbMutatorClientAllowed(params: {
  usingAdminClient?: boolean;
  apiKey?: string;
  serviceRoleKey?: string;
}): void {
  if (params.usingAdminClient) {
    throw new Far01CredentialGateError(
      "Supabase admin client is forbidden for FAR-01 production DB mutator path",
    );
  }
  if (
    params.apiKey &&
    params.serviceRoleKey &&
    params.apiKey === params.serviceRoleKey
  ) {
    throw new Far01CredentialGateError(
      "DB mutator denied: apiKey must not equal service-role key",
    );
  }
  if (params.apiKey?.startsWith("sb_secret_")) {
    throw new Far01CredentialGateError(
      "DB mutator denied: sb_secret_ keys are forbidden",
    );
  }
}
