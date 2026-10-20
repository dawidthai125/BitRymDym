/**
 * WAVE 1-D — fail-closed Storage host guard for ops scripts (TypeScript SSOT).
 * ESM scripts import the sibling `scripts/lib/storage-host-guard.mjs` (keep in sync).
 */

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export const PROD_STORAGE_ALLOW_ENV = "BRD_ALLOW_PROD_STORAGE" as const;
export const PROD_STORAGE_SCRIPT_ENV = "BRD_PROD_STORAGE_SCRIPT" as const;

export class StorageHostGuardError extends Error {
  constructor(message: string) {
    super(`[storage-host-guard] ${message}`);
    this.name = "StorageHostGuardError";
  }
}

export function describeStorageHost(raw: string): string {
  try {
    return new URL(raw).hostname || "(empty host)";
  } catch {
    return "(unparseable URL)";
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK.has(String(hostname || "").toLowerCase());
}

export type StorageUrlClassification = {
  ok: boolean;
  kind:
    | "loopback"
    | "staging"
    | "prod_explicit"
    | "invalid_url"
    | "invalid_protocol"
    | "supabase_remote"
    | "unknown_remote";
  hostname: string;
};

export function classifyStorageUrl(
  raw: string,
  options: { stagingHosts?: Iterable<string> } = {},
): StorageUrlClassification {
  let parsed: URL;
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
    [...(options.stagingHosts ?? [])].map((h) => String(h).toLowerCase()),
  );
  if (staging.has(hostname)) {
    return { ok: true, kind: "staging", hostname };
  }
  if (hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.in")) {
    return { ok: false, kind: "supabase_remote", hostname };
  }
  return { ok: false, kind: "unknown_remote", hostname };
}

export function assertScriptStorageTarget(params: {
  scriptId: string;
  supabaseUrl: string | null | undefined;
  env?: Record<string, string | undefined>;
  stagingHosts?: Iterable<string>;
}): StorageUrlClassification {
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
