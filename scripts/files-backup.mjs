#!/usr/bin/env node
/**
 * Weekly encrypted copy of catalogue files (owner consent 2026-11-23) on the Contabo host.
 * Supabase Pro backs up the database only, not Storage. Scope: beats, catalogue samples, covers.
 * Not copied: user recordings (take-audio) and private user samples (user-samples/).
 *
 * Every file is encrypted with a GPG public key while it streams in (never in clear on disk).
 * The private key is NOT on this host. Only new or changed files are downloaded. A copy of a
 * file deleted at the source is removed after KEEP_DELETED_DAYS. Errors are mailed (Resend).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL,
 * ALERT_EMAIL, STATE_DIRECTORY (systemd), BACKUP_PUBLIC_KEY (path).
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";

export const SOURCES = [
  { bucket: "beat-audio", prefixes: ["platform", "catalog"] },
  { bucket: "beat-covers", prefixes: ["platform"] },
];
export const KEEP_DELETED_DAYS = 30;
export const KEEP_MANIFESTS = 12;
const DAY = 86_400_000;

/** One stored version of a file: a changed file (new etag) gets a new blob. */
export function blobName(file) {
  return `${createHash("sha256").update(`${file.bucket}\n${file.name}\n${file.etag}\n${file.size}`).digest("hex")}.gpg`;
}

/** Guard: a listing that lost more than half of the files is an error, never a reason to delete. */
export function listingLooksBroken(previousCount, currentCount) {
  return previousCount > 10 && currentCount < previousCount / 2;
}

/** Pure: which index entries to drop, and the index with fresh `lastSeen` marks. */
export function planPrune(index, seenBlobs, now) {
  const kept = {};
  const drop = [];
  for (const [blob, entry] of Object.entries(index)) {
    const lastSeen = seenBlobs.has(blob) ? now : entry.lastSeen;
    if (now - lastSeen > KEEP_DELETED_DAYS * DAY) drop.push(blob);
    else kept[blob] = { ...entry, lastSeen };
  }
  return { kept, drop };
}

async function retry(label, fn) {
  let last;
  for (let i = 0; i < 4; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : last}`);
}

function api(env) {
  const base = `${env.url.replace(/\/$/, "")}/storage/v1/object`;
  const headers = { authorization: `Bearer ${env.key}`, apikey: env.key };
  async function listDir(bucket, prefix) {
    const out = [];
    for (let offset = 0; ; offset += 500) {
      const rows = await retry(`list ${bucket}/${prefix}`, async () => {
        const res = await fetch(`${base}/list/${bucket}`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ prefix, limit: 500, offset, sortBy: { column: "name", order: "asc" } }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
      for (const row of rows) {
        const name = `${prefix}/${row.name}`;
        if (row.id == null) out.push(...(await listDir(bucket, name)));
        else out.push({ bucket, name, size: Number(row.metadata?.size ?? -1), etag: String(row.metadata?.eTag ?? row.updated_at), type: row.metadata?.mimetype ?? null });
      }
      if (rows.length < 500) return out;
    }
  }
  return {
    listDir,
    open: async (file) => {
      const res = await fetch(`${base}/authenticated/${file.bucket}/${file.name.split("/").map(encodeURIComponent).join("/")}`, {
        headers,
        signal: AbortSignal.timeout(10 * 60_000),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      return Readable.fromWeb(res.body);
    },
  };
}

/** Streams into gpg and writes `target` only when gpg and the size check both pass. */
async function encryptTo(source, target, publicKey, gnupgHome, expectedSize) {
  const tmp = `${target}.part`;
  const gpg = spawn("gpg", ["--homedir", gnupgHome, "--batch", "--yes", "--quiet", "--no-armor", "--compress-algo", "none", "--trust-model", "always", "--recipient-file", publicKey, "--output", tmp, "--encrypt"], { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  gpg.stderr.on("data", (d) => (stderr += d));
  const done = new Promise((resolve, reject) => {
    gpg.on("error", reject);
    gpg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`gpg ${code}: ${stderr.slice(0, 200)}`))));
  });
  done.catch(() => {});
  const hash = createHash("sha256");
  let size = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      size += chunk.length;
      cb(null, chunk);
    },
  });
  try {
    await pipeline(source, meter, gpg.stdin);
    await done;
    if (expectedSize >= 0 && size !== expectedSize) throw new Error(`size ${size}, expected ${expectedSize}`);
    await rename(tmp, target);
  } catch (error) {
    gpg.kill();
    await rm(tmp, { force: true });
    throw error;
  }
  return { sha256: hash.digest("hex"), encryptedSize: (await stat(target)).size };
}

export async function run(env, now = Date.now()) {
  const blobs = path.join(env.dir, "blobs");
  const manifests = path.join(env.dir, "manifests");
  await mkdir(blobs, { recursive: true, mode: 0o700 });
  await mkdir(manifests, { recursive: true, mode: 0o700 });
  const gnupgHome = await mkdtemp(path.join(os.tmpdir(), "gnupg-"));
  const indexFile = path.join(env.dir, "index.json");
  const index = JSON.parse(await readFile(indexFile, "utf8").catch(() => "{}"));
  const status = JSON.parse(await readFile(path.join(env.dir, "status.json"), "utf8").catch(() => "{}"));
  try {
    const storage = api(env);
    const files = [];
    for (const source of SOURCES) for (const prefix of source.prefixes) files.push(...(await storage.listDir(source.bucket, prefix)));
    if (files.length === 0 || listingLooksBroken(status.files ?? 0, files.length)) {
      throw new Error(`listing looks broken: ${files.length} files, last time ${status.files ?? 0}`);
    }
    const seen = new Set();
    const failed = [];
    let added = 0;
    for (const file of files) {
      const blob = blobName(file);
      const target = path.join(blobs, blob);
      const known = index[blob];
      if (known && (await stat(target).catch(() => null))?.size === known.encryptedSize) {
        seen.add(blob);
        continue;
      }
      try {
        const saved = await retry(`${file.bucket}/${file.name}`, async () =>
          encryptTo(await storage.open(file), target, env.publicKey, gnupgHome, file.size),
        );
        index[blob] = { ...saved, lastSeen: now };
        seen.add(blob);
        added += 1;
        if (added % 20 === 0) await writeFile(indexFile, JSON.stringify(index));
      } catch (error) {
        failed.push(String(error instanceof Error ? error.message : error).slice(0, 200));
      }
    }
    // No pruning after a run with errors.
    const { kept, drop } = failed.length ? { kept: index, drop: [] } : planPrune(index, seen, now);
    for (const blob of drop) await rm(path.join(blobs, blob), { force: true });
    await writeFile(`${indexFile}.tmp`, JSON.stringify(kept));
    await rename(`${indexFile}.tmp`, indexFile);
    const manifest = files.flatMap((f) => {
      const blob = blobName(f);
      return kept[blob] ? [{ ...f, blob, sha256: kept[blob].sha256 }] : [];
    });
    const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
    await encryptTo(Readable.from([JSON.stringify({ at: new Date(now).toISOString(), files: manifest })]), path.join(manifests, `${stamp}.json.gpg`), env.publicKey, gnupgHome, -1);
    const old = (await readdir(manifests)).filter((n) => n.endsWith(".json.gpg")).sort().slice(0, -KEEP_MANIFESTS);
    for (const name of old) await rm(path.join(manifests, name), { force: true });
    const summary = { ok: failed.length === 0, at: new Date(now).toISOString(), files: files.length, stored: manifest.length, added, removed: drop.length, bytes: files.reduce((s, f) => s + Math.max(0, f.size), 0), failed: failed.length };
    await writeFile(path.join(env.dir, "status.json"), JSON.stringify(summary));
    if (failed.length) throw new Error(`${failed.length} files failed. First: ${failed[0]}`);
    return summary;
  } finally {
    await rm(gnupgHome, { recursive: true, force: true });
  }
}

async function mail(subject, text) {
  const { RESEND_API_KEY: key, RESEND_FROM_EMAIL: from, ALERT_EMAIL: to } = process.env;
  if (!key || !from || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, tags: [{ name: "kind", value: "files_backup" }] }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  return !!res?.ok;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    key: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    dir: process.env.STATE_DIRECTORY || "/tmp/bitrymdym-files-backup",
    publicKey: process.env.BACKUP_PUBLIC_KEY ?? "/opt/bitrymdym-files-backup/public.asc",
  };
  try {
    console.info("[files-backup]", JSON.stringify(await run(env)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[files-backup] FAILED", message);
    await mail("BitRymDym: kopia plików się nie udała", `Cotygodniowa kopia bitów i okładek na serwerze Contabo nie przeszła w całości.\n\n${message}\n\nPoprzednie kopie zostały nienaruszone.`);
    process.exit(1);
  }
}
