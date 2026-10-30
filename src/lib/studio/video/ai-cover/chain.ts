/**
 * Provider chain with failover: each provider gets its own timeout; on error / 429 / limit /
 * timeout the next one is tried. Daily-limit exhaustion (and Retry-After / short cool-downs
 * after timeouts and outages) is remembered in a {@link ProviderStateStore} so the provider is
 * skipped until it resets — across serverless instances when the store is the DB.
 */
import { AiImageError, type AiImageInput, type AiImageProvider, type AiProviderId } from "./providers";

export interface ProviderStateStore {
  /** Epoch ms until which each provider is skipped (missing = usable). */
  blockedUntil(ids: AiProviderId[]): Promise<Partial<Record<AiProviderId, number>>>;
  block(id: AiProviderId, untilMs: number, reason: string): Promise<void>;
}

export function memoryProviderState(): ProviderStateStore & { snapshot(): Partial<Record<AiProviderId, number>> } {
  const m: Partial<Record<AiProviderId, number>> = {};
  return {
    async blockedUntil(ids) {
      return Object.fromEntries(ids.filter((i) => m[i] != null).map((i) => [i, m[i]!]));
    },
    async block(id, until) {
      m[id] = Math.max(m[id] ?? 0, until);
    },
    snapshot: () => ({ ...m }),
  };
}

/** Short cool-down after a timeout / outage so the next user doesn't wait 25 s on a dead provider. */
export const AI_PROVIDER_COOLDOWN_MS: Partial<Record<string, number>> = {
  timeout: 2 * 60_000,
  server: 2 * 60_000,
  network: 2 * 60_000,
  auth: 60 * 60_000,
};

export type ChainAttempt = { provider: AiProviderId; outcome: "ok" | "skipped" | AiImageError["kind"]; ms: number };
export type ChainResult = { ok: true; image: Buffer; provider: AiProviderId; attempts: ChainAttempt[] } | { ok: false; attempts: ChainAttempt[] };

export async function runAiImageChain(
  providers: AiImageProvider[],
  input: AiImageInput,
  opts: { timeoutMs: number; state: ProviderStateStore; now?: () => number },
): Promise<ChainResult> {
  const now = opts.now ?? Date.now;
  const attempts: ChainAttempt[] = [];
  let blocked: Partial<Record<AiProviderId, number>> = {};
  try {
    blocked = await opts.state.blockedUntil(providers.map((p) => p.id));
  } catch {
    blocked = {}; // state store down → just try everything
  }
  for (const p of providers) {
    if ((blocked[p.id] ?? 0) > now()) {
      attempts.push({ provider: p.id, outcome: "skipped", ms: 0 });
      continue;
    }
    const started = now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
      const image = await Promise.race([
        p.generate(input, ctrl.signal),
        new Promise<never>((_, rej) => ctrl.signal.addEventListener("abort", () => rej(new AiImageError("timeout")), { once: true })),
      ]);
      attempts.push({ provider: p.id, outcome: "ok", ms: now() - started });
      return { ok: true, image, provider: p.id, attempts };
    } catch (e) {
      const err = e instanceof AiImageError ? e : new AiImageError(ctrl.signal.aborted ? "timeout" : "network");
      attempts.push({ provider: p.id, outcome: err.kind, ms: now() - started });
      const until = err.blockedUntil ?? (AI_PROVIDER_COOLDOWN_MS[err.kind] != null ? now() + AI_PROVIDER_COOLDOWN_MS[err.kind]! : null);
      if (until != null) await opts.state.block(p.id, until, err.kind).catch(() => {});
    } finally {
      clearTimeout(timer);
      ctrl.abort();
    }
  }
  return { ok: false, attempts };
}
