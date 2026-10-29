// NOTE (public repo): canary identities and backup host are REDACTED — supply real values locally (SA07_SSH_HOST env; edit allowlist in a private copy).
/**
 * STORAGE-ARCH-07 Phase 4 — controlled production canary (exactly 3 objects).
 *
 * READ-ONLY on Supabase Storage source.
 * Writes ONLY to VPS Layer-1 under /srv/bitrymdym-backup via SSH as bitrymdym-backup.
 * Hard-stops if allowlist ≠ 3 or transfer would exceed 3 objects.
 *
 * Usage:
 *   npx tsx scripts/storage-arch-07-phase4-canary.ts --execute
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

import {
  SA07_SOURCE_BUCKET,
  SA07_VPS_BACKUP_ROOT,
  assertSafeSourceObjectKey,
  mapVpsBackupObjectPath,
  sha256Hex,
  type BackupClassification,
} from "../src/lib/storage/backup-manifest";

type CanaryEntry = {
  classification: BackupClassification;
  bucket: string;
  object_key: string;
  size_bytes: number;
  content_type: string;
  etag: string;
  version_id: string;
  owner_user_id: string | null;
  owner_user_number: number | null;
};

/** Immutable allowlist for this Owner GO run — exactly 3 identities. */
const CANARY_ALLOWLIST: CanaryEntry[] = [
  {
    classification: "USER",
    bucket: "beat-audio",
    object_key:
      "user/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003/master.bin",
    size_bytes: 2646044,
    content_type: "audio/wav",
    etag: '"8fc9ee55046830c774343204ff60a631"',
    version_id: "00000000-0000-4000-8000-000000000004",
    owner_user_id: "00000000-0000-4000-8000-000000000001",
    owner_user_number: 61,
  },
  {
    classification: "PLATFORM",
    bucket: "beat-audio",
    object_key:
      "platform/00000000-0000-4000-8000-000000000005/00000000-0000-4000-8000-000000000006/master.bin",
    size_bytes: 2646044,
    content_type: "audio/wav",
    etag: '"8fc9ee55046830c774343204ff60a631"',
    version_id: "00000000-0000-4000-8000-000000000007",
    owner_user_id: null,
    owner_user_number: null,
  },
  {
    classification: "ORPHAN",
    bucket: "beat-audio",
    object_key:
      "user/00000000-0000-4000-8000-000000000008/00000000-0000-4000-8000-000000000009/master/00000000-0000-4000-8000-000000000010.bin",
    size_bytes: 2646044,
    content_type: "audio/wav",
    etag: '"8fc9ee55046830c774343204ff60a631"',
    version_id: "00000000-0000-4000-8000-000000000011",
    owner_user_id: null,
    owner_user_number: null,
  },
];

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const root = process.cwd();
  for (const name of [".env", ".env.local"]) {
    const p = join(root, name);
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

function assertAllowlistExact(): void {
  if (CANARY_ALLOWLIST.length !== 3) {
    throw new Error(
      `STOP: allowlist size ${CANARY_ALLOWLIST.length} ≠ 3 — refusing transfer`,
    );
  }
  const classes = new Set(CANARY_ALLOWLIST.map((e) => e.classification));
  if (
    !classes.has("USER") ||
    !classes.has("PLATFORM") ||
    !classes.has("ORPHAN") ||
    classes.size !== 3
  ) {
    throw new Error("STOP: allowlist must be exactly 1 USER + 1 PLATFORM + 1 ORPHAN");
  }
  const keys = new Set(CANARY_ALLOWLIST.map((e) => e.object_key));
  if (keys.size !== 3) {
    throw new Error("STOP: duplicate object_key in allowlist");
  }
}

function sha256File(path: string): string {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

function run(cmd: string, args: string[], opts?: { input?: Buffer }): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    input: opts?.input,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

async function main(): Promise<void> {
  if (!process.argv.includes("--execute")) {
    throw new Error("refusing: pass --execute for Phase 4 canary");
  }
  assertAllowlistExact();

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("MISSING_SUPABASE_ENV");
  }

  const sshKey =
    process.env.SA07_SSH_KEY ||
    join(process.env.USERPROFILE || process.env.HOME || "", ".ssh", "sa07-backup-host-key");
  const sshHost = (process.env.SA07_SSH_HOST ?? (() => { throw new Error("STOP: set SA07_SSH_HOST (user@host)"); })());

  const backupRunId = `sa07-phase4-canary-${new Date().toISOString().replace(/[:.]/g, "")}-${randomUUID().slice(0, 8)}`;
  const workDir = join(tmpdir(), backupRunId);
  mkdirSync(workDir, { recursive: true });

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  type TransferResult = {
    entry: CanaryEntry;
    source_sha256: string;
    destination_path: string;
    destination_sha256: string;
    destination_size: number;
    manifest_path: string;
    verification_status: "VERIFIED" | "FAIL";
    action: "COPY" | "SKIP";
  };

  const results: TransferResult[] = [];

  console.log(
    JSON.stringify(
      {
        phase: 4,
        backup_run_id: backupRunId,
        allowlist_count: CANARY_ALLOWLIST.length,
        allowlist: CANARY_ALLOWLIST.map((e) => ({
          classification: e.classification,
          bucket: e.bucket,
          object_key: e.object_key,
          size_bytes: e.size_bytes,
          content_type: e.content_type,
          etag: e.etag,
          version_id: e.version_id,
          owner_user_id: e.owner_user_id,
          owner_user_number: e.owner_user_number,
        })),
      },
      null,
      2,
    ),
  );

  for (const entry of CANARY_ALLOWLIST) {
    if (entry.bucket !== SA07_SOURCE_BUCKET) {
      throw new Error(`STOP: unexpected bucket ${entry.bucket}`);
    }
    assertSafeSourceObjectKey(entry.object_key);
    const destination = mapVpsBackupObjectPath({
      bucket: entry.bucket,
      objectKey: entry.object_key,
    });
    if (!destination.startsWith(`${SA07_VPS_BACKUP_ROOT}/objects/`)) {
      throw new Error("STOP: destination escaped backup root");
    }

    // Idempotency / conflict probe on VPS
    const probe = run("ssh", [
      "-i",
      sshKey,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      sshHost,
      `sudo -u bitrymdym-backup bash -lc 'if [ -f "${destination}" ]; then sha256sum "${destination}" | awk "{print \\$1}"; else echo MISSING; fi'`,
    ]);
    if (probe.status !== 0) {
      throw new Error(`STOP: VPS probe failed: ${probe.stderr}`);
    }
    const existingSha = probe.stdout.trim();

    const { data, error } = await admin.storage
      .from(entry.bucket)
      .download(entry.object_key);
    if (error || !data) {
      throw new Error(
        `STOP: download failed for ${entry.object_key}: ${error?.message ?? "no data"}`,
      );
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.byteLength !== entry.size_bytes) {
      throw new Error(
        `STOP: size drift ${entry.object_key}: got ${bytes.byteLength} expected ${entry.size_bytes}`,
      );
    }
    const sourceSha = sha256Hex(bytes);

    if (existingSha !== "MISSING") {
      if (existingSha === sourceSha) {
        results.push({
          entry,
          source_sha256: sourceSha,
          destination_path: destination,
          destination_sha256: existingSha,
          destination_size: entry.size_bytes,
          manifest_path: `${SA07_VPS_BACKUP_ROOT}/manifests/${backupRunId}/${entry.classification.toLowerCase()}.json`,
          verification_status: "VERIFIED",
          action: "SKIP",
        });
        continue;
      }
      throw new Error(
        `STOP: CONTENT_CHANGED for ${entry.object_key} existing=${existingSha} source=${sourceSha}`,
      );
    }

    const localPayload = join(workDir, `${entry.classification}.bin`);
    writeFileSync(localPayload, bytes);
    if (sha256File(localPayload) !== sourceSha) {
      throw new Error("STOP: local write hash mismatch");
    }

    const remoteStagingRoot = `/tmp/${backupRunId}`;
    const remoteStagingFile = `${remoteStagingRoot}/${entry.classification}.bin`;
    const remoteFinal = destination;
    const remoteManifestDir = `${SA07_VPS_BACKUP_ROOT}/manifests/${backupRunId}`;
    const remoteManifest = `${remoteManifestDir}/${entry.classification.toLowerCase()}.json`;

    const mk = run("ssh", [
      "-i",
      sshKey,
      "-o",
      "BatchMode=yes",
      sshHost,
      `mkdir -p ${remoteStagingRoot} && sudo -u bitrymdym-backup mkdir -p "$(dirname '${remoteFinal}')" '${remoteManifestDir}'`,
    ]);
    if (mk.status !== 0) {
      throw new Error(`STOP: remote mkdir failed: ${mk.stderr}`);
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
      throw new Error(`STOP: scp failed: ${scp.stderr}`);
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
        `FINAL='${remoteFinal}'`,
        `EXPECTED_SHA='${sourceSha}'`,
        `EXPECTED_SIZE='${entry.size_bytes}'`,
        `GOT_SHA=$(sha256sum "$STAGE" | awk '{print $1}')`,
        `GOT_SIZE=$(stat -c%s "$STAGE")`,
        `[ "$GOT_SHA" = "$EXPECTED_SHA" ] || { echo "STAGE_SHA_MISMATCH $GOT_SHA"; exit 2; }`,
        `[ "$GOT_SIZE" = "$EXPECTED_SIZE" ] || { echo "STAGE_SIZE_MISMATCH $GOT_SIZE"; exit 3; }`,
        `TMP="\${FINAL}.tmp.\$\$"`,
        `sudo install -o bitrymdym-backup -g bitrymdym-backup -m 0600 "$STAGE" "$TMP"`,
        `sync`,
        `sudo -u bitrymdym-backup mv -f "$TMP" "$FINAL"`,
        `DEST_SHA=$(sudo -u bitrymdym-backup sha256sum "$FINAL" | awk '{print $1}')`,
        `DEST_SIZE=$(sudo -u bitrymdym-backup stat -c%s "$FINAL")`,
        `[ "$DEST_SHA" = "$EXPECTED_SHA" ] || { echo "DEST_SHA_MISMATCH $DEST_SHA"; exit 4; }`,
        `[ "$DEST_SIZE" = "$EXPECTED_SIZE" ] || { echo "DEST_SIZE_MISMATCH $DEST_SIZE"; exit 5; }`,
        `echo "DEST_OK $DEST_SHA $DEST_SIZE"`,
        `rm -f "$STAGE"`,
      ].join("\n"),
    ]);
    if (install.status !== 0) {
      throw new Error(
        `STOP: atomic install failed for ${entry.object_key}: ${install.stdout} ${install.stderr}`,
      );
    }
    const okLine = install.stdout
      .split(/\r?\n/)
      .find((l) => l.startsWith("DEST_OK "));
    if (!okLine) {
      throw new Error(`STOP: missing DEST_OK for ${entry.object_key}`);
    }
    const [, destSha, destSizeStr] = okLine.split(" ");
    const destSize = Number(destSizeStr);

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
      backup_object_path: remoteFinal,
      backup_created_at: new Date().toISOString(),
      verification_status: "VERIFIED" as const,
      destination_sha256: destSha,
      destination_size: destSize,
      gc_safety_status: "BACKED_UP",
      note:
        entry.classification === "ORPHAN"
          ? "BACKED UP / NOT SAFE FOR DELETE · ARCH-05 NOT READY"
          : "CANARY BACKED UP · NOT RESTORE VERIFIED · NOT SAFE FOR DELETE",
    };

    const localManifest = join(workDir, `${entry.classification}.json`);
    writeFileSync(localManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    const scpMan = run("scp", [
      "-i",
      sshKey,
      "-o",
      "BatchMode=yes",
      localManifest,
      `${sshHost}:/tmp/${backupRunId}-${entry.classification}.json`,
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
        `sudo -u bitrymdym-backup install -m 0600 /tmp/${backupRunId}-${entry.classification}.json '${remoteManifest}'`,
        `sudo chown bitrymdym-backup:bitrymdym-backup '${remoteManifest}'`,
        `sudo chmod 0600 '${remoteManifest}'`,
        `rm -f /tmp/${backupRunId}-${entry.classification}.json`,
        `echo MANIFEST_OK`,
      ].join("\n"),
    ]);
    if (manInstall.status !== 0) {
      throw new Error(`STOP: manifest install failed: ${manInstall.stderr}`);
    }

    results.push({
      entry,
      source_sha256: sourceSha,
      destination_path: remoteFinal,
      destination_sha256: destSha,
      destination_size: destSize,
      manifest_path: remoteManifest,
      verification_status: "VERIFIED",
      action: "COPY",
    });
  }

  if (results.length !== 3) {
    throw new Error(`STOP: results ${results.length} ≠ 3`);
  }
  if (results.some((r) => r.verification_status !== "VERIFIED")) {
    throw new Error("STOP: not all VERIFIED");
  }

  const reconcile = run("ssh", [
    "-i",
    sshKey,
    "-o",
    "BatchMode=yes",
    sshHost,
    [
      "set -euo pipefail",
      `OBJ_COUNT=$(sudo find ${SA07_VPS_BACKUP_ROOT}/objects -type f | wc -l)`,
      `MAN_COUNT=$(sudo find ${SA07_VPS_BACKUP_ROOT}/manifests/${backupRunId} -type f | wc -l)`,
      `echo OBJ_COUNT=$OBJ_COUNT`,
      `echo MAN_COUNT=$MAN_COUNT`,
      `sudo find ${SA07_VPS_BACKUP_ROOT}/objects -type f -printf '%u %a %s %p\\n'`,
      `echo '--- isolation ---'`,
      `if id bitrymdym-e3-worker >/dev/null 2>&1; then sudo -u bitrymdym-e3-worker test -r ${SA07_VPS_BACKUP_ROOT}/objects && echo E3_READ=YES || echo E3_READ=NO; else echo E3_USER=ABSENT; fi`,
      `test -r ${SA07_VPS_BACKUP_ROOT}/objects && echo UBUNTU_READ=YES || echo UBUNTU_READ=NO`,
    ].join("\n"),
  ]);
  if (reconcile.status !== 0) {
    throw new Error(`STOP: reconcile failed: ${reconcile.stderr}`);
  }

  const objCount = Number(
    reconcile.stdout.match(/OBJ_COUNT=(\d+)/)?.[1] ?? "-1",
  );
  const manCount = Number(
    reconcile.stdout.match(/MAN_COUNT=(\d+)/)?.[1] ?? "-1",
  );
  if (objCount !== 3) {
    throw new Error(`STOP: VPS objects count ${objCount} ≠ 3`);
  }
  if (manCount !== 3) {
    throw new Error(`STOP: manifest count ${manCount} ≠ 3`);
  }

  const evidence = {
    tool: "storage-arch-07-phase4-canary",
    phase: 4,
    backup_run_id: backupRunId,
    status: "PASS",
    claim: "CANARY BACKED UP",
    not_claimed: [
      "FULL BACKUP COMPLETE",
      "RESTORE VERIFIED",
      "ARCH-05 SAFE",
      "FULL DR",
    ],
    results,
    vps_reconcile: reconcile.stdout.trim().split(/\r?\n/),
    production_mutations: {
      storage_delete: 0,
      db_mutation: 0,
      auth_mutation: 0,
      aws_mutation: 0,
      restore: 0,
      objects_copied: 3,
    },
  };

  const evidencePath = join(
    process.cwd(),
    "docs",
    "audits",
    "STORAGE_ARCH_07_PHASE4_CANARY_EVIDENCE.json",
  );
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`EVIDENCE_LOCAL=${evidencePath}`);

  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
