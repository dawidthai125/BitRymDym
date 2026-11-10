import { createHash } from "node:crypto";

/** Same digest as src/lib/audio/object-disk-cache.ts so the worker and this edge share files. */
export function objectCacheName(bucket, objectKey) {
  return createHash("sha256").update(`${bucket}\n${objectKey}`).digest("hex");
}

const SIGN_PREFIX = "/storage/v1/object/sign/beat-audio/";

/**
 * A Supabase signed URL for the private beat-audio bucket.
 * Returns null for anything else, so the edge cannot be turned into an open proxy.
 */
export function parseBeatSignUrl(raw, supabaseOrigin) {
  if (typeof raw !== "string" || raw.length < 20 || raw.length > 4096) return null;
  let url;
  let allowed;
  try {
    url = new URL(raw);
    allowed = new URL(supabaseOrigin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || allowed.protocol !== "https:") return null;
  if (url.hostname !== allowed.hostname) return null;
  if (url.port !== "" && url.port !== "443") return null;
  if (!url.pathname.startsWith(SIGN_PREFIX) || url.pathname.includes("..")) return null;
  const objectKey = decodeURIComponent(url.pathname.slice(SIGN_PREFIX.length));
  if (!/^[A-Za-z0-9._/-]{1,512}$/.test(objectKey) || objectKey.startsWith("/") || objectKey.includes("..")) {
    return null;
  }
  return {
    bucket: "beat-audio",
    objectKey,
    download: url.searchParams.has("download"),
  };
}

/** Browser and the Windows program fetch this. The signed URL stays inside the query. */
export function publicEdgeUrl(origin, signedUrl) {
  const base = origin.trim().replace(/\/$/, "");
  if (!base.startsWith("https://")) return signedUrl;
  return `${base}/s?u=${encodeURIComponent(signedUrl)}`;
}
