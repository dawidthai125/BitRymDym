import "server-only";

import { getSupabaseServiceRoleKey } from "@/lib/supabase/env";

/**
 * Dedicated HMAC secrets (security review 2026-11-21, L2).
 * The Supabase service-role key must not double as an HMAC key: its derived
 * values then travel in URLs / cookies and a rotation of one breaks the other.
 *
 * Rules:
 * - sign with the dedicated env secret;
 * - if that env is missing, sign with the legacy service-role key and warn once
 *   per secret name (a deploy without the new env keeps working);
 * - verify with the dedicated secret first, then the legacy keys (never sign with
 *   a legacy key while the dedicated one exists).
 *
 * TODO(2026-12-21): remove the service-role fallback (signing and verifying)
 * once LISTEN_LINK_SECRET and PASSWORD_RESET_SEAL_SECRET are set everywhere.
 */
export type DedicatedSecret = {
  /** Key for new signatures; null when nothing is configured. */
  signing: string | null;
  /** True when `signing` is a legacy key (dedicated env missing). */
  signingIsLegacy: boolean;
  /** Keys accepted on verification, dedicated first, without duplicates. */
  verify: string[];
};

const warned = new Set<string>();

export function resolveDedicatedSecret(
  name: string,
  options: {
    /** Legacy keys still accepted on verification, in order (service-role last). */
    legacy?: Array<string | null | undefined>;
    env?: Record<string, string | undefined>;
    warn?: (message: string) => void;
  } = {},
): DedicatedSecret {
  const env = options.env ?? process.env;
  const dedicated = env[name]?.trim() || null;
  const legacy = (options.legacy ?? [getSupabaseServiceRoleKey()])
    .map((s) => s?.trim() || null)
    .filter((s): s is string => !!s);
  const verify = [...new Set([...(dedicated ? [dedicated] : []), ...legacy])];
  if (dedicated) return { signing: dedicated, signingIsLegacy: false, verify };
  const signing = legacy[0] ?? null;
  if (signing && !warned.has(name)) {
    warned.add(name);
    (options.warn ?? console.warn)(
      `[security] ${name} is not set; signing with the legacy key. Add ${name} to the environment.`,
    );
  }
  return { signing, signingIsLegacy: signing !== null, verify };
}

/** Test hook: forget which names already warned. */
export function resetDedicatedSecretWarnings(): void {
  warned.clear();
}
