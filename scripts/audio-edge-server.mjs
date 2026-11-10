/**
 * VPS cache in front of private beat-audio.
 * Listens on 127.0.0.1. Caddy on edge.bitrymdym.pl terminates TLS.
 * A repeat listen reads disk. The first miss downloads once from Supabase.
 *
 *   BITRYMDYM_AUDIO_EDGE_PORT=8092
 *   BITRYMDYM_OBJECT_CACHE_DIR=/var/lib/bitrymdym-e3-worker/.cache/bitrymdym-objects
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (prefill and cache miss)
 *
 *   node scripts/audio-edge-server.mjs
 *   node scripts/audio-edge-server.mjs prefill
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { objectCacheName, parseBeatSignUrl } from "./audio-edge-lib.mjs";

const PORT = Number(process.env.BITRYMDYM_AUDIO_EDGE_PORT || 8092);
const CACHE = process.env.BITRYMDYM_OBJECT_CACHE_DIR || "";
const SUPABASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MAX_BYTES = 80 * 1024 * 1024;
const fills = new Map();
const hits = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function allow(ip, limit) {
  const now = Date.now();
  const row = hits.get(ip) || { n: 0, t: now };
  if (now - row.t > 60_000) {
    row.n = 0;
    row.t = now;
  }
  row.n += 1;
  hits.set(ip, row);
  return row.n <= limit;
}

function cachePaths(bucket, objectKey) {
  const file = path.join(CACHE, objectCacheName(bucket, objectKey));
  return { file, typeFile: `${file}.type` };
}

async function fileSize(file) {
  try {
    const info = await stat(file);
    return info.size > 0 ? info.size : 0;
  } catch {
    return 0;
  }
}

async function fill(bucket, objectKey) {
  const { file, typeFile } = cachePaths(bucket, objectKey);
  if (await fileSize(file)) return file;
  const pending = fills.get(file);
  if (pending) return pending;
  const job = (async () => {
    const url = `${SUPABASE}/storage/v1/object/${bucket}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${SERVICE}`, apikey: SERVICE },
      redirect: "manual",
    });
    if (response.status !== 200 || !response.body) {
      const error = new Error("upstream");
      error.status = response.status === 400 || response.status === 404 ? 404 : 502;
      throw error;
    }
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) {
      const error = new Error("too_large");
      error.status = 413;
      throw error;
    }
    await mkdir(CACHE, { recursive: true });
    const part = `${file}.part`;
    let seen = 0;
    const reader = response.body.getReader();
    const chunks = [];
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      seen += step.value.byteLength;
      if (seen > MAX_BYTES) {
        const error = new Error("too_large");
        error.status = 413;
        throw error;
      }
      chunks.push(step.value);
    }
    if (seen < 1) {
      const error = new Error("empty");
      error.status = 502;
      throw error;
    }
    await writeFile(part, Buffer.concat(chunks));
    await rename(part, file);
    const type = response.headers.get("content-type") || "application/octet-stream";
    await writeFile(typeFile, type.split(";")[0].slice(0, 80));
    return file;
  })();
  fills.set(file, job);
  try {
    return await job;
  } finally {
    fills.delete(file);
  }
}

function sendRange(req, res, file, size, contentType, download) {
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, max-age=60");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (download) res.setHeader("Content-Disposition", "attachment");
  const header = req.headers.range;
  if (!header) {
    res.statusCode = 200;
    res.setHeader("Content-Length", size);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    pipeline(createReadStream(file), res).catch(() => res.destroy());
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${size}`);
    res.end();
    return;
  }
  let start = match[1] === "" ? NaN : Number(match[1]);
  let end = match[2] === "" ? size - 1 : Number(match[2]);
  if (Number.isNaN(start)) {
    const tail = end;
    start = Math.max(0, size - tail);
    end = size - 1;
  }
  if (start < 0 || start >= size || end < start) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${size}`);
    res.end();
    return;
  }
  end = Math.min(end, size - 1);
  res.statusCode = 206;
  res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.setHeader("Content-Length", end - start + 1);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  pipeline(createReadStream(file, { start, end }), res).catch(() => res.destroy());
}

async function serveSigned(req, res, signed) {
  const parsed = parseBeatSignUrl(signed, SUPABASE);
  if (!parsed) {
    res.statusCode = 400;
    res.end();
    return;
  }
  const file = await fill(parsed.bucket, parsed.objectKey);
  const size = await fileSize(file);
  let contentType = "application/octet-stream";
  try {
    const stored = (await readFile(`${file}.type`, "utf8")).trim();
    if (stored) contentType = stored;
  } catch {
    contentType = "application/octet-stream";
  }
  sendRange(req, res, file, size, contentType, parsed.download);
}

async function prefill() {
  if (!CACHE || !SUPABASE.startsWith("https://") || !SERVICE) {
    console.log(JSON.stringify({ event: "audio_edge_prefill_refused" }));
    process.exit(1);
  }
  const listUrl = `${SUPABASE}/rest/v1/beat_audio_assets?select=storage_bucket,object_key,purpose&is_active=eq.true&status=eq.READY&purpose=in.(PREVIEW,MASTER)`;
  const response = await fetch(listUrl, {
    headers: {
      authorization: `Bearer ${SERVICE}`,
      apikey: SERVICE,
      accept: "application/json",
    },
    redirect: "manual",
  });
  if (response.status !== 200) {
    console.log(JSON.stringify({ event: "audio_edge_prefill_list_failed", status: response.status }));
    process.exit(1);
  }
  const rows = await response.json();
  let skipped = 0;
  let stored = 0;
  let failed = 0;
  let bytes = 0;
  for (const row of rows) {
    if (row.storage_bucket !== "beat-audio" || typeof row.object_key !== "string") {
      failed += 1;
      continue;
    }
    const { file } = cachePaths(row.storage_bucket, row.object_key);
    if (await fileSize(file)) {
      skipped += 1;
      bytes += await fileSize(file);
      continue;
    }
    try {
      await fill(row.storage_bucket, row.object_key);
      stored += 1;
      bytes += await fileSize(file);
    } catch {
      failed += 1;
    }
  }
  console.log(JSON.stringify({
    event: "audio_edge_prefill_done",
    rows: rows.length,
    stored,
    skipped,
    failed,
    bytes,
  }));
}

function listen() {
  if (!CACHE || !SUPABASE.startsWith("https://") || !SERVICE) {
    console.log(JSON.stringify({ event: "audio_edge_refused" }));
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    const ip = clientIp(req);
    if (!allow(ip, req.url === "/healthz" ? 600 : 180)) {
      res.statusCode = 429;
      res.end();
      return;
    }
    if (req.method === "GET" && req.url === "/healthz") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.end();
      return;
    }
    let signed = "";
    try {
      signed = new URL(req.url || "/", "http://127.0.0.1").searchParams.get("u") || "";
    } catch {
      signed = "";
    }
    if (!req.url?.startsWith("/s?")) {
      res.statusCode = 404;
      res.end();
      return;
    }
    serveSigned(req, res, signed).catch((error) => {
      const status = Number(error?.status) || 502;
      if (!res.headersSent) res.statusCode = status;
      res.end();
      console.log(JSON.stringify({ event: "audio_edge_miss_failed", status }));
    });
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(JSON.stringify({ event: "audio_edge_listen", port: PORT }));
  });
}

if (process.argv[2] === "prefill") {
  prefill().catch(() => {
    console.log(JSON.stringify({ event: "audio_edge_prefill_failed" }));
    process.exit(1);
  });
} else {
  listen();
}
