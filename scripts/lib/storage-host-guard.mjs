/**
 * WAVE 1-D — fail-closed Storage host guard for ops scripts.
 * Call before download / createSignedUrl / Storage fetch.
 * Never logs secrets or full signed URLs.
 */

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Optional explicit staging hosts (hostname only). Empty by default. */
const DEFAULT_STAGING_HOSTS = new Set([]);

export const PROD_STORAGE_ALLOW_ENV = "BRD_ALLOW_PROD_STORAGE";
export const PROD_STORAGE_SCRIPT_ENV = "BRD_PROD_STORAGE_SCRIPT";

export class StorageHostGuardError extends Error {
  constructor(message) {
    super(`[storage-host-guard] ${message}`);
    this.name = "StorageHostGuardError";
  }
}

export function describeStorageHost(raw) {
  try {
    return new URL(raw).hostname || "(empty host)";
  } catch {
    return "(unparseable URL)";
  }
}

export function isLoopbackHostname(hostname) {
  return LOOPBACK.has(String(hostname || "").toLowerCase());
}

/**
 * @param {string} raw
 * @param {{ stagingHosts?: Iterable<string> }} [options]
 */
export function classifyStorageUrl(raw, options = {}) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, kind: "invalid_url", hostname: "(unparseable URL)" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, kind: "invalid_protocol", hostname: parsed.hostname };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (isLoopbackHostname(hostname)) {
    return { ok: true, kind: "loopback", hostname };
  }
  const staging = new Set(
    [...(options.stagingHosts ?? DEFAULT_STAGING_HOSTS)].map((h) =>
      String(h).toLowerCase(),
    ),
  );
  if (staging.has(hostname)) {
    return { ok: true, kind: "staging", hostname };
  }
  if (hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.in")) {
    return { ok: false, kind: "supabase_remote", hostname };
  }
  return { ok: false, kind: "unknown_remote", hostname };
}

/**
 * Production Storage requires BOTH:
 * - BRD_ALLOW_PROD_STORAGE=1
 * - BRD_PROD_STORAGE_SCRIPT=<exact scriptId>
 * Global flag alone is never enough.
 *
 * @param {{
 *   scriptId: string,
 *   supabaseUrl: string | null | undefined,
 *   env?: Record<string, string | undefined>,
 *   stagingHosts?: Iterable<string>,
 * }} params
 */
export function assertScriptStorageTarget(params) {
  const env = params.env ?? process.env;
  const scriptId = String(params.scriptId || "").trim();
  if (!scriptId) {
    throw new StorageHostGuardError("scriptId is required.");
  }
  const url = String(params.supabaseUrl || "").trim();
  if (!url) {
    throw new StorageHostGuardError(
      `refusing Storage ops for script "${scriptId}": missing Supabase URL.`,
    );
  }

  const classified = classifyStorageUrl(url, {
    stagingHosts: params.stagingHosts,
  });
  if (classified.ok) {
    return classified;
  }

  if (
    classified.kind === "invalid_url" ||
    classified.kind === "invalid_protocol"
  ) {
    throw new StorageHostGuardError(
      `refusing Storage ops for script "${scriptId}": invalid Supabase URL (${classified.hostname}).`,
    );
  }

  const allowProd = String(env[PROD_STORAGE_ALLOW_ENV] || "").trim() === "1";
  const allowScript = String(env[PROD_STORAGE_SCRIPT_ENV] || "").trim();
  if (allowProd && allowScript === scriptId) {
    return { ok: true, kind: "prod_explicit", hostname: classified.hostname };
  }

  if (allowProd && allowScript && allowScript !== scriptId) {
    throw new StorageHostGuardError(
      `refusing remote host "${classified.hostname}" for script "${scriptId}": ${PROD_STORAGE_SCRIPT_ENV} is set to a different script id.`,
    );
  }

  if (allowProd && !allowScript) {
    throw new StorageHostGuardError(
      `refusing remote host "${classified.hostname}" for script "${scriptId}": ${PROD_STORAGE_ALLOW_ENV}=1 requires ${PROD_STORAGE_SCRIPT_ENV}=${scriptId}.`,
    );
  }

  throw new StorageHostGuardError(
    `refusing remote host "${classified.hostname}" for script "${scriptId}": production/remote Storage is blocked by default. Use local Supabase, or set ${PROD_STORAGE_ALLOW_ENV}=1 and ${PROD_STORAGE_SCRIPT_ENV}=${scriptId} for an explicit Owner-approved run.`,
  );
}
