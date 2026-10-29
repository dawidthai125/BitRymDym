// NOTE (public repo): canary identities and backup host are REDACTED — supply real values locally (SA07_SSH_HOST env; edit allowlist in a private copy).
/**
 * STORAGE-ARCH-07 Phase 6 — full VPS Layer-1 backup expansion (exactly 40 new copies).
 *
 * READ-ONLY on Supabase Storage. Writes only to /srv/bitrymdym-backup via SSH.
 * Hard-stops if allowlist ≠ 40, planner would COPY >40, or final objects ≠ 43.
 *
 * Usage:
 *   npx tsx scripts/storage-arch-07-phase6-full-backup.ts --execute
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  SA07_EXPECTED_INVENTORY,
  SA07_SOURCE_BUCKET,
  SA07_VPS_BACKUP_ROOT,
  assertSafeSourceObjectKey,
  classifyBeatAudioObject,
  mapVpsBackupObjectPath,
  sha256Hex,
  type BackupClassification,
} from "../src/lib/storage/backup-manifest";

const CANARY_KEYS = new Set([
  "user/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003/master.bin",
  "platform/00000000-0000-4000-8000-000000000005/00000000-0000-4000-8000-000000000006/master.bin",
  "user/00000000-0000-4000-8000-000000000008/00000000-0000-4000-8000-000000000009/master/00000000-0000-4000-8000-000000000010.bin",
]);

const CANARY_RUN = "sa07-phase4-canary-2026-10-05T032831381Z-7693eb89";
const CANARY_SHA =
  "90ee033a87843110a16869da4b2ac414c1c36061b54cc7bb3770ede3c4c12261";

type AllowEntry = {
  classification: BackupClassification;
  bucket: string;
  object_key: string;
  size_bytes: number;
  content_type: string;
  etag: string | null;
  version_id: string | null;
  owner_user_id: string | null;
  owner_user_number: number | null;
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
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
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
    updated_at: string | null;
  }>
> {
  const out: Array<{
    object_key: string;
    size_bytes: number;
    content_type: string;
    etag: string | null;
    updated_at: string | null;
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
          updated_at: entry.updated_at ?? null,
        });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function buildAllowlist(admin: SupabaseClient): Promise<{
  inventory: {
    USER: number;
    PLATFORM: number;
    ORPHAN: number;
    UNKNOWN: number;
    TOTAL: number;
  };
  allowlist: AllowEntry[];
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
  const owners = new Map<string, { owner_id: string; user_number: number | null }>();
  if (beatIds.length) {
    const { data: beats, error: berr } = await admin
      .from("beats")
      .select("id, owner_id, ownership_type")
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

  // version_id via SQL-less: leave null from list API; fill from storage HEAD if needed.
  // We store updated_at; version from metadata unavailable in list — use null and
  // freeze size/etag/key as identity (Phase 4 used SQL version; here we re-validate size).

  const inventory = { USER: 0, PLATFORM: 0, ORPHAN: 0, UNKNOWN: 0, TOTAL: 0 };
  const allowlist: AllowEntry[] = [];

  for (const obj of listed) {
    const dbRefs = refs.has(obj.object_key) ? 1 : 0;
    const classification = classifyBeatAudioObject({
      objectKey: obj.object_key,
      dbRefsCount: dbRefs,
    });
    inventory[classification] += 1;
    inventory.TOTAL += 1;

    if (CANARY_KEYS.has(obj.object_key)) continue;

    let owner_user_id: string | null = null;
    let owner_user_number: number | null = null;
    if (classification === "USER") {
      const beatId = refs.get(obj.object_key);
      const o = beatId ? owners.get(beatId) : undefined;
      if (!o?.owner_id || o.user_number == null) {
        throw new Error(
          `STOP: USER without living owner/user_number: ${obj.object_key}`,
        );
      }
      owner_user_id = o.owner_id;
      owner_user_number = o.user_number;
    }

    if (classification === "UNKNOWN") {
      throw new Error(`STOP: UNKNOWN classification: ${obj.object_key}`);
    }

    assertSafeSourceObjectKey(obj.object_key);
    allowlist.push({
      classification,
      bucket: SA07_SOURCE_BUCKET,
      object_key: obj.object_key,
      size_bytes: obj.size_bytes,
      content_type: obj.content_type,
      etag: obj.etag,
      version_id: null,
      owner_user_id,
      owner_user_number,
    });
  }

  return { inventory, allowlist };
}

function assertInventory(inv: {
  USER: number;
  PLATFORM: number;
  ORPHAN: number;
  UNKNOWN: number;
  TOTAL: number;
}): void {
  if (
    inv.TOTAL !== SA07_EXPECTED_INVENTORY.TOTAL ||
    inv.USER !== SA07_EXPECTED_INVENTORY.USER ||
    inv.PLATFORM !== SA07_EXPECTED_INVENTORY.PLATFORM ||
    inv.ORPHAN !== SA07_EXPECTED_INVENTORY.ORPHAN ||
    inv.UNKNOWN !== 0
  ) {
    throw new Error(
      `STOP: DRIFT DETECTED inventory=${JSON.stringify(inv)} expected=${JSON.stringify(SA07_EXPECTED_INVENTORY)}`,
    );
  }
}

function assertAllowlist(allowlist: AllowEntry[]): void {
  if (allowlist.length !== 40) {
    throw new Error(`STOP: allowlist ${allowlist.length} ≠ 40`);
  }
  const counts = { USER: 0, PLATFORM: 0, ORPHAN: 0, UNKNOWN: 0 };
  for (const e of allowlist) {
    counts[e.classification] += 1;
    if (CANARY_KEYS.has(e.object_key)) {
      throw new Error(`STOP: canary key leaked into allowlist: ${e.object_key}`);
    }
  }
  if (counts.USER !== 7 || counts.PLATFORM !== 2 || counts.ORPHAN !== 31) {
    throw new Error(`STOP: allowlist class drift ${JSON.stringify(counts)}`);
  }
}

async function main(): Promise<void> {
  if (!process.argv.includes("--execute")) {
    throw new Error("refusing: pass --execute");
  }

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

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- canary immutability ---
  const canaryCheck = run("ssh", [
    "-i",
    sshKey,
    "-o",
    "BatchMode=yes",
    sshHost,
    [
      "set -euo pipefail",
      `OK=0`,
      `for f in user.json platform.json orphan.json; do`,
      `  man=/srv/bitrymdym-backup/manifests/${CANARY_RUN}/$f`,
      `  path=$(sudo -u bitrymdym-backup python3 -c "import json; print(json.load(open('$man'))['backup_object_path'])")`,
      `  sha=$(sudo -u bitrymdym-backup sha256sum "$path" | awk '{print $1}')`,
      `  size=$(sudo -u bitrymdym-backup stat -c%s "$path")`,
      `  msha=$(sudo -u bitrymdym-backup python3 -c "import json; print(json.load(open('$man'))['source_sha256'])")`,
      `  [ "$sha" = "${CANARY_SHA}" ] && [ "$sha" = "$msha" ] && [ "$size" = "2646044" ] || { echo CANARY_FAIL $f; exit 2; }`,
      `  OK=$((OK+1))`,
      `done`,
      `OBJ=$(sudo find /srv/bitrymdym-backup/objects -type f | wc -l)`,
      `[ "$OBJ" = "3" ] || { echo STOP_OBJ_PRE=$OBJ; exit 3; }`,
      `echo CANARY_OK=$OK OBJ_PRE=$OBJ`,
    ].join("\n"),
  ]);
  if (canaryCheck.status !== 0) {
    throw new Error(`STOP: canary immutability failed: ${canaryCheck.stdout} ${canaryCheck.stderr}`);
  }

  const { inventory, allowlist } = await buildAllowlist(admin);
  assertInventory(inventory);
  assertAllowlist(allowlist);

  // Enrich version_id from a read-only SQL-less approach: optional; store null is OK
  // if size/etag/key match. Prefer fetching via REST to storage.objects is unavailable.
  // Freeze allowlist to disk for evidence.
  const backupRunId = `sa07-phase6-full-${new Date().toISOString().replace(/[:.]/g, "")}-${randomUUID().slice(0, 8)}`;
  const workDir = join(tmpdir(), backupRunId);
  mkdirSync(workDir, { recursive: true });
  const allowlistPath = join(
    process.cwd(),
    "docs",
    "audits",
    "STORAGE_ARCH_07_PHASE6_ALLOWLIST.json",
  );
  writeFileSync(
    allowlistPath,
    `${JSON.stringify(
      {
        backup_run_id: backupRunId,
        inventory,
        canary_keys: [...CANARY_KEYS],
        allowlist_count: allowlist.length,
        allowlist,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        phase: 6,
        backup_run_id: backupRunId,
        inventory,
        allowlist_counts: {
          USER: allowlist.filter((a) => a.classification === "USER").length,
          PLATFORM: allowlist.filter((a) => a.classification === "PLATFORM").length,
          ORPHAN: allowlist.filter((a) => a.classification === "ORPHAN").length,
          TOTAL: allowlist.length,
        },
        max_new_copies: 40,
      },
      null,
      2,
    ),
  );

  if (allowlist.length > 40) {
    throw new Error("STOP: planner >40 new COPY");
  }

  type Result = {
    object_key: string;
    classification: BackupClassification;
    action: "COPY" | "SKIP";
    source_sha256: string;
    destination_sha256: string;
    destination_path: string;
    manifest_path: string;
    verification_status: "VERIFIED";
    size_bytes: number;
  };
  const results: Result[] = [];
  let newCopies = 0;

  for (const entry of allowlist) {
    const destination = mapVpsBackupObjectPath({
      bucket: entry.bucket,
      objectKey: entry.object_key,
    });
    if (!destination.startsWith(`${SA07_VPS_BACKUP_ROOT}/objects/`)) {
      throw new Error("STOP: destination escaped root");
    }

    const probe = run("ssh", [
      "-i",
      sshKey,
      "-o",
      "BatchMode=yes",
      sshHost,
      `sudo -u bitrymdym-backup bash -lc 'if [ -f "${destination}" ]; then sha256sum "${destination}" | awk "{print \\$1}"; else echo MISSING; fi'`,
    ]);
    if (probe.status !== 0) {
      throw new Error(`STOP: probe failed ${entry.object_key}: ${probe.stderr}`);
    }
    const existingSha = probe.stdout.trim();

    const { data, error } = await admin.storage
      .from(entry.bucket)
      .download(entry.object_key);
    if (error || !data) {
      throw new Error(
        `STOP: download failed ${entry.object_key}: ${error?.message ?? "no data"}`,
      );
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.byteLength !== entry.size_bytes) {
      throw new Error(
        `STOP: size drift ${entry.object_key}: got ${bytes.byteLength} expected ${entry.size_bytes}`,
      );
    }
    const sourceSha = sha256Hex(bytes);

    const safeSlug = createHash("sha256")
      .update(entry.object_key)
      .digest("hex")
      .slice(0, 16);
    const manifestPath = `${SA07_VPS_BACKUP_ROOT}/manifests/${backupRunId}/${entry.classification.toLowerCase()}-${safeSlug}.json`;

    if (existingSha !== "MISSING") {
      if (existingSha === sourceSha) {
        // Should not happen for Phase 6 remaining set — treat as SKIP idempotent
        results.push({
          object_key: entry.object_key,
          classification: entry.classification,
          action: "SKIP",
          source_sha256: sourceSha,
          destination_sha256: existingSha,
          destination_path: destination,
          manifest_path: manifestPath,
          verification_status: "VERIFIED",
          size_bytes: entry.size_bytes,
        });
        continue;
      }
      throw new Error(
        `STOP: CONTENT_CHANGED ${entry.object_key} existing=${existingSha} source=${sourceSha}`,
      );
    }

    newCopies += 1;
    if (newCopies > 40) {
      throw new Error("STOP: attempted >40 new copies");
    }

    const localPayload = join(workDir, `${safeSlug}.bin`);
    writeFileSync(localPayload, bytes);

    const remoteStagingRoot = `/tmp/${backupRunId}`;
    const remoteStagingFile = `${remoteStagingRoot}/${safeSlug}.bin`;
    const mk = run("ssh", [
      "-i",
      sshKey,
      "-o",
      "BatchMode=yes",
      sshHost,
      `mkdir -p ${remoteStagingRoot} && sudo -u bitrymdym-backup mkdir -p "$(dirname '${destination}')" '${SA07_VPS_BACKUP_ROOT}/manifests/${backupRunId}'`,
    ]);
    if (mk.status !== 0) {
      throw new Error(`STOP: mkdir failed: ${mk.stderr}`);
    }

    const scp = run("scp", [
      "-i",
      sshKey,
      "-o",
      "BatchMode=yes",
      localPayload,
      `${sshHost}:${remoteStagingFile}`,
    ]);
    if (scp.status !== 0) {
      throw new Error(`STOP: scp failed ${entry.object_key}: ${scp.stderr}`);
    }

    const install = run("ssh", [
      "-i",
      sshKey,
      "-o",
      "BatchMode=yes",
      sshHost,
      [
        "set -euo pipefail",
        `STAGE='${remoteStagingFile}'`,
        `FINAL='${destination}'`,
        `EXPECTED_SHA='${sourceSha}'`,
        `EXPECTED_SIZE='${entry.size_bytes}'`,
        `GOT_SHA=$(sha256sum "$STAGE" | awk '{print $1}')`,
        `GOT_SIZE=$(stat -c%s "$STAGE")`,
        `[ "$GOT_SHA" = "$EXPECTED_SHA" ]`,
        `[ "$GOT_SIZE" = "$EXPECTED_SIZE" ]`,
        `TMP="\${FINAL}.tmp.\$\$"`,
        `sudo install -o bitrymdym-backup -g bitrymdym-backup -m 0600 "$STAGE" "$TMP"`,
        `sync`,
        `sudo -u bitrymdym-backup mv -f "$TMP" "$FINAL"`,
        `DEST_SHA=$(sudo -u bitrymdym-backup sha256sum "$FINAL" | awk '{print $1}')`,
        `DEST_SIZE=$(sudo -u bitrymdym-backup stat -c%s "$FINAL")`,
        `[ "$DEST_SHA" = "$EXPECTED_SHA" ]`,
        `[ "$DEST_SIZE" = "$EXPECTED_SIZE" ]`,
        `echo "DEST_OK $DEST_SHA $DEST_SIZE"`,
        `rm -f "$STAGE"`,
      ].join("\n"),
    ]);
    if (install.status !== 0) {
      throw new Error(
        `STOP: install failed ${entry.object_key}: ${install.stdout} ${install.stderr}`,
      );
    }
    const okLine = install.stdout
      .split(/\r?\n/)
      .find((l) => l.startsWith("DEST_OK "));
    if (!okLine) throw new Error(`STOP: missing DEST_OK ${entry.object_key}`);
    const destSha = okLine.split(" ")[1];

    const manifest = {
      backup_run_id: backupRunId,
      created_at: new Date().toISOString(),
      source_bucket: entry.bucket,
      source_object_key: entry.object_key,
      source_version_id: entry.version_id,
      source_size: entry.size_bytes,
      source_content_type: entry.content_type,
      source_etag: entry.etag,
      source_sha256: sourceSha,
      classification: entry.classification,
      owner_user_id: entry.owner_user_id,
      owner_user_number: entry.owner_user_number,
      backup_target: "vps-layer1",
      backup_object_path: destination,
      backup_created_at: new Date().toISOString(),
      verification_status: "VERIFIED",
      destination_sha256: destSha,
      destination_size: entry.size_bytes,
      gc_safety_status: "BACKED_UP",
      note:
        entry.classification === "ORPHAN"
          ? "BACKED UP / NOT SAFE FOR DELETE · ARCH-05 NOT READY · NOT RESTORE VERIFIED"
          : "BACKED UP · NOT RESTORE VERIFIED · NOT SAFE FOR DELETE",
    };
    const localMan = join(workDir, `${safeSlug}.json`);
    writeFileSync(localMan, `${JSON.stringify(manifest, null, 2)}\n`);
    const scpMan = run("scp", [
      "-i",
      sshKey,
      "-o",
      "BatchMode=yes",
      localMan,
      `${sshHost}:/tmp/${backupRunId}-${safeSlug}.json`,
    ]);
    if (scpMan.status !== 0) {
      throw new Error(`STOP: manifest scp failed: ${scpMan.stderr}`);
    }
    const manInstall = run("ssh", [
      "-i",
      sshKey,
      "-o",
      "BatchMode=yes",
      sshHost,
      [
        "set -euo pipefail",
        `sudo -u bitrymdym-backup install -m 0600 /tmp/${backupRunId}-${safeSlug}.json '${manifestPath}'`,
        `sudo chown bitrymdym-backup:bitrymdym-backup '${manifestPath}'`,
        `rm -f /tmp/${backupRunId}-${safeSlug}.json`,
        `echo MANIFEST_OK`,
      ].join("\n"),
    ]);
    if (manInstall.status !== 0) {
      throw new Error(`STOP: manifest install failed: ${manInstall.stderr}`);
    }

    results.push({
      object_key: entry.object_key,
      classification: entry.classification,
      action: "COPY",
      source_sha256: sourceSha,
      destination_sha256: destSha,
      destination_path: destination,
      manifest_path: manifestPath,
      verification_status: "VERIFIED",
      size_bytes: entry.size_bytes,
    });
    console.log(
      JSON.stringify({
        progress: `${results.length}/${allowlist.length}`,
        classification: entry.classification,
        action: "COPY",
        object_key: entry.object_key,
      }),
    );
    try {
      rmSync(localPayload, { force: true });
    } catch {
      /* ignore */
    }
  }

  const copied = results.filter((r) => r.action === "COPY").length;
  if (copied !== 40 && results.every((r) => r.action === "COPY") === false) {
    // allow SKIP only if somehow pre-existed; for Phase 6 expect 40 COPY
  }
  if (copied > 40) throw new Error("STOP: copied >40");
  if (results.length !== 40) throw new Error(`STOP: results ${results.length}≠40`);
  if (results.some((r) => r.verification_status !== "VERIFIED")) {
    throw new Error("STOP: not all VERIFIED");
  }

  // Full reconciliation on VPS (as backup principal — manifests are 0600)
  const reconScript = `
import hashlib, json
from pathlib import Path
CANARY_RUN='${CANARY_RUN}'
PHASE6_RUN='${backupRunId}'
EXPECTED_CANARY_SHA='${CANARY_SHA}'
root=Path('/srv/bitrymdym-backup')
files=[p for p in (root/'objects').rglob('*') if p.is_file()]
assert len(files)==43, f'objects={len(files)}'
def sha(p):
  h=hashlib.sha256()
  with open(p,'rb') as f:
    for c in iter(lambda:f.read(1024*1024), b''): h.update(c)
  return h.hexdigest()
mans=[]
for run in [CANARY_RUN, PHASE6_RUN]:
  d=root/'manifests'/run
  assert d.is_dir(), run
  mans += list(d.glob('*.json'))
assert len(mans)==43, f'manifests={len(mans)}'
by_key={}
for mpath in mans:
  m=json.loads(mpath.read_text())
  key=m['source_object_key']
  assert key not in by_key, key
  by_key[key]=m
  dest=Path(m['backup_object_path'])
  assert dest.is_file(), str(dest)
  dsha=sha(dest)
  assert dsha==m['source_sha256']
  assert dsha==m.get('destination_sha256', dsha)
  assert dest.stat().st_size==int(m['source_size'])
  assert m.get('verification_status')=='VERIFIED'
assert len(by_key)==43
for name in ['user.json','platform.json','orphan.json']:
  m=json.loads((root/'manifests'/CANARY_RUN/name).read_text())
  assert sha(Path(m['backup_object_path']))==EXPECTED_CANARY_SHA
print(json.dumps({'objects':43,'manifests':43,'sha_pass':43,'canary_ok':3}))
`;

  const reconLocal = join(workDir, "recon.py");
  writeFileSync(reconLocal, `${reconScript}\n`);
  const scpRecon = run("scp", [
    "-i",
    sshKey,
    "-o",
    "BatchMode=yes",
    reconLocal,
    `${sshHost}:/tmp/${backupRunId}-recon.py`,
  ]);
  if (scpRecon.status !== 0) {
    throw new Error(`STOP: recon scp failed: ${scpRecon.stderr}`);
  }
  const recon = run("ssh", [
    "-i",
    sshKey,
    "-o",
    "BatchMode=yes",
    sshHost,
    [
      "set -euo pipefail",
      `sudo -u bitrymdym-backup python3 /tmp/${backupRunId}-recon.py`,
      `rm -f /tmp/${backupRunId}-recon.py`,
      "echo '--- isolation ---'",
      "sudo -u bitrymdym-e3 test -r /srv/bitrymdym-backup/objects && echo E3_READ=YES || echo E3_READ=NO",
      "test -r /srv/bitrymdym-backup/objects && echo UBUNTU_READ=YES || echo UBUNTU_READ=NO",
      "sudo find /srv/bitrymdym-backup/objects -type f -exec stat -c '%U:%G %a' {} + | sort | uniq -c",
    ].join("\n"),
  ]);
  if (recon.status !== 0) {
    throw new Error(`STOP: reconciliation failed: ${recon.stdout}\n${recon.stderr}`);
  }

  const evidence = {
    tool: "storage-arch-07-phase6-full-backup",
    phase: 6,
    backup_run_id: backupRunId,
    status: "PASS",
    claim: "VPS Layer-1 43/43 BACKED UP",
    not_claimed: [
      "FULL DR COMPLETE",
      "ARCH-05 SAFE",
      "RESTORE VERIFIED 43/43",
      "ORPHAN SAFE FOR DELETE",
    ],
    inventory,
    allowlist_counts: {
      USER: 7,
      PLATFORM: 2,
      ORPHAN: 31,
      TOTAL: 40,
    },
    new_copies: copied,
    skipped: results.filter((r) => r.action === "SKIP").length,
    existing_canary: 3,
    results_summary: {
      COPY: copied,
      SKIP: results.filter((r) => r.action === "SKIP").length,
      VERIFIED: results.filter((r) => r.verification_status === "VERIFIED").length,
    },
    vps_reconcile: recon.stdout.trim().split(/\r?\n/),
    restore_verified: "3/43",
    aws: "NOT CONFIGURED",
    arch05: "NOT READY",
    production_mutations: {
      storage_delete: 0,
      db_mutation: 0,
      auth_mutation: 0,
      aws_mutation: 0,
      objects_copied_new: copied,
    },
  };

  const evidencePath = join(
    process.cwd(),
    "docs",
    "audits",
    "STORAGE_ARCH_07_PHASE6_FULL_BACKUP_EVIDENCE.json",
  );
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`EVIDENCE_LOCAL=${evidencePath}`);
  console.log(`ALLOWLIST_LOCAL=${allowlistPath}`);

  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (copied !== 40) {
    throw new Error(`STOP: expected 40 COPY, got ${copied}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
