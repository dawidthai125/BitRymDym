import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "server-only";

/**
 * Premium Retention worker client (G3-TCB, PREMIUM_RETENTION_FENCING_CONTRACT.md).
 *
 * Transport (same pattern as FAR-01 readonly client):
 *   apikey        = NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   Authorization = Bearer PREMIUM_RETENTION_WORKER_JWT (role=premium_retention_worker)
 *
 * The role has no table DML; logical deletes are reachable only through fenced RPCs.
 * Never falls back to the service-role key.
 */

export const PREMIUM_RETENTION_WORKER_ROLE = "premium_retention_worker" as const;

export const PREMIUM_RETENTION_WORKER_ENV = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  apiKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  jwt: "PREMIUM_RETENTION_WORKER_JWT",
} as const;

export class PremiumRetentionWorkerCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PremiumRetentionWorkerCredentialError";
  }
}

type EnvMap = Record<string, string | undefined>;

function decodeJwtRole(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * Resolve worker transport. Throws (fail-closed) when the credential is missing,
 * malformed, carries another role, or equals the service-role key.
 */
export function resolvePremiumRetentionWorkerTransport(env: EnvMap = process.env): {
  url: string;
  apiKey: string;
  jwt: string;
} {
  const url = env[PREMIUM_RETENTION_WORKER_ENV.url]?.trim();
  const apiKey = env[PREMIUM_RETENTION_WORKER_ENV.apiKey]?.trim();
  const jwt = env[PREMIUM_RETENTION_WORKER_ENV.jwt]?.trim();

  if (!url || !apiKey || !jwt) {
    throw new PremiumRetentionWorkerCredentialError(
      "PREMIUM_RETENTION_WORKER_CREDENTIAL_MISSING",
    );
  }
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (
    (serviceKey && (jwt === serviceKey || apiKey === serviceKey)) ||
    apiKey.startsWith("sb_secret_") ||
    jwt.startsWith("sb_secret_") ||
    decodeJwtRole(apiKey) === "service_role"
  ) {
    throw new PremiumRetentionWorkerCredentialError(
      "PREMIUM_RETENTION_WORKER_CREDENTIAL_IS_SERVICE_ROLE",
    );
  }
  if (decodeJwtRole(jwt) !== PREMIUM_RETENTION_WORKER_ROLE) {
    throw new PremiumRetentionWorkerCredentialError(
      "PREMIUM_RETENTION_WORKER_CREDENTIAL_WRONG_ROLE",
    );
  }
  return { url, apiKey, jwt };
}

export function createPremiumRetentionWorkerClient(
  env: EnvMap = process.env,
): SupabaseClient {
  const { url, apiKey, jwt } = resolvePremiumRetentionWorkerTransport(env);
  return createClient(url, apiKey, {
    accessToken: async () => jwt,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
