/**
 * FAR-01 LIVE mutator credential boundary (GC-LIVE-CRED-01).
 *
 * R1 (far01_dryrun_readonly / class=readonly) = read-only dry-run only.
 * LIVE (far01_live_mutator / class=live_mutator) = write-scoped mutator only.
 *
 * Env **names** + resolve/create client helpers. Never embeds secrets.
 * Never uses createSupabaseAdminClient / service-role as default or fallback.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { Far01CredentialGateError } from "./errors";
import {
  FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS,
  type Far01EnvMap,
} from "./readonly-client";

/** Env names for LIVE mutator credential (values never committed). */
export const FAR01_LIVE_ENV = {
  url: "FAR01_LIVE_SUPABASE_URL",
  /** LIVE mutator JWT — Authorization Bearer only (role=far01_live_mutator). */
  key: "FAR01_LIVE_MUTATOR_KEY",
  credentialClass: "FAR01_LIVE_CREDENTIAL_CLASS",
  /** Project publishable/anon API key for `apikey` header only. */
  apiKey: "FAR01_LIVE_API_KEY",
  anonKeyFallback: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
} as const;

/** Postgres role claim expected on LIVE JWT. */
export const FAR01_LIVE_POSTGRES_ROLE = "far01_live_mutator" as const;

/**
 * Required credential class for LIVE mutators.
 * Distinct from R1 `readonly`.
 */
export const FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS = "live_mutator" as const;

export type Far01LiveMutatorCredentials = {
  url: string;
  key: string;
  credentialClass: typeof FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS;
};

export type Far01LiveClientTransport = {
  url: string;
  apiKey: string;
  liveJwt: string;
  credentialClass: typeof FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS;
};

function readEnv(env: Far01EnvMap, name: string): string | undefined {
  const v = env[name];
  if (v == null) return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Dry-run path must reject LIVE credential class (and vice versa).
 */
export function assertCredentialClassIsDryRunReadonly(
  credentialClass: string | undefined,
): void {
  if (credentialClass !== FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS) {
    throw new Far01CredentialGateError(
      `Dry-run denied: credential class must be "${FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS}" (got ${credentialClass ?? "missing"}). LIVE mutator credentials are rejected on the R1 path.`,
    );
  }
}

/**
 * LIVE path must reject R1 readonly class.
 */
export function assertCredentialClassIsLiveMutator(
  credentialClass: string | undefined,
): void {
  if (credentialClass !== FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS) {
    throw new Far01CredentialGateError(
      `LIVE denied: credential class must be "${FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS}" (got ${credentialClass ?? "missing"}). R1 readonly credentials are rejected on the LIVE path.`,
    );
  }
}

function assertNotServiceRoleOrSecretApiKey(params: {
  apiKey: string;
  serviceRole: string | undefined;
}): void {
  if (params.serviceRole && params.apiKey === params.serviceRole) {
    throw new Far01CredentialGateError(
      "LIVE API key denied: must not equal SUPABASE_SERVICE_ROLE_KEY. Service-role is forbidden as default LIVE credential.",
    );
  }
  if (params.apiKey.startsWith("sb_secret_")) {
    throw new Far01CredentialGateError(
      "LIVE API key denied: sb_secret_ keys are forbidden (use anon/publishable for apikey + scoped LIVE JWT).",
    );
  }
}

function decodeJwtPayloadRole(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = parts[1]!.length % 4 === 0 ? "" : "=".repeat(4 - (parts[1]!.length % 4));
    const json = Buffer.from(
      parts[1]!.replace(/-/g, "+").replace(/_/g, "/") + pad,
      "base64",
    ).toString("utf8");
    const payload = JSON.parse(json) as { role?: unknown; exp?: unknown };
    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) {
      throw new Far01CredentialGateError(
        "LIVE denied: FAR01_LIVE_MUTATOR_KEY JWT expired",
      );
    }
    return typeof payload.role === "string" ? payload.role : null;
  } catch (err) {
    if (err instanceof Far01CredentialGateError) throw err;
    return null;
  }
}

/**
 * Resolve LIVE mutator credentials from env.
 * Fail closed if missing / wrong class / service-role apikey / R1 mix.
 * Does not connect to Production and does not mutate.
 */
export function resolveFar01LiveMutatorCredentials(
  env: Far01EnvMap = process.env,
): Far01LiveMutatorCredentials {
  const url = readEnv(env, FAR01_LIVE_ENV.url);
  const key = readEnv(env, FAR01_LIVE_ENV.key);
  const credentialClass = readEnv(env, FAR01_LIVE_ENV.credentialClass);

  if (!url) {
    throw new Far01CredentialGateError(
      `Missing ${FAR01_LIVE_ENV.url}: LIVE mutator credentials required. Fail closed.`,
    );
  }
  if (!key) {
    throw new Far01CredentialGateError(
      `Missing ${FAR01_LIVE_ENV.key}: LIVE mutator credentials required. Fail closed.`,
    );
  }

  assertCredentialClassIsLiveMutator(credentialClass);

  const dryRunClass = readEnv(env, "FAR01_DRYRUN_CREDENTIAL_CLASS");
  if (dryRunClass === FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS) {
    throw new Far01CredentialGateError(
      "LIVE denied: FAR01_DRYRUN_CREDENTIAL_CLASS must not be live_mutator (R1/LIVE mix).",
    );
  }

  const dryRunKey = readEnv(env, "FAR01_DRYRUN_READONLY_KEY");
  if (dryRunKey && dryRunKey === key) {
    throw new Far01CredentialGateError(
      "LIVE denied: FAR01_LIVE_MUTATOR_KEY must not equal FAR01_DRYRUN_READONLY_KEY (R1/LIVE mix).",
    );
  }

  const serviceRole = readEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRole && key === serviceRole) {
    throw new Far01CredentialGateError(
      "LIVE denied: FAR01_LIVE_MUTATOR_KEY must not equal SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  const roleClaim = decodeJwtPayloadRole(key);
  if (roleClaim !== FAR01_LIVE_POSTGRES_ROLE) {
    throw new Far01CredentialGateError(
      `LIVE denied: JWT role claim must be "${FAR01_LIVE_POSTGRES_ROLE}" (got ${roleClaim ?? "missing/invalid"})`,
    );
  }

  return {
    url,
    key,
    credentialClass: FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS,
  };
}

export function resolveFar01LiveApiKey(env: Far01EnvMap = process.env): string {
  const explicit = readEnv(env, FAR01_LIVE_ENV.apiKey);
  const fallback = readEnv(env, FAR01_LIVE_ENV.anonKeyFallback);
  const apiKey = explicit ?? fallback;
  if (!apiKey) {
    throw new Far01CredentialGateError(
      `Missing ${FAR01_LIVE_ENV.apiKey} (or ${FAR01_LIVE_ENV.anonKeyFallback}): publishable/anon API key required for Data API apikey. Fail closed.`,
    );
  }
  assertNotServiceRoleOrSecretApiKey({
    apiKey,
    serviceRole: readEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
  });
  return apiKey;
}

export function resolveFar01LiveClientTransport(
  env: Far01EnvMap = process.env,
): Far01LiveClientTransport {
  const creds = resolveFar01LiveMutatorCredentials(env);
  const apiKey = resolveFar01LiveApiKey(env);

  if (apiKey === creds.key) {
    throw new Far01CredentialGateError(
      "Transport denied: API key must not equal FAR01_LIVE_MUTATOR_KEY (LIVE JWT must not be used as apikey).",
    );
  }

  return {
    url: creds.url,
    apiKey,
    liveJwt: creds.key,
    credentialClass: creds.credentialClass,
  };
}

export function buildFar01LiveCreateClientArgs(env: Far01EnvMap = process.env): {
  url: string;
  apiKey: string;
  liveJwt: string;
  options: {
    accessToken: () => Promise<string>;
    auth: { persistSession: false; autoRefreshToken: false };
  };
} {
  const transport = resolveFar01LiveClientTransport(env);
  const liveJwt = transport.liveJwt;
  return {
    url: transport.url,
    apiKey: transport.apiKey,
    liveJwt,
    options: {
      accessToken: async () => liveJwt,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  };
}

/**
 * Create Supabase client for LIVE mutator path only.
 * Does not auto-run mutations. Caller must still inject adapters + A2 + LIVE mode.
 */
export function createFar01LiveMutatorClient(
  env: Far01EnvMap = process.env,
): SupabaseClient {
  const args = buildFar01LiveCreateClientArgs(env);
  return createClient(args.url, args.apiKey, args.options);
}

/** Refuse admin client wiring on LIVE path. */
export function assertFar01LiveNotUsingAdminClient(params: {
  usingAdminClient: boolean;
}): void {
  if (params.usingAdminClient) {
    throw new Far01CredentialGateError(
      "Supabase admin client is forbidden for FAR-01 LIVE mutator path",
    );
  }
}

/**
 * Deny using LIVE JWT / class on the dry-run resolver surface.
 */
export function assertDryRunEnvNotUsingLiveCredential(
  env: Far01EnvMap = process.env,
): void {
  const dryClass = readEnv(env, "FAR01_DRYRUN_CREDENTIAL_CLASS");
  if (dryClass === FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS) {
    throw new Far01CredentialGateError(
      "Dry-run denied: credential class live_mutator is forbidden on R1 path",
    );
  }
  const dryKey = readEnv(env, "FAR01_DRYRUN_READONLY_KEY");
  const liveKey = readEnv(env, FAR01_LIVE_ENV.key);
  if (dryKey && liveKey && dryKey === liveKey) {
    throw new Far01CredentialGateError(
      "Dry-run denied: R1 key must not equal LIVE mutator key",
    );
  }
  if (dryKey) {
    const role = (() => {
      try {
        return decodeJwtPayloadRole(dryKey);
      } catch {
        return null;
      }
    })();
    if (role === FAR01_LIVE_POSTGRES_ROLE) {
      throw new Far01CredentialGateError(
        "Dry-run denied: R1 JWT must not claim far01_live_mutator",
      );
    }
  }
}
