/**
 * FAR-01 production read-only dry-run composition (IA-6).
 *
 * Capability only — does not authorize ops execution.
 * Forced DRY_RUN · deny mutators · R1 credentials · archive evidence.
 * LIVE / --live / LIVE env must be refused by the CLI wrapper.
 */

import {
  createFar01ProdDbReader,
  createFar01ProdInventoryDbAux,
} from "./adapters/prod-db-reader";
import {
  createFar01ProdStorageInspector,
  listFar01StorageObjectKeys,
  type StorageListClient,
} from "./adapters/prod-storage-inspector";
import { runFar01BackfillBatch } from "./batch";
import { Far01CredentialGateError } from "./errors";
import { refreshFar01Inventory } from "./inventory-refresh";
import {
  createFar01DryRunReadonlyClient,
  resolveFar01DryRunReadonlyCredentials,
  type Far01EnvMap,
} from "./readonly-client";
import {
  buildFar01DryRunArchiveDocument,
  defaultFar01DryRunArchivePath,
  writeFar01DryRunArchiveFile,
  type Far01DryRunArchiveDocument,
} from "./report-archive";
import { FAR01_BACKFILL_BUCKET, FAR01_DEFAULT_AUTHORIZATION } from "./types";

export type Far01ProdDryRunRequest = {
  operatorId: string;
  gitSha: string;
  /** When true, refuse immediately (CLI maps --live / LIVE env). */
  liveRequested?: boolean;
  outputPath?: string;
  /** Inject env for tests; default process.env */
  env?: Far01EnvMap;
  /**
   * Test/injection ports — when omitted, builds from R1 env client.
   * Production ops path must omit and use env credentials.
   */
  ports?: {
    db: ReturnType<typeof createFar01ProdDbReader>;
    storage: ReturnType<typeof createFar01ProdStorageInspector>;
    countPlatformMasterAssets: () => Promise<number>;
    listOrphanStorageKeys: () => Promise<string[]>;
  };
  /** Skip filesystem write (unit tests). */
  skipWrite?: boolean;
};

export type Far01ProdDryRunResult = {
  archive: Far01DryRunArchiveDocument;
  archivePath: string | null;
};

function assertOperatorAndGit(params: {
  operatorId: string;
  gitSha: string;
}): void {
  if (!params.operatorId?.trim()) {
    throw new Far01CredentialGateError(
      "operator_id required for production dry-run (fail closed)",
    );
  }
  if (!params.gitSha?.trim()) {
    throw new Far01CredentialGateError(
      "git_sha required for production dry-run (fail closed)",
    );
  }
}

async function buildDefaultPorts(env: Far01EnvMap) {
  resolveFar01DryRunReadonlyCredentials(env);
  const client = createFar01DryRunReadonlyClient(env);
  const db = createFar01ProdDbReader(client);
  const storage = createFar01ProdStorageInspector(
    client as unknown as StorageListClient,
  );
  const aux = createFar01ProdInventoryDbAux(client);

  return {
    db,
    storage,
    countPlatformMasterAssets: () => aux.countPlatformMasterAssets(),
    async listOrphanStorageKeys(): Promise<string[]> {
      const dbKeys = new Set(await aux.listBeatAudioObjectKeys());
      const storageKeys = await listFar01StorageObjectKeys({
        client: client as unknown as StorageListClient,
        bucket: FAR01_BACKFILL_BUCKET,
        prefix: "user",
      });
      return storageKeys.filter((k) => !dbKeys.has(k));
    },
  };
}

/**
 * Execute read-only dry-run composition.
 * Never wires storageMutator / dbMutator.
 */
export async function runFar01ProdDryRun(
  request: Far01ProdDryRunRequest,
): Promise<Far01ProdDryRunResult> {
  if (request.liveRequested) {
    throw new Far01CredentialGateError(
      "LIVE_REFUSED: production dry-run entrypoint refuses LIVE. OD-BF-08 = NO.",
    );
  }

  assertOperatorAndGit({
    operatorId: request.operatorId,
    gitSha: request.gitSha,
  });

  const env = request.env ?? process.env;
  const ports = request.ports ?? (await buildDefaultPorts(env));

  let refresh;
  try {
    refresh = await refreshFar01Inventory(ports);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Partial read failure — fail closed: ${msg}`);
  }

  const summary = await runFar01BackfillBatch(refresh.load.candidates, {
    mode: "DRY_RUN",
    authorization: {
      ...FAR01_DEFAULT_AUTHORIZATION,
      operatorId: request.operatorId.trim(),
    },
    // Intentionally omit storageMutator / dbMutator / storageInspector mutator path
  });

  if (summary.live_mutations_attempted !== 0) {
    throw new Error(
      `Dry-run integrity failure: live_mutations_attempted=${summary.live_mutations_attempted}`,
    );
  }
  if (summary.mode !== "DRY_RUN") {
    throw new Error(`Dry-run integrity failure: mode=${summary.mode}`);
  }

  const archive = buildFar01DryRunArchiveDocument({
    summary,
    gitSha: request.gitSha,
    operatorId: request.operatorId,
    inventory: refresh.inventory,
    historicalDelta: refresh.historical_delta,
    inventoryAssets: refresh.assets,
  });

  let archivePath: string | null = null;
  if (!request.skipWrite) {
    const out =
      request.outputPath ?? defaultFar01DryRunArchivePath(summary.batch_id);
    archivePath = await writeFar01DryRunArchiveFile({
      doc: archive,
      outputPath: out,
    });
  }

  return { archive, archivePath };
}
