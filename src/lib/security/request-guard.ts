import { clientIpOrNull } from "@/lib/security/client-ip";

/**
 * Overload guard (2026-11-23, after the Vercel pause): one address may not flood the server.
 * Counted per instance in memory, before any database call. Far above normal use: a page view is
 * one request now that links load on intent only. Env OVERLOAD_GUARD=0 turns it off.
 */
export const GUARD_WINDOW_MS = 60_000;
/** Visitors and bots. */
export const GUEST_LIMIT = 240;
/** Any request that carries a session cookie or a bearer (Studio polls and autosaves). */
export const SIGNED_IN_LIMIT = 1200;
export const GUARD_RETRY_AFTER_SECONDS = 60;
const MAX_KEYS = 20_000;

/** Payments, cron jobs, health checks and app links must never be refused here. */
const NEVER_LIMITED = ["/api/webhooks/", "/api/cron/", "/api/health/", "/auth/callback"];

export function isGuardExempt(pathname: string): boolean {
  return NEVER_LIMITED.some((prefix) => pathname.startsWith(prefix));
}

export function createRequestGuard(options: { windowMs?: number; maxKeys?: number } = {}) {
  const windowMs = options.windowMs ?? GUARD_WINDOW_MS;
  const maxKeys = options.maxKeys ?? MAX_KEYS;
  let hits = new Map<string, { start: number; count: number }>();
  return {
    allow(key: string, limit: number, now: number = Date.now()): boolean {
      const entry = hits.get(key);
      if (!entry || now - entry.start >= windowMs) {
        if (hits.size >= maxKeys) hits = new Map();
        hits.set(key, { start: now, count: 1 });
        return true;
      }
      entry.count += 1;
      return entry.count <= limit;
    },
    clear() {
      hits = new Map();
    },
  };
}

const guard = createRequestGuard();

export function resetRequestGuardForTests() {
  guard.clear();
}

/** True when this request goes over the limit for its address. */
export function isOverloadRequest(
  request: { headers: Pick<Headers, "get">; pathname: string; hasSession: boolean },
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.OVERLOAD_GUARD === "0" || isGuardExempt(request.pathname)) return false;
  const ip = clientIpOrNull(request.headers);
  if (!ip) return false;
  // Separate counters: a guest flood from a shared address does not lock out signed-in users there.
  return request.hasSession ? !guard.allow(`s:${ip}`, SIGNED_IN_LIMIT) : !guard.allow(`g:${ip}`, GUEST_LIMIT);
}
