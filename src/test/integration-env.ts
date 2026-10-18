/**
 * Single gate for tests that talk to a real Supabase stack (integration / live).
 *
 * Contract:
 * - Never reads `.env.local` (production credentials) or the app's
 *   NEXT_PUBLIC_* / SUPABASE_* variables — only LOCAL_SUPABASE_* (values from
 *   `supabase status -o env`).
 * - Disabled unless BRD_INTEGRATION_TESTS=1. Fixtures never enable a test on
 *   their own; they are checked only after the opt-in.
 * - Once opted in, any misconfiguration throws before the first client is
 *   created. The host allowlist (loopback only) has no override.
 * - Error messages carry variable names and hostnames, never key values.
 */
import { existsSync } from "node:fs";

export const INTEGRATION_OPT_IN_VAR = "BRD_INTEGRATION_TESTS";
export const LOCAL_URL_VAR = "LOCAL_SUPABASE_URL";
export const LOCAL_ANON_KEY_VAR = "LOCAL_SUPABASE_ANON_KEY";
export const LOCAL_SERVICE_KEY_VAR = "LOCAL_SUPABASE_SERVICE_ROLE_KEY";

const ALLOWED_TEST_HOSTS: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
]);

const NETWORK_PROTOCOLS: ReadonlySet<string> = new Set([
  "http:",
  "https:",
  "ws:",
  "wss:",
]);

export class IntegrationEnvError extends Error {
  constructor(message: string) {
    super(`[integration-env] ${message}`);
    this.name = "IntegrationEnvError";
  }
}

export function isAllowedTestHost(hostname: string): boolean {
  return ALLOWED_TEST_HOSTS.has(hostname.toLowerCase());
}

/** Network URLs must target loopback; non-network schemes (data:, blob:, file:) pass. */
export function isAllowedTestUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (!NETWORK_PROTOCOLS.has(parsed.protocol)) return true;
  return isAllowedTestHost(parsed.hostname);
}

/** Hostname for diagnostics only — never the full URL (it may embed credentials). */
export function describeHost(raw: string): string {
  try {
    return new URL(raw).hostname || "(empty host)";
  } catch {
    return "(unparseable URL)";
  }
}

export function assertAllowedTestUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new IntegrationEnvError(`${LOCAL_URL_VAR} is not a valid URL.`);
  }
  if (!NETWORK_PROTOCOLS.has(parsed.protocol) || !isAllowedTestHost(parsed.hostname)) {
    throw new IntegrationEnvError(
      `refusing non-local Supabase host "${describeHost(raw)}"; only loopback (127.0.0.1, localhost, ::1) is allowed.`,
    );
  }
}

export type IntegrationEnv =
  | { enabled: false; reason: string }
  | { enabled: true; url: string; anonKey: string; serviceKey: string };

export type ResolveIntegrationEnvOptions = {
  /** Required test asset; checked only after the opt-in. */
  fixturePath?: string;
  source?: Readonly<Record<string, string | undefined>>;
  fixtureExists?: (path: string) => boolean;
};

export function resolveIntegrationEnv(
  options: ResolveIntegrationEnvOptions = {},
): IntegrationEnv {
  const source = options.source ?? process.env;
  if (source[INTEGRATION_OPT_IN_VAR] !== "1") {
    return {
      enabled: false,
      reason: `${INTEGRATION_OPT_IN_VAR}=1 not set (integration tests are opt-in).`,
    };
  }

  const url = source[LOCAL_URL_VAR]?.trim() ?? "";
  const anonKey = source[LOCAL_ANON_KEY_VAR]?.trim() ?? "";
  const serviceKey = source[LOCAL_SERVICE_KEY_VAR]?.trim() ?? "";
  const missing = [
    [LOCAL_URL_VAR, url],
    [LOCAL_ANON_KEY_VAR, anonKey],
    [LOCAL_SERVICE_KEY_VAR, serviceKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new IntegrationEnvError(
      `${INTEGRATION_OPT_IN_VAR}=1 but missing: ${missing.join(", ")}. Use values from \`supabase status -o env\`.`,
    );
  }

  assertAllowedTestUrl(url);

  if (options.fixturePath) {
    const exists = options.fixtureExists ?? existsSync;
    if (!exists(options.fixturePath)) {
      throw new IntegrationEnvError(
        `required fixture is missing: ${options.fixturePath}`,
      );
    }
  }

  return { enabled: true, url, anonKey, serviceKey };
}

/**
 * Points app code that reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * (e.g. createSupabaseAdminClient) at the validated local stack.
 */
export function applyIntegrationEnv(
  env: Extract<IntegrationEnv, { enabled: true }>,
  target: Record<string, string | undefined> = process.env,
): void {
  assertAllowedTestUrl(env.url);
  target.NEXT_PUBLIC_SUPABASE_URL = env.url;
  target.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
  target.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey;
}
