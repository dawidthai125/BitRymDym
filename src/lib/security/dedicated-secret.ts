import "server-only";

/**
 * Dedicated HMAC secrets (security review 2026-11-21, L2).
 * The Supabase service-role key must not double as an HMAC key: its derived
 * values then travel in URLs / cookies and a rotation of one breaks the other.
 *
 * Rules:
 * - sign with the dedicated env secret;
 * - the service-role key is never a fallback (removed 2026-11-22: both dedicated
 *   secrets are set in production and preview, no active listen link was signed
 *   with it, and reset seals live minutes);
 * - explicit legacy keys (e.g. an old env name) are verify-only plus a warned
 *   signing fallback when the dedicated env is missing;
 * - nothing configured → signing null; callers fail closed.
 */
export type DedicatedSecret = {
  /** Key for new signatures; null when nothing is configured. */
  signing: string | null;
  /** True when `signing` is an explicit legacy key (dedicated env missing). */
  signingIsLegacy: boolean;
  /** Keys accepted on verification, dedicated first, without duplicates. */
  verify: string[];
};

const warned = new Set<string>();

export function resolveDedicatedSecret(
  name: string,
  options: {
    /** Explicit legacy keys still accepted on verification, in order. Never the service-role key. */
    legacy?: Array<string | null | undefined>;
    env?: Record<string, string | undefined>;
    warn?: (message: string) => void;
  } = {},
): DedicatedSecret {
  const env = options.env ?? process.env;
  const dedicated = env[name]?.trim() || null;
  const legacy = (options.legacy ?? [])
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
