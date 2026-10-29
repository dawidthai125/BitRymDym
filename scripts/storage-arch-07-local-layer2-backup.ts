/**
 * STORAGE-ARCH-07 — PHASE LOCAL-BACKUP-IMPLEMENTATION
 *
 * Windows Owner PC pulls VPS Layer-1 → C:\BitRymDym-Backup\
 * READ-ONLY on Supabase + VPS content. No delete propagation. No restore drill.
 *
 * Usage:
 *   npx tsx scripts/storage-arch-07-local-layer2-backup.ts --execute
 */

import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  unlinkSync,
  readdirSync,
  statSync,
  rmSync,
  openSync,
  closeSync,
  fsyncSync,
} from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  SA07_EXPECTED_INVENTORY,
  SA07_SOURCE_BUCKET,
  SA07_VPS_BACKUP_ROOT,
  assertSafeSourceObjectKey,
  classifyBeatAudioObject,
  type BackupClassification,
} from "../src/lib/storage/backup-manifest";

const LOCAL_ROOT = "C:\\BitRymDym-Backup";
const EXPECTED_BYTES = 111574892;

type ProdRow = {
  object_key: string;
  size_bytes: number;
  content_type: string;
  etag: string | null;
  classification: BackupClassification;
  owner_user_id: string | null;
  owner_user_number: number | null;
};

type VpsManifest = {
  backup_run_id?: string;
  source_bucket?: string;
  source_object_key?: string;
  source_version_id?: string | null;
  source_size?: number;
  source_content_type?: string;
  source_etag?: string | null;
  source_sha256?: string;
  destination_sha256?: string;
  classification?: string;
  owner_user_id?: string | null;
  owner_user_number?: number | null;
  backup_object_path?: string;
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
      ) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
  }
  return out;
}

function run(
  cmd: string,
  args: string[],
  opts?: { maxBuffer?: number },
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: opts?.maxBuffer ?? 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function sha256File(path: string): string {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    if (!existsSync(cur)) continue;
    for (const name of readdirSync(cur)) {
      const p = join(cur, name);
      const st = statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (st.isFile()) out.push(p);
    }
  }
  return out;
}

function atomicPromote(tmpPath: string, finalPath: string): void {
  mkdirSync(dirname(finalPath), { recursive: true });
  const fd = openSync(tmpPath, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (existsSync(finalPath)) {
    const existingSha = sha256File(finalPath);
    const tmpSha = sha256File(tmpPath);
    if (existingSha === tmpSha) {
      unlinkSync(tmpPath);
      return;
    }
    const retained = `${finalPath}.retained-${Date.now()}-${existingSha.slice(0, 12)}`;
    renameSync(finalPath, retained);
  }
  renameSync(tmpPath, finalPath);
}

async function listAll(
  admin: SupabaseClient,
  prefix = "",
): Promise<
  Array<{
    object_key: string;
    size_bytes: number;
    content_type: string;
    etag: string | null;
  }>
> {
  const out: Array<{
    object_key: string;
    size_bytes: number;
    content_type: string;
    etag: string | null;
  }> = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await admin.storage.from("beat-audio").list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id == null) {
        out.push(...(await listAll(admin, path)));
      } else {
        out.push({
          object_key: path,
          size_bytes: Number(entry.metadata?.size ?? 0),
          content_type:
            (entry.metadata?.mimetype as string | undefined) ??
            (entry.metadata?.contentType as string | undefined) ??
            "application/octet-stream",
          etag: (entry.metadata?.eTag as string | undefined) ?? null,
        });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function buildProductionInventory(
  admin: SupabaseClient,
): Promise<{
  inventory: {
    USER: number;
    PLATFORM: number;
    ORPHAN: number;
    UNKNOWN: number;
    TOTAL: number;
    BYTES: number;
  };
  rows: ProdRow[];
}> {
  const listed = await listAll(admin);
  const { data: assets, error } = await admin
    .from("beat_audio_assets")
    .select("object_key, beat_id")
    .eq("storage_bucket", "beat-audio")
    .eq("is_active", true);
  if (error) throw error;
  const refs = new Map(
    (assets ?? []).map((a) => [a.object_key as string, a.beat_id as string]),
  );

  const beatIds = [...new Set([...refs.values()].filter(Boolean))];
  const owners = new Map<
    string,
    { owner_id: string; user_number: number | null }
  >();
  if (beatIds.length) {
    const { data: beats, error: berr } = await admin
      .from("beats")
      .select("id, owner_id")
      .in("id", beatIds);
    if (berr) throw berr;
    const ownerIds = [
      ...new Set((beats ?? []).map((b) => b.owner_id as string).filter(Boolean)),
    ];
    const { data: profiles, error: perr } = await admin
      .from("profiles")
      .select("id, user_number")
      .in("id", ownerIds);
    if (perr) throw perr;
    const profileMap = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        p.user_number == null ? null : Number(p.user_number),
      ]),
    );
    for (const b of beats ?? []) {
      owners.set(b.id as string, {
        owner_id: b.owner_id as string,
        user_number: profileMap.get(b.owner_id as string) ?? null,
      });
    }
  }

  const inventory = {
    USER: 0,
    PLATFORM: 0,
    ORPHAN: 0,
    UNKNOWN: 0,
    TOTAL: 0,
    BYTES: 0,
  };
  const rows: ProdRow[] = [];
  for (const obj of listed) {
    assertSafeSourceObjectKey(obj.object_key);
    const dbRefs = refs.has(obj.object_key) ? 1 : 0;
    const classification = classifyBeatAudioObject({
      objectKey: obj.object_key,
      dbRefsCount: dbRefs,
    });
    inventory[classification] += 1;
    inventory.TOTAL += 1;
    inventory.BYTES += obj.size_bytes;

    let owner_user_id: string | null = null;
    let owner_user_number: number | null = null;
    if (classification === "USER") {
      const beatId = refs.get(obj.object_key);
      const o = beatId ? owners.get(beatId) : undefined;
      owner_user_id = o?.owner_id ?? null;
      owner_user_number = o?.user_number ?? null;
    }
    if (classification === "UNKNOWN") {
      throw new Error(`STOP: UNKNOWN classification: ${obj.object_key}`);
    }
    rows.push({
      object_key: obj.object_key,
      size_bytes: obj.size_bytes,
      content_type: obj.content_type,
      etag: obj.etag,
      classification,
      owner_user_id,
      owner_user_number,
    });
  }
  return { inventory, rows };
}

function assertInventory(inv: {
  USER: number;
  PLATFORM: number;
  ORPHAN: number;
  UNKNOWN: number;
  TOTAL: number;
  BYTES: number;
}): void {
  if (
    inv.TOTAL !== SA07_EXPECTED_INVENTORY.TOTAL ||
    inv.USER !== SA07_EXPECTED_INVENTORY.USER ||
    inv.PLATFORM !== SA07_EXPECTED_INVENTORY.PLATFORM ||
    inv.ORPHAN !== SA07_EXPECTED_INVENTORY.ORPHAN ||
    inv.UNKNOWN !== 0 ||
    inv.BYTES !== EXPECTED_BYTES
  ) {
    throw new Error(
      `STOP: DRIFT DETECTED inventory=${JSON.stringify(inv)} expected=${JSON.stringify({ ...SA07_EXPECTED_INVENTORY, UNKNOWN: 0, BYTES: EXPECTED_BYTES })}`,
    );
  }
}

function hardenAcl(root: string): string {
  const user = process.env.USERNAME || process.env.USER || "Owner";
  const r1 = run("icacls", [root, "/inheritance:r"]);
  const r2 = run("icacls", [
    root,
    "/grant:r",
    `${user}:(OI)(CI)F`,
    "SYSTEM:(OI)(CI)F",
  ]);
  const r3 = run("icacls", [root]);
  return [
    `inheritance:r status=${r1.status}`,
    `grant status=${r2.status} stderr=${r2.stderr.trim()}`,
    r3.stdout.trim(),
  ].join("\n");
}

function ssh(
  sshKey: string,
  sshHost: string,
  remoteCmd: string,
): { status: number | null; stdout: string; stderr: string } {
  return run("ssh", [
    "-i",
    sshKey,
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=20",
    sshHost,
    remoteCmd,
  ]);
}

async function main(): Promise<void> {
  if (!process.argv.includes("--execute")) {
    throw new Error("refusing: pass --execute");
  }

  const startedAt = new Date().toISOString();
  const backupRunId = `local-layer2-full-${startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${randomBytes(4).toString("hex")}`;

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("MISSING_SUPABASE_ENV");

  const sshKey =
    process.env.SA07_SSH_KEY ||
    join(
      process.env.USERPROFILE || process.env.HOME || "",
      ".ssh",
      "sa07-backup-host-key",
    );
  const sshHost = (process.env.SA07_SSH_HOST ?? (() => { throw new Error("STOP: set SA07_SSH_HOST (user@host)"); })());

  if (!existsSync(sshKey)) throw new Error(`STOP: SSH key missing: ${sshKey}`);
  if (existsSync(LOCAL_ROOT)) {
    const existing = walkFiles(LOCAL_ROOT);
    if (existing.length > 0) {
      // allow resume only if under our structure; refuse unknown collision content later via SHA path
    }
  }

  const free = run("powershell", [
    "-NoProfile",
    "-Command",
    "(Get-PSDrive C).Free",
  ]);
  const freeBytes = Number((free.stdout || "").trim());
  if (!Number.isFinite(freeBytes) || freeBytes < EXPECTED_BYTES * 3) {
    throw new Error(`STOP: insufficient free space free=${free.stdout.trim()}`);
  }

  const hostCheck = ssh(sshKey, sshHost, "echo HOST_OK && hostname");
  if (hostCheck.status !== 0 || !hostCheck.stdout.includes("HOST_OK")) {
    throw new Error(`STOP: SSH failed: ${hostCheck.stderr}`);
  }

  const vpsProbe = ssh(
    sshKey,
    sshHost,
    [
      "set -e",
      `OBJ=$(sudo find ${SA07_VPS_BACKUP_ROOT}/objects -type f | wc -l)`,
      `MAN=$(sudo find ${SA07_VPS_BACKUP_ROOT}/manifests -type f | wc -l)`,
      `BYTES=$(sudo du -sb ${SA07_VPS_BACKUP_ROOT}/objects | awk '{print $1}')`,
      'echo "OBJECT_FILES=$OBJ"',
      'echo "MANIFEST_FILES=$MAN"',
      'echo "OBJECT_BYTES=$BYTES"',
    ].join("; "),
  );
  if (vpsProbe.status !== 0) {
    throw new Error(`STOP: VPS probe failed: ${vpsProbe.stderr}`);
  }
  const objMatch = /OBJECT_FILES=(\d+)/.exec(vpsProbe.stdout);
  const manMatch = /MANIFEST_FILES=(\d+)/.exec(vpsProbe.stdout);
  const bytesMatch = /OBJECT_BYTES=(\d+)/.exec(vpsProbe.stdout);
  const vpsObjects = Number(objMatch?.[1] ?? -1);
  const vpsManifests = Number(manMatch?.[1] ?? -1);
  const vpsBytes = Number(bytesMatch?.[1] ?? -1);
  if (
    vpsObjects !== 43 ||
    vpsManifests !== 43 ||
    vpsBytes !== EXPECTED_BYTES
  ) {
    throw new Error(
      `STOP: VPS inventory mismatch objects=${vpsObjects} manifests=${vpsManifests} bytes=${vpsBytes}`,
    );
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { inventory, rows } = await buildProductionInventory(admin);
  assertInventory(inventory);
  const prodByKey = new Map(rows.map((r) => [r.object_key, r]));

  // Create local tree
  for (const sub of ["objects", "manifests", "restore-drills", "logs", ".staging"]) {
    mkdirSync(join(LOCAL_ROOT, sub), { recursive: true });
  }
  writeFileSync(
    join(LOCAL_ROOT, "README.txt"),
    [
      "BitRymDym Storage Layer-2 independent copy",
      "DO NOT DELETE blindly. NO delete propagation from VPS/Supabase.",
      "Not Object Lock / WORM.",
      `Created run: ${backupRunId}`,
      "",
    ].join("\r\n"),
    "utf8",
  );
  const aclEvidence = hardenAcl(LOCAL_ROOT);

  const stagingRoot = join(LOCAL_ROOT, ".staging", backupRunId);
  mkdirSync(stagingRoot, { recursive: true });

  // Pull via sudo tar (objects are 0600 bitrymdym-backup; ubuntu cannot scp directly)
  const tarPull = spawnSync(
    "ssh",
    [
      "-i",
      sshKey,
      "-o",
      "BatchMode=yes",
      sshHost,
      `sudo tar -C ${SA07_VPS_BACKUP_ROOT} -cf - objects manifests`,
    ],
    {
      encoding: "buffer",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (tarPull.status !== 0) {
    throw new Error(
      `STOP: tar pull failed status=${tarPull.status} stderr=${tarPull.stderr?.toString() ?? ""}`,
    );
  }
  const tarPath = join(stagingRoot, "vps-layer1.tar");
  writeFileSync(tarPath, tarPull.stdout as Buffer);
  const extract = run("tar", ["-xf", tarPath, "-C", stagingRoot]);
  if (extract.status !== 0) {
    throw new Error(`STOP: tar extract failed: ${extract.stderr}`);
  }

  const stagedObjectsRoot = join(stagingRoot, "objects", "beat-audio");
  const stagedManifestsRoot = join(stagingRoot, "manifests");
  if (!existsSync(stagedObjectsRoot) || !existsSync(stagedManifestsRoot)) {
    throw new Error("STOP: staging missing objects/ or manifests/");
  }

  const stagedObjectFiles = walkFiles(stagedObjectsRoot);
  if (stagedObjectFiles.length !== 43) {
    throw new Error(
      `STOP: staged objects ${stagedObjectFiles.length} ≠ 43`,
    );
  }

  // Index VPS manifests by object key (latest created_at wins)
  const manifestByKey = new Map<string, VpsManifest & { _file: string }>();
  for (const mf of walkFiles(stagedManifestsRoot)) {
    if (!mf.endsWith(".json")) continue;
    const raw = JSON.parse(readFileSync(mf, "utf8")) as VpsManifest;
    const k = raw.source_object_key;
    if (!k) continue;
    const prev = manifestByKey.get(k);
    if (!prev) {
      manifestByKey.set(k, { ...raw, _file: mf });
      continue;
    }
    const prevT = Date.parse(String((prev as { created_at?: string }).created_at ?? 0));
    const nextT = Date.parse(String((raw as { created_at?: string }).created_at ?? 0));
    if (nextT >= prevT) manifestByKey.set(k, { ...raw, _file: mf });
  }
  if (manifestByKey.size !== 43) {
    throw new Error(
      `STOP: unique VPS manifests by key ${manifestByKey.size} ≠ 43`,
    );
  }

  type ResultRow = {
    object_key: string;
    action: "COPY" | "SKIP";
    classification: BackupClassification;
    source_sha256: string;
    local_sha256: string;
    size_bytes: number;
    destination_path: string;
    verification_status: "SHA_VERIFIED";
  };
  const results: ResultRow[] = [];
  let copied = 0;
  let skipped = 0;
  let shaPass = 0;
  let mismatch = 0;

  for (const staged of stagedObjectFiles) {
    const rel = relative(join(stagingRoot, "objects", "beat-audio"), staged)
      .split(sep)
      .join("/");
    assertSafeSourceObjectKey(rel);
    const prod = prodByKey.get(rel);
    if (!prod) {
      throw new Error(`STOP: staged object not in production inventory: ${rel}`);
    }
    const man = manifestByKey.get(rel);
    if (!man) {
      throw new Error(`STOP: no VPS manifest for ${rel}`);
    }
    const expectedSha = (man.destination_sha256 || man.source_sha256 || "")
      .toLowerCase()
      .trim();
    if (!/^[a-f0-9]{64}$/.test(expectedSha)) {
      throw new Error(`STOP: bad SHA in VPS manifest for ${rel}`);
    }
    if (man.source_size != null && man.source_size !== prod.size_bytes) {
      throw new Error(
        `STOP: size drift prod vs VPS manifest ${rel}: ${prod.size_bytes} vs ${man.source_size}`,
      );
    }
    const st = statSync(staged);
    if (st.size !== prod.size_bytes) {
      throw new Error(
        `STOP: staged size ${st.size} ≠ prod ${prod.size_bytes} for ${rel}`,
      );
    }

    const localSha = sha256File(staged);
    if (localSha !== expectedSha) {
      mismatch += 1;
      throw new Error(
        `STOP: SHA mismatch ${rel} local=${localSha} vps=${expectedSha}`,
      );
    }
    shaPass += 1;

    const finalPath = join(LOCAL_ROOT, "objects", "beat-audio", ...rel.split("/"));
    let action: "COPY" | "SKIP" = "COPY";
    if (existsSync(finalPath)) {
      const existing = sha256File(finalPath);
      if (existing === expectedSha) {
        action = "SKIP";
        skipped += 1;
        unlinkSync(staged);
      } else {
        // retain old, promote new
        const tmp = `${finalPath}.tmp-${backupRunId}`;
        copyFileSync(staged, tmp);
        unlinkSync(staged);
        atomicPromote(tmp, finalPath);
        copied += 1;
      }
    } else {
      const tmp = `${finalPath}.tmp-${backupRunId}`;
      mkdirSync(dirname(finalPath), { recursive: true });
      copyFileSync(staged, tmp);
      unlinkSync(staged);
      atomicPromote(tmp, finalPath);
      copied += 1;
    }

    const localManifest = {
      backup_run_id: backupRunId,
      backup_timestamp: new Date().toISOString(),
      source_bucket: SA07_SOURCE_BUCKET,
      source_object_key: rel,
      size: prod.size_bytes,
      content_type: prod.content_type,
      version_id: man.source_version_id ?? null,
      etag: prod.etag ?? man.source_etag ?? null,
      classification: prod.classification,
      owner_user_id: prod.owner_user_id,
      owner_user_number: prod.owner_user_number,
      source_sha256: expectedSha,
      local_sha256: localSha,
      backup_source: "vps-layer1",
      vps_object_path:
        man.backup_object_path ??
        `${SA07_VPS_BACKUP_ROOT}/objects/beat-audio/${rel}`,
      destination_path: finalPath,
      verification_status: "SHA_VERIFIED" as const,
      vps_manifest_run_id: man.backup_run_id ?? null,
    };
    const manDir = join(LOCAL_ROOT, "manifests", backupRunId);
    mkdirSync(manDir, { recursive: true });
    const manName = `${prod.classification.toLowerCase()}-${createHash("sha256").update(rel).digest("hex").slice(0, 16)}.json`;
    writeFileSync(join(manDir, manName), JSON.stringify(localManifest, null, 2), "utf8");

    results.push({
      object_key: rel,
      action,
      classification: prod.classification,
      source_sha256: expectedSha,
      local_sha256: localSha,
      size_bytes: prod.size_bytes,
      destination_path: finalPath,
      verification_status: "SHA_VERIFIED",
    });
  }

  // Final local counts
  const localObjects = walkFiles(join(LOCAL_ROOT, "objects"));
  const localManifestFiles = walkFiles(join(LOCAL_ROOT, "manifests", backupRunId));
  let localBytes = 0;
  for (const f of localObjects) localBytes += statSync(f).size;

  if (localObjects.length !== 43 || localManifestFiles.length !== 43) {
    throw new Error(
      `STOP: local counts objects=${localObjects.length} manifests=${localManifestFiles.length}`,
    );
  }
  if (localBytes !== EXPECTED_BYTES) {
    throw new Error(`STOP: local bytes ${localBytes} ≠ ${EXPECTED_BYTES}`);
  }
  if (shaPass !== 43 || mismatch !== 0) {
    throw new Error(`STOP: shaPass=${shaPass} mismatch=${mismatch}`);
  }

  // Reconcile key sets
  const localKeys = new Set(
    localObjects.map((p) =>
      relative(join(LOCAL_ROOT, "objects", "beat-audio"), p).split(sep).join("/"),
    ),
  );
  for (const k of prodByKey.keys()) {
    if (!localKeys.has(k)) throw new Error(`STOP: missing local key ${k}`);
  }
  if (localKeys.size !== 43) throw new Error("STOP: local key set ≠ 43");

  // PRODUCTION vs VPS: keys+sizes via manifests; SHA via VPS
  let prodVpsIdentity = 0;
  for (const [k, prod] of prodByKey) {
    const man = manifestByKey.get(k);
    if (!man) throw new Error(`STOP: VPS missing ${k}`);
    if (man.source_size !== prod.size_bytes) {
      throw new Error(`STOP: PROD↔VPS size ${k}`);
    }
    prodVpsIdentity += 1;
  }

  // BitLocker probe (no elevation)
  const bl = run("powershell", [
    "-NoProfile",
    "-Command",
    "try { (Get-BitLockerVolume -MountPoint 'C:' -ErrorAction Stop).ProtectionStatus } catch { 'UNKNOWN:' + $_.Exception.Message }",
  ]);
  const bitlockerRaw = (bl.stdout || "").trim();
  const bitlocker =
    bitlockerRaw.startsWith("UNKNOWN") || bitlockerRaw.length === 0
      ? "UNKNOWN / SECURITY FINDING"
      : bitlockerRaw;

  const endedAt = new Date().toISOString();
  const evidence = {
    tool: "storage-arch-07-local-layer2-backup",
    phase: "LOCAL-BACKUP-IMPLEMENTATION",
    backup_run_id: backupRunId,
    status: "PASS",
    started_at: startedAt,
    ended_at: endedAt,
    claim: "LOCAL Layer-2 43/43 COPIED · SHA VERIFIED · MANIFEST VERIFIED",
    not_claimed: [
      "RESTORE VERIFIED",
      "FULL DR VERIFIED",
      "INDEPENDENT DR VERIFIED",
      "ARCH-05 SAFE",
      "ORPHAN SAFE FOR DELETE",
      "BITLOCKER ENCRYPTED",
    ],
    inventory: {
      USER: inventory.USER,
      PLATFORM: inventory.PLATFORM,
      ORPHAN: inventory.ORPHAN,
      UNKNOWN: inventory.UNKNOWN,
      TOTAL: inventory.TOTAL,
      BYTES: inventory.BYTES,
    },
    vps: {
      objects: vpsObjects,
      manifests: vpsManifests,
      bytes: vpsBytes,
    },
    local: {
      path: LOCAL_ROOT,
      objects: localObjects.length,
      manifests: localManifestFiles.length,
      bytes: localBytes,
    },
    results_summary: {
      COPY: copied,
      SKIP: skipped,
      SHA_VERIFIED: shaPass,
      MANIFEST_VERIFIED: localManifestFiles.length,
      FAILED: 0,
      MISMATCH: mismatch,
      DELETE: 0,
    },
    reconciliation: {
      production_vs_vps_identity: `${prodVpsIdentity}/43`,
      vps_vs_local_sha: `${shaPass}/43`,
      production_vs_local_identity: `${localKeys.size}/43`,
      total_bytes: EXPECTED_BYTES,
    },
    delete_propagation: "DISABLED",
    restore: "0/43",
    arch05: "NOT READY",
    bitlocker,
    acl_evidence: aclEvidence,
    ssh_host: sshHost,
    transfer: "WINDOWS_PULL_sudo_tar_over_ssh",
    production_mutations: {
      storage_delete: 0,
      db_mutation: 0,
      auth_mutation: 0,
      vps_delete: 0,
      aws_mutation: 0,
    },
    results,
  };

  const logPath = join(LOCAL_ROOT, "logs", `${backupRunId}.json`);
  writeFileSync(logPath, JSON.stringify(evidence, null, 2), "utf8");

  const repoEvidence = join(
    process.cwd(),
    "docs",
    "audits",
    "STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION_EVIDENCE.json",
  );
  // Strip per-object destination absolute paths duplication is fine; no secrets
  writeFileSync(repoEvidence, JSON.stringify(evidence, null, 2), "utf8");

  // Cleanup staging tar (retain staging until success verified — remove tar only)
  try {
    unlinkSync(tarPath);
  } catch {
    /* ignore */
  }
  try {
    rmSync(stagingRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.log(JSON.stringify({
    status: "PASS",
    backup_run_id: backupRunId,
    copied,
    skipped,
    sha_verified: shaPass,
    manifests: localManifestFiles.length,
    local_path: LOCAL_ROOT,
    log: logPath,
    repo_evidence: repoEvidence,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
