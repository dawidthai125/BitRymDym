/**
 * CONTROLLED STORAGE ORPHAN CLEANUP — beat-audio only.
 *
 * Classifies objects in beat-audio that are not referenced by beat_audio_assets.
 * Deletes ONLY SAFE_DELETE under user/* after fail-closed gates.
 * Never deletes platform/* or catalog/* (P0 catalog safety).
 *
 * Usage:
 *   npx tsx scripts/production-storage-orphan-cleanup.ts --classify
 *   npx tsx scripts/production-storage-orphan-cleanup.ts --execute
 *
 * --execute still requires a separate Owner production mutate GO.
 *
 * Testability: call classifyWithDepsAsync / executeWithDeps / executeDeletePhaseWithDeps
 * with injected deps. Production client is created only in CLI path (createProductionDeps).
 * Delete phase re-classifies claimed SAFE_DELETE before remove (R1).
 * Batch remove outcomes are reported OK|ERROR|AMBIGUOUS; fail-stop never auto-retries (R3.1).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const OUT = join(process.cwd(), "docs", "audits");
const CLASS_PATH = join(OUT, "PRODUCTION_STORAGE_ORPHAN_CLASSIFICATION.json");
const ALLOWLIST_BEATS = join(
  OUT,
  "PRODUCTION_BEAT_CATALOG_CLEANUP_ALLOWLIST.json",
);
export const BEAT_AUDIO_ORPHAN_BUCKET = "beat-audio";
export const DEFAULT_ORPHAN_BATCH_SIZE = 40;
const DAWID = "fdf04726-e971-42a7-9d46-8b9bdd099c23";
const UNMAPPED_TAKE =
  "user/912b98da-845a-4957-b93a-5b78a419e958/takes/69a4d693-0a85-4d45-beee-667df6b4dbfb/mic.bin";
const FIXTURE_SIZES = new Set([16044, 2646044]);

export type PathKind = "user" | "platform" | "catalog" | "other";
export type OrphanClassification = "SAFE_DELETE" | "KEEP" | "UNKNOWN";

/** Per-batch remove outcome. OK = API returned no error — not independent Storage proof. */
export type OrphanBatchRemoveStatus = "OK" | "ERROR" | "AMBIGUOUS";

export type OrphanBatchRemoveReport = {
  batch_index: number;
  path_count: number;
  paths: string[];
  status: OrphanBatchRemoveStatus;
  error_message?: string;
  /** Always false: this script does not re-list objects after remove. */
  storage_state_independently_verified: false;
};

export type ClassRow = {
  object_path: string;
  bucket: string;
  size_bytes: number | null;
  created_at: string | null;
  uid: string | null;
  beat_candidate: string | null;
  asset_candidate: string | null;
  path_kind: PathKind;
  in_deleted_beat_allowlist: boolean;
  classification: OrphanClassification;
  evidence: string[];
};

export type ClassifyDbContext = {
  assetKeys: Set<string>;
  assetIds: Set<string>;
  liveBeats: Set<string>;
  platformBeats: Set<string>;
  takeKeys: Set<string>;
  takeIds: Set<string>;
  artifactKeys: Set<string>;
  deletedBeatIds: Set<string>;
  clips: Array<{ source_beat_id: string | null }>;
  projects: Array<{ beat_id: string | null }>;
  ownerUidProtected?: string;
};

export type InventoryObject = {
  object_path: string;
  size_bytes: number | null;
  created_at: string | null;
};

export class OrphanCleanupAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrphanCleanupAbortError";
  }
}

/** Injected runtime for classify + execute (tests supply mocks; CLI builds production deps). */
export type OrphanCleanupDeps = {
  abort: (message: string) => never;
  getInventory: () => InventoryObject[];
  getDeletedBeatIds: () => string[];
  loadClassifyContext: () => Promise<
    ClassifyDbContext & { platformLiveAssetCount: number }
  >;
  /** Always invoked as storageRemove(BEAT_AUDIO_ORPHAN_BUCKET, paths) from execute. */
  storageRemove: (
    bucket: string,
    paths: string[],
  ) => Promise<{ error: { message: string } | null }>;
  getPlatformAssetKeys: () => Promise<string[]>;
  objectExists: (bucket: string, objectKey: string) => Promise<boolean>;
  countBeatsAndAssets: () => Promise<{
    beats: number | null;
    assets: number | null;
  }>;
  onClassification?: (payload: {
    summary: Record<string, unknown>;
    rows: ClassRow[];
  }) => void;
  onEvidence?: (evidence: Record<string, unknown>) => void;
  /** Fired after each storageRemove attempt (success, API error, or thrown failure). */
  onBatchReport?: (report: OrphanBatchRemoveReport) => void;
  batchSize?: number;
  /** Production default 17; tests may set null to skip count gate. */
  requiredPlatformAssetCount?: number | null;
  verifyUnmappedTake?: boolean;
  unmappedTakeKey?: string;
};

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of [".env", ".env.local"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      out[k] = v;
    }
  }
  return out;
}

function stop(msg: string): never {
  console.error(`STOP: ${msg}`);
  process.exit(2);
}

/** Structural path parse — PATH ≠ AUTHORIZATION. */
export function parsePath(objectPath: string): {
  path_kind: PathKind;
  uid: string | null;
  beat_candidate: string | null;
  asset_candidate: string | null;
} {
  const parts = objectPath.split("/");
  const path_kind: PathKind =
    parts[0] === "user"
      ? "user"
      : parts[0] === "platform"
        ? "platform"
        : parts[0] === "catalog"
          ? "catalog"
          : "other";
  const uid = parts[1] ?? null;
  const isMasters = parts[2] === "masters";
  const beat_candidate = isMasters ? null : (parts[2] ?? null);
  const asset_candidate = isMasters ? (parts[3] ?? null) : (parts[3] ?? null);
  return { path_kind, uid, beat_candidate, asset_candidate };
}

/**
 * Pure classification for one beat-audio object.
 * catalog/* → KEEP always (independent of beat_audio_assets).
 * unknown prefix → UNKNOWN (never SAFE_DELETE).
 * SAFE_DELETE only possible for user/* after gates.
 */
export function classifyBeatAudioOrphanObject(
  o: {
    object_path: string;
    size_bytes: number | null;
    created_at: string | null;
  },
  ctx: ClassifyDbContext,
): ClassRow {
  const evidence: string[] = [];
  const parsed = parsePath(o.object_path);
  const ownerUid = ctx.ownerUidProtected ?? DAWID;

  let classification: OrphanClassification;

  if (parsed.path_kind === "catalog" || o.object_path.startsWith("catalog/")) {
    classification = "KEEP";
    evidence.push(
      "path starts with catalog/ — catalog originals never SAFE_DELETE (P0)",
    );
  } else if (parsed.path_kind === "platform") {
    classification = "KEEP";
    evidence.push("path starts with platform/");
  } else if (parsed.path_kind === "other") {
    classification = "UNKNOWN";
    evidence.push(
      "unknown path prefix — fail-closed (never default SAFE_DELETE)",
    );
  } else {
    // user/*
    classification = "SAFE_DELETE";
  }

  if (parsed.uid === ownerUid) {
    classification = "KEEP";
    evidence.push("uid is Owner Dawid");
  }
  if (o.object_path && ctx.assetKeys.has(o.object_path)) {
    classification = "KEEP";
    evidence.push("exact beat_audio_assets.object_key hit");
  }
  if (
    ctx.takeKeys.has(o.object_path) ||
    ctx.artifactKeys.has(o.object_path)
  ) {
    classification = "KEEP";
    evidence.push("exact take/artifact object_key hit");
  }
  if (parsed.beat_candidate && ctx.liveBeats.has(parsed.beat_candidate)) {
    classification = "KEEP";
    evidence.push("path beat UUID is live beats.id");
  }
  if (parsed.beat_candidate && ctx.platformBeats.has(parsed.beat_candidate)) {
    classification = "KEEP";
    evidence.push("path beat UUID is PLATFORM");
  }
  if (
    parsed.asset_candidate &&
    (ctx.assetIds.has(parsed.asset_candidate) ||
      ctx.takeIds.has(parsed.asset_candidate))
  ) {
    classification = "KEEP";
    evidence.push("path asset/take UUID live");
  }
  if (
    parsed.beat_candidate &&
    ctx.clips.some((c) => c.source_beat_id === parsed.beat_candidate)
  ) {
    classification = "KEEP";
    evidence.push("studio_clips.source_beat_id live");
  }
  if (
    parsed.beat_candidate &&
    ctx.projects.some((p) => p.beat_id === parsed.beat_candidate)
  ) {
    classification = "KEEP";
    evidence.push("studio_projects.beat_id live");
  }

  // Re-assert catalog/platform after DB signals (must win).
  if (parsed.path_kind === "catalog" || o.object_path.startsWith("catalog/")) {
    classification = "KEEP";
  }
  if (parsed.path_kind === "platform" || o.object_path.startsWith("platform/")) {
    classification = "KEEP";
  }
  if (parsed.path_kind === "other" && classification === "SAFE_DELETE") {
    classification = "UNKNOWN";
    evidence.push("blocked SAFE_DELETE for unknown prefix");
  }

  const inAllow =
    !!parsed.beat_candidate && ctx.deletedBeatIds.has(parsed.beat_candidate);
  if (inAllow) evidence.push("beat UUID in prior DELETE allowlist (391 fixtures)");
  if (parsed.path_kind === "user") evidence.push("path user/*");
  if (!ctx.assetKeys.has(o.object_path))
    evidence.push("no beat_audio_assets.object_key");
  if (!ctx.liveBeats.has(parsed.beat_candidate ?? ""))
    evidence.push("beat UUID not in live beats (or masters path)");

  if (parsed.path_kind === "user" && classification === "SAFE_DELETE") {
    if (o.size_bytes == null) {
      classification = "UNKNOWN";
      evidence.push(
        "missing size_bytes — no delete consent (size/fingerprint not authority)",
      );
    } else if (FIXTURE_SIZES.has(o.size_bytes)) {
      evidence.push(
        `fixture size fingerprint ${o.size_bytes} (only appears on user orphans; never on platform)`,
      );
    } else {
      classification = "UNKNOWN";
      evidence.push(
        `size ${o.size_bytes} not in known fixture fingerprints → UNKNOWN`,
      );
    }
  }

  if (classification === "SAFE_DELETE") {
    evidence.push(
      "no live DB/storage refs; user/* only; not platform/catalog; orphan after fixture cleanup",
    );
    if (!inAllow && parsed.beat_candidate) {
      evidence.push(
        "beat UUID not in allowlist snapshot; test origin via fixture size + zero live refs",
      );
    }
    if (!parsed.beat_candidate) {
      evidence.push("masters/ legacy path; fixture size + zero live refs");
    }
  }

  return {
    object_path: o.object_path,
    bucket: BEAT_AUDIO_ORPHAN_BUCKET,
    size_bytes: o.size_bytes,
    created_at: o.created_at,
    uid: parsed.uid,
    beat_candidate: parsed.beat_candidate,
    asset_candidate: parsed.asset_candidate,
    path_kind: parsed.path_kind,
    in_deleted_beat_allowlist: inAllow,
    classification,
    evidence,
  };
}

/**
 * Pre-remove gate: re-check bucket + path + classification.
 * Throws Error on any failure (caller must abort — no further removes).
 */
export function assertKeySafeToRemove(params: {
  bucket: string;
  objectPath: string;
  classification: OrphanClassification;
}): void {
  const { bucket, objectPath, classification } = params;
  if (!objectPath || typeof objectPath !== "string") {
    throw new Error("remove blocked: empty object path");
  }
  if (objectPath.includes("..") || objectPath.includes("//")) {
    throw new Error(`remove blocked: invalid path ${objectPath}`);
  }
  if (bucket !== BEAT_AUDIO_ORPHAN_BUCKET) {
    throw new Error(
      `remove blocked: bucket must be ${BEAT_AUDIO_ORPHAN_BUCKET}, got ${bucket}`,
    );
  }
  if (classification !== "SAFE_DELETE") {
    throw new Error(
      `remove blocked: classification is ${classification} for ${objectPath}`,
    );
  }
  if (objectPath.startsWith("catalog/")) {
    throw new Error(`remove blocked: catalog/ protected — ${objectPath}`);
  }
  if (objectPath.startsWith("platform/")) {
    throw new Error(`remove blocked: platform/ protected — ${objectPath}`);
  }
  const parsed = parsePath(objectPath);
  if (parsed.path_kind !== "user") {
    throw new Error(
      `remove blocked: only user/* may be deleted (got ${parsed.path_kind}) — ${objectPath}`,
    );
  }
}

/** Build classify DB context from injected deps (shared by classify + delete re-check). */
async function loadClassifyDbContext(
  deps: OrphanCleanupDeps,
): Promise<{
  ctx: ClassifyDbContext;
  platformLiveAssetCount: number;
}> {
  const ctxBundle = await deps.loadClassifyContext();
  const { platformLiveAssetCount, ...ctxBase } = ctxBundle;
  return {
    platformLiveAssetCount,
    ctx: {
      ...ctxBase,
      deletedBeatIds: new Set([
        ...ctxBase.deletedBeatIds,
        ...deps.getDeletedBeatIds(),
      ]),
    },
  };
}

/** Classify using injected inventory + DB context (no production client). */
export async function classifyWithDepsAsync(deps: OrphanCleanupDeps): Promise<{
  rows: ClassRow[];
  summary: Record<string, unknown>;
}> {
  const inv = deps.getInventory();
  const { ctx, platformLiveAssetCount } = await loadClassifyDbContext(deps);

  const rows: ClassRow[] = inv.map((o) =>
    classifyBeatAudioOrphanObject(o, ctx),
  );

  const summary: Record<string, unknown> = {
    total: rows.length,
    SAFE_DELETE: rows.filter((r) => r.classification === "SAFE_DELETE").length,
    KEEP: rows.filter((r) => r.classification === "KEEP").length,
    UNKNOWN: rows.filter((r) => r.classification === "UNKNOWN").length,
    in_allowlist: rows.filter((r) => r.in_deleted_beat_allowlist).length,
    platform_live_assets: platformLiveAssetCount,
    take_audio_note:
      "take-audio unmatched objects are OUT OF DELETE SCOPE this GO; unmapped preserved = KEEP/UNKNOWN",
    catalog_note:
      "catalog/* is always KEEP — never SAFE_DELETE (P0 catalog safety)",
  };

  deps.onClassification?.({ summary, rows });
  return { rows, summary };
}

/**
 * Shared delete phase (same gates + batching as production execute).
 * Claimed SAFE_DELETE rows are re-classified with injected deps before any remove
 * (R1: forged / stale SAFE_DELETE cannot bypass classifyBeatAudioOrphanObject).
 */
export async function executeDeletePhaseWithDeps(
  deps: OrphanCleanupDeps,
  rows: ClassRow[],
  summary: Record<string, unknown>,
): Promise<{ deleted: number }> {
  const abort = deps.abort;
  const batchSize = deps.batchSize ?? DEFAULT_ORPHAN_BATCH_SIZE;

  if (
    (typeof summary.KEEP === "number" && summary.KEEP > 0) ||
    (typeof summary.UNKNOWN === "number" && summary.UNKNOWN > 0)
  ) {
    console.log(
      `NOTE: KEEP=${summary.KEEP} UNKNOWN=${summary.UNKNOWN} will not be deleted`,
    );
  }

  const claimed = rows.filter((r) => r.classification === "SAFE_DELETE");
  const { ctx } = await loadClassifyDbContext(deps);
  const candidates: ClassRow[] = [];
  for (const row of claimed) {
    const fresh = classifyBeatAudioOrphanObject(
      {
        object_path: row.object_path,
        size_bytes: row.size_bytes,
        created_at: row.created_at,
      },
      ctx,
    );
    if (fresh.classification !== "SAFE_DELETE") {
      abort(
        `claimed SAFE_DELETE failed re-classification: ${row.object_path} → ${fresh.classification}`,
      );
    }
    candidates.push(fresh);
  }

  for (const row of candidates) {
    try {
      assertKeySafeToRemove({
        bucket: row.bucket,
        objectPath: row.object_path,
        classification: row.classification,
      });
    } catch (e) {
      abort(
        `SAFE_DELETE list failed pre-remove gate: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  const toDelete = candidates.map((r) => r.object_path);
  if (toDelete.some((p) => p.startsWith("platform/"))) {
    abort("SAFE_DELETE contains platform/ — abort");
  }
  if (toDelete.some((p) => p.startsWith("catalog/"))) {
    abort("SAFE_DELETE contains catalog/ — abort");
  }
  if (toDelete.some((p) => p.includes(DAWID))) {
    abort("SAFE_DELETE contains Dawid path — abort");
  }

  const requiredPlatformCount = deps.requiredPlatformAssetCount;
  if (requiredPlatformCount != null) {
    const platKeys = await deps.getPlatformAssetKeys();
    if (platKeys.length !== requiredPlatformCount) {
      abort(
        `Expected ${requiredPlatformCount} platform assets, got ${platKeys.length}`,
      );
    }
  }

  console.log(`Deleting ${toDelete.length} SAFE_DELETE beat-audio objects...`);
  const batchReports: OrphanBatchRemoveReport[] = [];
  let deleted = 0;

  const emitBatchReport = (report: OrphanBatchRemoveReport): void => {
    batchReports.push(report);
    deps.onBatchReport?.(report);
    console.log(JSON.stringify({ orphan_batch: report }));
  };

  const failStopAfterRemoveAttempts = (message: string): never => {
    const failEvidence = {
      finished_at: new Date().toISOString(),
      outcome: "FAIL_STOP",
      orphan_cleanup_pass: false,
      summary_pre: summary,
      batches: batchReports,
      claimed_ok_path_count: deleted,
      note:
        "FAIL_STOP after one or more storageRemove attempts. Earlier OK batches are not rolled back. claimed_ok_path_count is client-reported path count for OK batches only — not independently verified Storage state. Partial mutation may have occurred. No automatic retry or resume.",
    };
    deps.onEvidence?.(failEvidence);
    console.log(JSON.stringify(failEvidence, null, 2));
    console.log(
      "ORPHAN CLEANUP FAIL_STOP — partial Storage mutation may have occurred; not a PASS",
    );
    return abort(message);
  };

  for (let i = 0; i < toDelete.length; i += batchSize) {
    const chunk = toDelete.slice(i, i + batchSize);
    const batchIndex = i / batchSize + 1;
    for (const objectPath of chunk) {
      try {
        assertKeySafeToRemove({
          bucket: BEAT_AUDIO_ORPHAN_BUCKET,
          objectPath,
          classification: "SAFE_DELETE",
        });
      } catch (e) {
        abort(
          `pre-remove abort (no further deletes): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    let removeResult: { error: { message: string } | null };
    try {
      removeResult = await deps.storageRemove(
        BEAT_AUDIO_ORPHAN_BUCKET,
        chunk,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emitBatchReport({
        batch_index: batchIndex,
        path_count: chunk.length,
        paths: [...chunk],
        status: "AMBIGUOUS",
        error_message: msg,
        storage_state_independently_verified: false,
      });
      return failStopAfterRemoveAttempts(
        `remove batch threw — aborting further deletes (Storage state for this batch unknown): ${msg}`,
      );
    }

    if (removeResult.error) {
      emitBatchReport({
        batch_index: batchIndex,
        path_count: chunk.length,
        paths: [...chunk],
        status: "ERROR",
        error_message: removeResult.error.message,
        storage_state_independently_verified: false,
      });
      return failStopAfterRemoveAttempts(
        `remove batch failed — aborting further deletes (Storage state for this batch unverified/possibly partial): ${removeResult.error.message}`,
      );
    }

    emitBatchReport({
      batch_index: batchIndex,
      path_count: chunk.length,
      paths: [...chunk],
      status: "OK",
      storage_state_independently_verified: false,
    });
    deleted += chunk.length;
  }

  if (requiredPlatformCount != null) {
    const platKeys = await deps.getPlatformAssetKeys();
    for (const objectKey of platKeys) {
      const ok = await deps.objectExists(BEAT_AUDIO_ORPHAN_BUCKET, objectKey);
      if (!ok) {
        abort(`PLATFORM object missing after cleanup: ${objectKey}`);
      }
    }
  }

  if (deps.verifyUnmappedTake !== false) {
    const takeKey = deps.unmappedTakeKey ?? UNMAPPED_TAKE;
    const ok = await deps.objectExists("take-audio", takeKey);
    if (!ok) {
      abort("Unmapped take-audio missing after cleanup");
    }
  }

  const counts = await deps.countBeatsAndAssets();
  const evidence = {
    finished_at: new Date().toISOString(),
    outcome: "PASS",
    orphan_cleanup_pass: true,
    summary_pre: summary,
    deleted_count: deleted,
    deleted_count_note:
      "Client-reported sum of paths in OK batches only — not an independent Storage existence verification",
    batches: batchReports,
    db_after: { beats: counts.beats, assets: counts.assets },
    platform_assets_verified: requiredPlatformCount,
    unmapped_take_preserved: deps.verifyUnmappedTake !== false,
  };
  deps.onEvidence?.(evidence);
  console.log(JSON.stringify(evidence, null, 2));
  console.log("ORPHAN CLEANUP PASS");
  return { deleted };
}

/** Full execute path with injected deps (tests) or production deps (CLI). */
export async function executeWithDeps(
  deps: OrphanCleanupDeps,
): Promise<{ deleted: number; rows: ClassRow[]; summary: Record<string, unknown> }> {
  const { rows, summary } = await classifyWithDepsAsync(deps);
  const { deleted } = await executeDeletePhaseWithDeps(deps, rows, summary);
  return { deleted, rows, summary };
}

function createProductionDeps(): OrphanCleanupDeps {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) stop("Missing Supabase env");

  const admin: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    abort: stop,
    getInventory: () => {
      const invPath = join(OUT, "_orphan_beat_audio_inventory.json");
      if (!existsSync(invPath)) {
        stop(
          `Missing ${invPath}. Run inventory export first (agent writes this file).`,
        );
      }
      return JSON.parse(readFileSync(invPath, "utf8")) as InventoryObject[];
    },
    getDeletedBeatIds: () =>
      (
        JSON.parse(readFileSync(ALLOWLIST_BEATS, "utf8")) as {
          delete_beat_ids: string[];
        }
      ).delete_beat_ids,
    loadClassifyContext: async () => {
      const { data: assets, error: aErr } = await admin
        .from("beat_audio_assets")
        .select("id,object_key,beat_id");
      if (aErr) stop(aErr.message);
      const assetKeys = new Set(
        (assets ?? []).map((a) => a.object_key as string),
      );
      const assetIds = new Set((assets ?? []).map((a) => a.id as string));
      const assetBeatIds = new Set(
        (assets ?? []).map((a) => a.beat_id as string),
      );

      const { data: beats, error: bErr } = await admin
        .from("beats")
        .select("id,ownership_type");
      if (bErr) stop(bErr.message);
      const liveBeats = new Set((beats ?? []).map((b) => b.id as string));
      const platformBeats = new Set(
        (beats ?? [])
          .filter((b) => b.ownership_type === "PLATFORM")
          .map((b) => b.id as string),
      );

      const { data: takes, error: tErr } = await admin
        .from("takes")
        .select("id,object_key,beat_id");
      if (tErr) stop(tErr.message);
      const takeKeys = new Set(
        (takes ?? []).map((t) => t.object_key).filter(Boolean) as string[],
      );
      const takeIds = new Set((takes ?? []).map((t) => t.id as string));

      const { data: clips, error: cErr } = await admin
        .from("studio_clips")
        .select("id,source_beat_id,source_take_id");
      if (cErr) stop(cErr.message);

      const { data: projects, error: pErr } = await admin
        .from("studio_projects")
        .select("id,beat_id");
      if (pErr) stop(pErr.message);

      const { data: artifacts, error: artErr } = await admin
        .from("audio_artifacts")
        .select("id,object_key");
      if (artErr) stop(artErr.message);
      const artifactKeys = new Set(
        (artifacts ?? []).map((a) => a.object_key).filter(Boolean) as string[],
      );

      return {
        assetKeys,
        assetIds,
        liveBeats,
        platformBeats,
        takeKeys,
        takeIds,
        artifactKeys,
        deletedBeatIds: new Set<string>(),
        clips: (clips ?? []) as Array<{ source_beat_id: string | null }>,
        projects: (projects ?? []) as Array<{ beat_id: string | null }>,
        platformLiveAssetCount: assetBeatIds.size,
      };
    },
    storageRemove: async (bucket, paths) => {
      const { error } = await admin.storage.from(bucket).remove(paths);
      return { error: error ? { message: error.message } : null };
    },
    getPlatformAssetKeys: async () => {
      const { data, error } = await admin
        .from("beat_audio_assets")
        .select("object_key")
        .like("object_key", "platform/%");
      if (error) stop(error.message);
      return (data ?? []).map((r) => r.object_key as string);
    },
    objectExists: async (bucket, objectKey) => {
      const parts = objectKey.split("/");
      const name = parts.pop()!;
      const prefix = parts.join("/");
      const { data, error } = await admin.storage
        .from(bucket)
        .list(prefix, { search: name, limit: 20 });
      if (error) stop(error.message);
      return (data ?? []).some((o) => o.name === name);
    },
    countBeatsAndAssets: async () => {
      const { count: beats } = await admin
        .from("beats")
        .select("*", { count: "exact", head: true });
      const { count: assets } = await admin
        .from("beat_audio_assets")
        .select("*", { count: "exact", head: true });
      return { beats: beats ?? null, assets: assets ?? null };
    },
    onClassification: ({ summary, rows }) => {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(
        CLASS_PATH,
        JSON.stringify(
          { classified_at: new Date().toISOString(), summary, rows },
          null,
          2,
        ),
      );
      console.log(JSON.stringify(summary, null, 2));
    },
    onEvidence: (evidence) => {
      writeFileSync(
        join(OUT, "PRODUCTION_STORAGE_ORPHAN_CLEANUP_EVIDENCE.json"),
        JSON.stringify(evidence, null, 2),
      );
    },
    batchSize: DEFAULT_ORPHAN_BATCH_SIZE,
    requiredPlatformAssetCount: 17,
    verifyUnmappedTake: true,
    unmappedTakeKey: UNMAPPED_TAKE,
  };
}

async function classifyCli() {
  const deps = createProductionDeps();
  await classifyWithDepsAsync(deps);
}

async function executeCli() {
  const deps = createProductionDeps();
  await executeWithDeps(deps);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--execute")) {
    await executeCli();
    return;
  }
  if (args.includes("--classify")) {
    await classifyCli();
    return;
  }
  stop("Pass --classify or --execute");
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
