/**
 * FAR-01 production dry-run — least-privilege credential boundary (IA-5 / R1).
 *
 * Env **names** only. Never embeds secrets.
 * Does NOT use createSupabaseAdminClient / service-role as default or fallback.
 *
 * Transport (Data API + Storage via supabase-js@2.117.2):
 *   apikey        = publishable/anon project API key
 *   Authorization = Bearer R1 JWT (role=far01_dryrun_readonly) via accessToken
 *
 * Required:
 *   FAR01_DRYRUN_SUPABASE_URL
 *   FAR01_DRYRUN_READONLY_KEY          (R1 JWT only — NOT apikey)
 *   FAR01_DRYRUN_CREDENTIAL_CLASS=readonly
 *   FAR01_DRYRUN_API_KEY               (preferred)
 *     or NEXT_PUBLIC_SUPABASE_ANON_KEY (allowed fallback)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { Far01CredentialGateError } from "./errors";

/** Config contract — names only; values never committed. */
export const FAR01_DRYRUN_ENV = {
  url: "FAR01_DRYRUN_SUPABASE_URL",
  key: "FAR01_DRYRUN_READONLY_KEY",
  credentialClass: "FAR01_DRYRUN_CREDENTIAL_CLASS",
  /** Project publishable/anon API key for `apikey` header only. */
  apiKey: "FAR01_DRYRUN_API_KEY",
  /** Allowed fallback for apikey (public anon key used by the app). */
  anonKeyFallback: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
} as const;

export const FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS = "readonly" as const;

export type Far01DryRunReadonlyCredentials = {
  url: string;
  /** R1 JWT — Authorization Bearer only. */
  key: string;
  credentialClass: typeof FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS;
};

export type Far01DryRunClientTransport = {
  url: string;
  /** Project API key for `apikey` header (anon/publishable). */
  apiKey: string;
  /** R1 JWT for Authorization Bearer. */
  r1Jwt: string;
  credentialClass: typeof FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS;
};

export type Far01EnvMap = Record<string, string | undefined>;

function readEnv(env: Far01EnvMap, name: string): string | undefined {
  const v = env[name];
  if (v == null) return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function assertNotServiceRoleOrSecretApiKey(params: {
  apiKey: string;
  serviceRole: string | undefined;
}): void {
  if (params.serviceRole && params.apiKey === params.serviceRole) {
    throw new Far01CredentialGateError(
      "API key denied: must not equal SUPABASE_SERVICE_ROLE_KEY. Service-role fallback is forbidden.",
    );
  }
  if (params.apiKey.startsWith("sb_secret_")) {
    throw new Far01CredentialGateError(
      "API key denied: sb_secret_ keys are forbidden for FAR-01 dry-run (use anon/publishable only).",
    );
  }
}

/**
 * Resolve project API key for gateway `apikey` header.
 * Prefer FAR01_DRYRUN_API_KEY; else NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function resolveFar01DryRunApiKey(
  env: Far01EnvMap = process.env,
): string {
  const explicit = readEnv(env, FAR01_DRYRUN_ENV.apiKey);
  const fallback = readEnv(env, FAR01_DRYRUN_ENV.anonKeyFallback);
  const apiKey = explicit ?? fallback;
  if (!apiKey) {
    throw new Far01CredentialGateError(
      `Missing ${FAR01_DRYRUN_ENV.apiKey} (or ${FAR01_DRYRUN_ENV.anonKeyFallback}): publishable/anon API key required for Data API apikey. Fail closed.`,
    );
  }
  assertNotServiceRoleOrSecretApiKey({
    apiKey,
    serviceRole: readEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
  });
  return apiKey;
}

/**
 * Resolve R1 JWT credentials. Never falls back to service-role.
 */
export function resolveFar01DryRunReadonlyCredentials(
  env: Far01EnvMap = process.env,
): Far01DryRunReadonlyCredentials {
  const url = readEnv(env, FAR01_DRYRUN_ENV.url);
  const key = readEnv(env, FAR01_DRYRUN_ENV.key);
  const credentialClass = readEnv(env, FAR01_DRYRUN_ENV.credentialClass);

  if (!url) {
    throw new Far01CredentialGateError(
      `Missing ${FAR01_DRYRUN_ENV.url}: read-only dry-run credentials required (R1). Fail closed.`,
    );
  }
  if (!key) {
    throw new Far01CredentialGateError(
      `Missing ${FAR01_DRYRUN_ENV.key}: read-only dry-run credentials required (R1). Fail closed.`,
    );
  }
  if (credentialClass !== FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS) {
    throw new Far01CredentialGateError(
      `Invalid ${FAR01_DRYRUN_ENV.credentialClass}: expected "${FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS}", got ${
        credentialClass == null ? "<missing>" : JSON.stringify(credentialClass)
      }. Fail closed.`,
    );
  }

  const serviceRole = readEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRole && key === serviceRole) {
    throw new Far01CredentialGateError(
      "Credential class denied: FAR01_DRYRUN_READONLY_KEY must not equal SUPABASE_SERVICE_ROLE_KEY. Service-role fallback is forbidden.",
    );
  }

  if (readEnv(env, "FAR01_DRYRUN_USE_SERVICE_ROLE") === "1") {
    throw new Far01CredentialGateError(
      "FAR01_DRYRUN_USE_SERVICE_ROLE is forbidden. R1 read-only only; no service-role fallback.",
    );
  }

  // R1/LIVE separation — never accept LIVE JWT on dry-run path.
  // (wrong class already fail-closed above as !== readonly)
  const liveKey = readEnv(env, "FAR01_LIVE_MUTATOR_KEY");
  if (liveKey && key === liveKey) {
    throw new Far01CredentialGateError(
      "Dry-run denied: R1 key must not equal LIVE mutator key",
    );
  }
  const jwtRole = decodeJwtRoleClaim(key);
  if (jwtRole === "far01_live_mutator") {
    throw new Far01CredentialGateError(
      "Dry-run denied: R1 JWT must not claim far01_live_mutator",
    );
  }

  return {
    url,
    key,
    credentialClass: FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS,
  };
}

function decodeJwtRoleClaim(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad =
      parts[1]!.length % 4 === 0 ? "" : "=".repeat(4 - (parts[1]!.length % 4));
    const json = Buffer.from(
      parts[1]!.replace(/-/g, "+").replace(/_/g, "/") + pad,
      "base64",
    ).toString("utf8");
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * Resolve full transport: API key (apikey) + R1 JWT (Authorization).
 * Guarantees apiKey !== r1Jwt.
 */
export function resolveFar01DryRunClientTransport(
  env: Far01EnvMap = process.env,
): Far01DryRunClientTransport {
  const creds = resolveFar01DryRunReadonlyCredentials(env);
  const apiKey = resolveFar01DryRunApiKey(env);

  if (apiKey === creds.key) {
    throw new Far01CredentialGateError(
      "Transport denied: API key must not equal FAR01_DRYRUN_READONLY_KEY (R1 JWT must not be used as apikey).",
    );
  }

  return {
    url: creds.url,
    apiKey,
    r1Jwt: creds.key,
    credentialClass: creds.credentialClass,
  };
}

/**
 * Args for createClient — exported for contract tests (no secrets logged).
 */
export function buildFar01DryRunCreateClientArgs(env: Far01EnvMap = process.env): {
  url: string;
  apiKey: string;
  r1Jwt: string;
  options: {
    accessToken: () => Promise<string>;
    auth: { persistSession: false; autoRefreshToken: false };
  };
} {
  const transport = resolveFar01DryRunClientTransport(env);
  const r1Jwt = transport.r1Jwt;
  return {
    url: transport.url,
    apiKey: transport.apiKey,
    r1Jwt,
    options: {
      accessToken: async () => r1Jwt,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  };
}

/**
 * Create a Supabase client for dry-run read path only.
 * Adapter layers must expose SELECT / Storage metadata exclusively.
 */
export function createFar01DryRunReadonlyClient(
  env: Far01EnvMap = process.env,
): SupabaseClient {
  const args = buildFar01DryRunCreateClientArgs(env);
  return createClient(args.url, args.apiKey, args.options);
}

/** Assert caller did not request service-role dry-run path. */
export function assertFar01DryRunNotUsingAdminClient(params: {
  usingAdminClient: boolean;
}): void {
  if (params.usingAdminClient) {
    throw new Far01CredentialGateError(
      "createSupabaseAdminClient is forbidden for FAR-01 production dry-run (R1).",
    );
  }
}
